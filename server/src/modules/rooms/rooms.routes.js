import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { listRooms, findRoom, listMembers, createRoom, joinRoom, leaveRoom, isMember } from './rooms.service.js';
import { listMessages, saveMessage } from '../messages/messages.service.js';

const router = Router();
router.use(requireAuth); // 이 아래 API는 모두 로그인 필요

// 주소의 :roomId 를 숫자로 바꾸고, 없는 방이면 404
async function loadRoom(req, res, next) {
  const roomId = Number(req.params.roomId);
  const room = Number.isInteger(roomId) ? await findRoom(roomId) : null;
  if (!room) return res.status(404).json({ message: '없는 채팅방이에요.' });
  req.room = room;
  next();
}

// GET /api/rooms → { rooms: [...] }
router.get('/', async (req, res) => {
  res.json({ rooms: await listRooms(req.user.id) });
});

// POST /api/rooms { name } → 201 { room }
router.post('/', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name || name.length > 30) return res.status(400).json({ message: '방 이름은 1~30자예요.' });

  const room = await createRoom(name, req.user.id);
  getIo().emit('room:created', { ...room, memberCount: 1 }); // 접속한 모두의 방 목록에 바로 추가
  res.status(201).json({ room });
});

// GET /api/rooms/:roomId → { room, members, joined }
router.get('/:roomId', loadRoom, async (req, res) => {
  const members = await listMembers(req.room.id);
  res.json({ room: req.room, members, joined: members.some((m) => m.id === req.user.id) });
});

// POST /api/rooms/:roomId/join → { joined: true, isNew }
router.post('/:roomId/join', loadRoom, async (req, res) => {
  const isNew = await joinRoom(req.room.id, req.user.id);
  if (isNew) {
    const io = getIo();
    io.emit('room:members', { roomId: req.room.id, change: 'join', user: req.user });
    const notice = await saveMessage({ roomId: req.room.id, type: 'system', content: `${req.user.nickname}님이 들어왔어요.` });
    io.to(`room:${req.room.id}`).emit('message:new', notice);
  }
  res.json({ joined: true, isNew });
});

// POST /api/rooms/:roomId/leave → { left }
router.post('/:roomId/leave', loadRoom, async (req, res) => {
  const left = await leaveRoom(req.room.id, req.user.id);
  if (left) {
    const io = getIo();
    // 이 사람의 모든 소켓(탭)을 방 소켓 그룹에서 빼서 더 이상 메시지를 받지 않게
    io.in(`user:${req.user.id}`).socketsLeave(`room:${req.room.id}`);
    io.emit('room:members', { roomId: req.room.id, change: 'leave', user: req.user });
    const notice = await saveMessage({ roomId: req.room.id, type: 'system', content: `${req.user.nickname}님이 나갔어요.` });
    io.to(`room:${req.room.id}`).emit('message:new', notice);
  }
  res.json({ left });
});

// GET /api/rooms/:roomId/messages?before=<메시지 id>&limit=50 → { messages, hasMore }
router.get('/:roomId/messages', loadRoom, async (req, res) => {
  if (!(await isMember(req.room.id, req.user.id))) {
    return res.status(403).json({ message: '참여한 방의 메시지만 볼 수 있어요.' });
  }
  const before = Number(req.query.before) || null;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  res.json(await listMessages(req.room.id, { before, limit }));
});

export default router;
