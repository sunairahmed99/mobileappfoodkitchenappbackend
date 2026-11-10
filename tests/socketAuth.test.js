// F. Socket.IO authentication contract.
//
// A real HTTP server + real socket.io handshakes, with every Mongoose model and
// every external service mocked. Verifies:
//   - a token-less socket may connect but receives NO room or admin history;
//   - an invalid/expired token is rejected at handshake time;
//   - the role is derived server-side, so a client-supplied role is ignored.
jest.mock('../Models/User.js', () => ({ __esModule: true, default: require('./helpers/modelMocks.cjs').User }));
jest.mock('../Models/ChatConversation.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    findOneAndUpdate: jest.fn(() => Promise.resolve({})),
  },
}));
jest.mock('../Models/ChatMessage.js', () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
    findOneAndUpdate: jest.fn(() => Promise.resolve({})),
  },
}));

import http from 'http';
import { io as ioClient } from 'socket.io-client';
import { initSocket } from '../socket.js';
import ChatConversation from '../Models/ChatConversation.js';
import ChatMessage from '../Models/ChatMessage.js';
import { User, query, userDoc, signToken, resetModelMocks } from './helpers/modelMocks.cjs';

let server;
let io;
let url;

const connect = (options = {}) =>
  new Promise((resolve, reject) => {
    const client = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, ...options });
    const timer = setTimeout(() => reject(new Error('connect timeout')), 4000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('connect_error', (error) => {
      clearTimeout(timer);
      client.close();
      reject(error);
    });
  });

beforeAll((done) => {
  server = http.createServer();
  io = initSocket(server);
  server.listen(0, () => {
    url = `http://localhost:${server.address().port}`;
    done();
  });
});

afterAll(async () => {
  await io.close();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetModelMocks();
});

