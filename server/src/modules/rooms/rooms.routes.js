import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { listRooms, findRoom, listMembers, createRoom, joinRoom, leaveRoom } from './rooms.service.js';

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
    getIo().emit('room:members', { roomId: req.room.id, change: 'join', user: req.user });
  }
  res.json({ joined: true, isNew });
});

// POST /api/rooms/:roomId/leave → { left }
router.post('/:roomId/leave', loadRoom, async (req, res) => {
  const left = await leaveRoom(req.room.id, req.user.id);
  if (left) {
    getIo().emit('room:members', { roomId: req.room.id, change: 'leave', user: req.user });
  }
  res.json({ left });
});

export default router;
