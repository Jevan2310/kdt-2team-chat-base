import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken, findUserById } from '../modules/auth/auth.service.js';
import { setIo } from './io.js';
import { registerChatHandlers } from './chat.handlers.js';

// Express와 같은 http 서버에 Socket.IO를 붙인다.
export function attachSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin },
  });
  setIo(io);

  // 연결 전에 로그인 토큰 확인 → 통과하면 socket.data.user 에 사용자 저장
  io.use(async (socket, next) => {
    try {
      const user = await findUserById(verifyToken(socket.handshake.auth?.token));
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    console.log('[socket] 연결:', user.username, socket.id);
    socket.join(`user:${user.id}`); // 한 사람이 탭 여러 개를 열어도 "user:N" 으로 한꺼번에 다룰 수 있게
    socket.emit('server:hello', { message: `${user.nickname}님 소켓 연결 성공`, socketId: socket.id });

    registerChatHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      console.log('[socket] 끊김:', user.username, reason);
    });
  });

  return io;
}
