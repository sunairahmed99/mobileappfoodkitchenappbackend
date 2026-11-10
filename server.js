import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import { initSocket } from './socket.js';

dotenv.config();

const PORT = process.env.PORT || 9000;


const server = http.createServer(app);


initSocket(server);

const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Port running: Server & Socket.IO are active on http://${HOST}:${PORT}`);
});

export default server;
