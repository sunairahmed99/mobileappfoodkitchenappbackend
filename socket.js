import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import ChatConversation from './Models/ChatConversation.js';
import ChatMessage from './Models/ChatMessage.js';
import User from './Models/User.js';
import { getJwtSecret } from './Config/jwt.js';

let io = null;

/**
 * Reads the JWT from the Socket.IO handshake.
 * Preferred (mobile app): io(BASE_URL, { auth: { token } })
 * Also accepted for compatibility: Authorization: Bearer <token>
 */
function extractHandshakeToken(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const header = socket.handshake?.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  return null;
}

const chatRooms = new Map();

const DEFAULT_AUTO_MESSAGE =
  'Thank you for contacting Food Kitchen support. Your message has been received. Our support team will assist you shortly.';

function formatCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function serializeMessage(message) {
  return {
    id: message.messageId,
    roomId: message.roomId,
    text: message.text || '',
    image: message.image || undefined,
    sender: message.sender,
    senderName: message.senderName,
    time: message.time,
    status: message.status,
  };
}

async function persistMessage(message) {
  const savedMessage = await ChatMessage.findOneAndUpdate(
    { roomId: message.roomId, messageId: message.id },
    {
      $setOnInsert: {
        roomId: message.roomId,
        messageId: message.id,
        sender: message.sender,
        senderName: message.senderName,
        text: message.text || '',
        image: message.image || '',
        time: message.time,
        status: message.status || 'delivered',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const conversationUpdate = {
    $set: {
      lastMessage: message.text || (message.image ? 'Photo' : ''),
      lastMessageAt: savedMessage.createdAt || new Date(),
    },
    $setOnInsert: {
      roomId: message.roomId,
    },
  };
  if (message.sender === 'user') {
    conversationUpdate.$set.userName = message.senderName || 'Customer';
    conversationUpdate.$set.userId = String(message.userId || '');
  }
  if (message.sender === 'agent' && message.senderName === 'Kitchen Admin') {
    conversationUpdate.$set.hasAdminReplied = true;
  }

  await ChatConversation.findOneAndUpdate(
    { roomId: message.roomId },
    conversationUpdate,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return serializeMessage(savedMessage);
}

async function loadAdminConversations() {
  const conversations = await ChatConversation.find()
    .sort({ lastMessageAt: -1 })
    .lean();

  return Promise.all(
    conversations.map(async (conversation) => {
      const messages = await ChatMessage.find({ roomId: conversation.roomId })
        .sort({ createdAt: 1 })
        .lean();

      return {
        id: conversation.roomId,
        customerName: conversation.userName || 'Customer',
        phone: 'Active User',
        orderId: 'LIVE-CHAT',
        room: conversation.roomId,
        lastMessage: conversation.lastMessage || '',
        time: messages.length ? messages[messages.length - 1].time : '',
        unread: false,
        hasAdminReplied: conversation.hasAdminReplied,
        messages: messages.map(serializeMessage),
      };
    })
  );
}

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Handshake authentication: the identity (and therefore the role) always comes
  // from the signed token + database record, never from the client payload.
  // Token-less sockets may connect, but they receive no room or admin history.
  io.use(async (socket, next) => {
    const token = extractHandshakeToken(socket);

    if (!token) {
      socket.data.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret());
      const user = await User.findById(decoded.id).select('name role email');

      if (!user) {
        return next(new Error('Authentication failed: user no longer exists.'));
      }

      socket.data.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        // Server-derived role - a client-supplied `role: 'admin'` is ignored.
        role: user.role,
      };
      return next();
    } catch (error) {
      return next(new Error('Authentication failed: invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    const authUser = socket.data.user || null;

    console.log(`[Socket.IO] Client connected: ${socket.id}${authUser ? ` (user ${authUser.id}, role ${authUser.role})` : ' (unauthenticated)'}`);

    const rejectUnauthenticated = () => {
      socket.emit('chat_error', {
        message: 'Authentication required. Please sign in and reconnect with a valid token.',
      });
    };

    socket.on('join_chat', async (data) => {
      try {
        if (!authUser) {
          rejectUnauthenticated();
          return;
        }

        const isAdmin = authUser.role === 'admin';
        // Customers are pinned to their own room: honouring a client-supplied `room`
        // would let any authenticated user read another customer's conversation.
        const room = isAdmin ? (data?.room || 'admin_dashboard') : `chat_${authUser.id}`;
        const role = isAdmin ? 'admin' : 'customer';
        const userName = isAdmin ? 'Kitchen Admin' : (authUser.name || 'Customer');

        socket.join(room);
        if (isAdmin) socket.join('admin_channel');

        let conversation;
        if (!isAdmin) {
          conversation = await ChatConversation.findOne({ roomId: room }).lean();
          const messages = await ChatMessage.find({ roomId: room }).sort({ createdAt: 1 }).lean();
          const roomData = {
            roomId: room,
            userId: authUser.id,
            userName,
            hasAdminReplied: Boolean(conversation?.hasAdminReplied),
          };
          chatRooms.set(room, roomData);

          socket.emit('chat_history', messages.map(serializeMessage));
          socket.emit('connected_ack', {
            status: 'connected',
            socketId: socket.id,
            room,
            hasAdminReplied: roomData.hasAdminReplied,
            time: formatCurrentTime(),
          });
        } else {
          const conversations = await loadAdminConversations();
          conversations.forEach((conversation) => {
            chatRooms.set(conversation.room, {
              roomId: conversation.room,
              userId: '',
              userName: conversation.customerName,
              hasAdminReplied: conversation.hasAdminReplied,
            });
          });
          socket.emit('admin_chat_history', conversations);
          socket.emit('connected_ack', {
            status: 'connected',
            socketId: socket.id,
            room,
            time: formatCurrentTime(),
          });
        }

        console.log(`[Socket.IO] ${userName} (${role}) joined room: ${room}`);
      } catch (error) {
        console.error('[Socket.IO] Failed to load chat history:', error);
        socket.emit('chat_error', { message: 'Could not load saved chats. Please reconnect.' });
      }
    });

    socket.on('send_message', async (message, acknowledge) => {
      try {
        if (!authUser) {
          rejectUnauthenticated();
          acknowledge?.({ success: false, message: 'Authentication required.' });
          return;
        }

        if (!message) throw new Error('Message payload is required.');

        const isAdmin = authUser.role === 'admin';
        // Same rule as join_chat: a customer may only ever write to their own room.
        const roomId = isAdmin
          ? (message.roomId || message.room || 'order_chat_user')
          : `chat_${authUser.id}`;
        const text = String(message.text || message.message || '').trim();
        const image = message.image || message.mediaUri || '';
        if (!text && !image) throw new Error('Message must include text or an image.');

        let roomData = chatRooms.get(roomId);
        if (!roomData) {
          const conversation = await ChatConversation.findOne({ roomId }).lean();
          roomData = {
            roomId,
            userId: authUser.id || conversation?.userId || socket.id,
            userName: isAdmin ? 'Customer' : (authUser.name || 'Customer'),
            hasAdminReplied: conversation?.hasAdminReplied || false,
          };
          chatRooms.set(roomId, roomData);
        }

        const messageData = {
          id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          roomId,
          text,
          image,
          userId: authUser.id,
          sender: isAdmin ? 'agent' : 'user',
          senderName: isAdmin ? 'Kitchen Admin' : (authUser.name || 'Customer'),
          time: message.time || message.timestamp || formatCurrentTime(),
          status: 'delivered',
        };
        const savedMessage = await persistMessage(messageData);

        if (isAdmin) roomData.hasAdminReplied = true;

        acknowledge?.({ success: true, message: savedMessage });
        socket.emit('message_status', { id: savedMessage.id, status: 'delivered' });
        socket.to(roomId).emit('receive_message', savedMessage);
        if (!isAdmin) socket.to('admin_channel').emit('receive_message', savedMessage);

        if (!isAdmin && !roomData.hasAdminReplied) {
          setTimeout(() => {
            socket.to(roomId).emit('agent_typing', { isTyping: true, roomId });
          }, 400);

          setTimeout(async () => {
            try {
              const latestConversation = await ChatConversation.findOne({ roomId }).lean();
              if (latestConversation?.hasAdminReplied) return;

              const autoReply = await persistMessage({
                id: `auto-${Date.now()}`,
                roomId,
                text: DEFAULT_AUTO_MESSAGE,
                sender: 'agent',
                senderName: 'Support Desk',
                time: formatCurrentTime(),
                status: 'delivered',
              });
              io.to(roomId).emit('agent_typing', { isTyping: false, roomId });
              io.to(roomId).emit('receive_message', autoReply);
              io.to('admin_channel').emit('receive_message', autoReply);
              io.to(roomId).emit('message_status', { id: savedMessage.id, status: 'read' });
            } catch (error) {
              console.error('[Socket.IO] Failed to save automatic support reply:', error);
              io.to(roomId).emit('chat_error', { message: 'Support reply could not be saved.' });
            }
          }, 1400);
        }
      } catch (error) {
        console.error('[Socket.IO] Failed to save chat message:', error);
        acknowledge?.({
          success: false,
          message: error instanceof Error ? error.message : 'Could not save chat message.',
        });
      }
    });

    socket.on('admin_read', (data) => {
      if (!authUser) {
        rejectUnauthenticated();
        return;
      }
      const roomId = data?.roomId || data?.room || 'order_chat_user';
      socket.to(roomId).emit('message_status', { status: 'read' });
    });

    socket.on('typing', (data) => {
      if (!authUser) {
        rejectUnauthenticated();
        return;
      }
      const roomId = data?.roomId || data?.room;
      if (roomId) {
        socket.to(roomId).emit('agent_typing', { isTyping: true, sender: authUser.role === 'admin' ? 'agent' : 'user' });
      } else {
        socket.broadcast.emit('agent_typing', { isTyping: true, sender: authUser.role === 'admin' ? 'agent' : 'user' });
      }
    });

    socket.on('stop_typing', (data) => {
      if (!authUser) {
        rejectUnauthenticated();
        return;
      }
      const roomId = data?.roomId || data?.room;
      if (roomId) {
        socket.to(roomId).emit('agent_typing', { isTyping: false, sender: authUser.role === 'admin' ? 'agent' : 'user' });
      } else {
        socket.broadcast.emit('agent_typing', { isTyping: false, sender: authUser.role === 'admin' ? 'agent' : 'user' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('[Socket.IO] Real-time chat server initialized');
  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io has not been initialized yet!');
  return io;
};
