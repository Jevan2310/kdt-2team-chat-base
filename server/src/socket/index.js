import { Server } from 'socket.io';
import { config } from '../config.js';

// Express와 같은 http 서버에 Socket.IO를 붙인다.
export function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin },
  });

  io.on('connection', (socket) => {
    console.log('[socket] 연결:', socket.id);
    socket.emit('server:hello', { message: '소켓 연결 성공', socketId: socket.id });

    socket.on('disconnect', (reason) => {
      console.log('[socket] 끊김:', socket.id, reason);
    });
  });

  return io;
}