describe('F. Socket.IO authentication', () => {
  test('a token-less socket connects but receives no chat history (error event instead)', async () => {
    const client = await connect();

    const observed = await new Promise((resolve) => {
      let history = null;
      client.on('chat_history', () => { history = 'history'; });
      client.on('admin_chat_history', () => { history = 'admin-history'; });
      client.on('chat_error', (payload) => resolve({ history, payload }));
      client.emit('join_chat', { room: 'chat_victim', role: 'admin', userId: 'admin-dashboard' });
    });

    expect(observed.payload.message).toMatch(/Authentication required/i);
    expect(observed.history).toBeNull();

    client.close();
  });

  test('an unauthenticated send_message is refused', async () => {
    const client = await connect();

    const observed = await new Promise((resolve) => {
      const errors = [];
      client.on('chat_error', (payload) => errors.push(payload));
      client.emit('send_message', { roomId: 'chat_victim', text: 'hello' }, (ack) => resolve({ ack, errors }));
    });

    expect(observed.ack.success).toBe(false);
    expect(observed.ack.message).toBe('Authentication required.');
    expect(observed.errors.length).toBeGreaterThan(0);

    client.close();
  });

  test('an invalid token is rejected during the handshake', async () => {
    await expect(connect({ auth: { token: 'not-a-real-token' } })).rejects.toThrow(/Authentication failed/);
  });

  test('an expired token is rejected during the handshake', async () => {
    const expired = signToken({ id: 'user-1', role: 'user' }, { expiresIn: '-10s' });
    await expect(connect({ auth: { token: expired } })).rejects.toThrow(/Authentication failed/);
  });

  test('a valid token is accepted and receives its own room history', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'user-1', id: 'user-1', role: 'user' })));
    const token = signToken({ id: 'user-1', role: 'user' });
    const client = await connect({ auth: { token } });

    const observed = await new Promise((resolve) => {
      let adminHistory = null;
      client.on('admin_chat_history', () => { adminHistory = 'leaked'; });
      client.on('chat_history', (messages) => resolve({ messages, adminHistory }));
      client.emit('join_chat', {});
    });

    expect(observed.messages).toEqual([]);
    expect(observed.adminHistory).toBeNull();

    client.close();
  });

  test('SECURITY: a client-supplied role: "admin" is ignored for a non-admin account', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'user-1', id: 'user-1', role: 'user' })));
    // The token claims admin as well - only the database role may be trusted.
    const token = signToken({ id: 'user-1', role: 'admin' });
    const client = await connect({ auth: { token } });

    const observed = await new Promise((resolve) => {
      let adminHistory = null;
      client.on('admin_chat_history', () => { adminHistory = 'leaked'; });
      client.on('chat_history', (messages) => resolve({ messages, adminHistory }));
      client.emit('join_chat', { role: 'admin', userName: 'Kitchen Admin' });
    });

    expect(observed.messages).toEqual([]);
    expect(observed.adminHistory).toBeNull();

    client.close();
  });

  test('SECURITY: an admin account does receive the admin history', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'admin-1', id: 'admin-1', role: 'admin' })));
    const token = signToken({ id: 'admin-1', role: 'admin' });
    const client = await connect({ auth: { token } });

    const [conversations] = await new Promise((resolve) => {
      client.on('admin_chat_history', (conversations) => resolve([conversations]));
      client.emit('join_chat', {});
    });

    expect(conversations).toEqual([]);

    client.close();
  });

  test('SECURITY: a socket whose user no longer exists is rejected', async () => {
    User.findById.mockImplementation(() => query(null));
    const token = signToken({ id: 'deleted-user', role: 'user' });

    await expect(connect({ auth: { token } })).rejects.toThrow(/user no longer exists/);
  });

  test('SECURITY: an authenticated customer cannot read another customer room history', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'user-1', id: 'user-1', role: 'user' })));
    const canary = {
      _id: 'msg-victim',
      roomId: 'chat_victim',
      text: 'victim private message',
      sender: 'user',
      senderName: 'Victim',
      createdAt: new Date('2026-01-01T10:00:00Z'),
      time: '10:00 AM',
    };
    ChatMessage.find.mockImplementation((filter) => ({
      sort: () => ({
        lean: () => Promise.resolve(String(filter?.roomId) === 'chat_victim' ? [canary] : []),
      }),
    }));

    const token = signToken({ id: 'user-1', role: 'user' });
    const client = await connect({ auth: { token } });

    const observed = await new Promise((resolve) => {
      client.on('chat_history', (messages) => resolve({ messages }));
      client.emit('join_chat', { room: 'chat_victim', userId: 'user-1', userName: 'Attacker' });
    });

    expect(observed.messages).toEqual([]);
    expect(observed.messages).not.toContainEqual(expect.objectContaining({ text: canary.text }));
    const queriedRooms = ChatMessage.find.mock.calls.map((call) => String(call[0]?.roomId));
    expect(queriedRooms).toContain('chat_user-1');
    expect(queriedRooms).not.toContain('chat_victim');

    client.close();
  });

  test('SECURITY: an authenticated customer cannot post into another customer room', async () => {
    User.findById.mockImplementation(() => query(userDoc({ _id: 'user-1', id: 'user-1', role: 'user' })));
    const token = signToken({ id: 'user-1', role: 'user' });
    const client = await connect({ auth: { token } });

    await new Promise((resolve) => {
      client.emit('send_message', { roomId: 'chat_victim', text: 'injected' }, (ack) => resolve(ack));
    });

    const conversationRooms = ChatConversation.findOneAndUpdate.mock.calls.map((call) =>
      String(call[0]?.roomId)
    );
    const messageRooms = ChatMessage.findOneAndUpdate.mock.calls.map((call) => String(call[0]?.roomId));
    expect([...conversationRooms, ...messageRooms]).not.toContain('chat_victim');
    expect([...conversationRooms, ...messageRooms]).toContain('chat_user-1');

    client.close();
  });
});
