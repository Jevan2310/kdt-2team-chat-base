import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { getIo } from '../../socket/io.js';
import { listRooms, findRoom, listMembers, createRoom, joinRoom, leaveRoom, isMember } from './rooms.service.js';
import { listMessages, listMessagesAfter, saveMessage } from '../messages/messages.service.js';
import { toId, toIntInRange } from '../../lib/validate.js';

const router = Router();
router.use(requireAuth); // 이 아래 API는 모두 로그인 필요

// 주소의 :roomId 를 숫자로 바꾸고, 없는 방이면 404
async function loadRoom(req, res, next) {
  const roomId = toId(req.params.roomId);
  const room = roomId ? await findRoom(roomId) : null;
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

// GET /api/rooms/:roomId/messages?before=<id>&limit=50 → { messages, hasMore }  (최근 것부터 거꾸로, 이전 대화 불러오기)
// GET /api/rooms/:roomId/messages?after=<id>&limit=100 → { messages, hasMore }  (그 뒤로 온 것, 다시 연결됐을 때 빈틈 채우기)
router.get('/:roomId/messages', loadRoom, async (req, res) => {
  if (!(await isMember(req.room.id, req.user.id))) {
    return res.status(403).json({ message: '참여한 방의 메시지만 볼 수 있어요.' });
  }
  const limit = toIntInRange(req.query.limit, { min: 1, max: 100, fallback: 50 });
  const after = toId(req.query.after);
  if (after) return res.json(await listMessagesAfter(req.room.id, { after, limit }));
  res.json(await listMessages(req.room.id, { before: toId(req.query.before), limit }));
});

export default router;
