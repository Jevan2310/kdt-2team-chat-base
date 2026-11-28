import { isMember, markRead, listMemberIds, findRoom } from '../modules/rooms/rooms.service.js';
import {
  saveMessage,
  findMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  MESSAGE_MAX_LENGTH,
  REACTION_EMOJIS,
} from '../modules/messages/messages.service.js';
import { toId } from '../lib/validate.js';

// 방 하나 = 소켓 그룹 하나 ("room:3"). 그룹에 들어간 소켓에게만 그 방 메시지가 간다.
const roomKey = (roomId) => `room:${roomId}`;

// ack: 화면이 emit 할 때 넘긴 콜백. 처리 결과를 그 사람에게만 돌려준다.
function reply(ack, data) {
  if (typeof ack === 'function') ack(data);
}

export function registerChatHandlers(io, socket) {
  const { user } = socket.data;

  // 수정·삭제·반응 전에 공통 확인: 있는 메시지인지, 내가 그 방 참여자인지, 바꿀 수 있는 메시지인지
  async function loadChangeable(messageId, { mineOnly }) {
    const id = toId(messageId);
    if (!id) return { error: '잘못된 메시지예요.' };
    const message = await findMessage(id);
    if (!message) return { error: '메시지를 찾을 수 없어요.' };
    if (!(await isMember(message.roomId, user.id))) return { error: '참여한 방이 아니에요.' };
    if (message.type !== 'text' || message.deletedAt) return { error: '이 메시지는 바꿀 수 없어요.' };
    if (mineOnly && message.user?.id !== user.id) return { error: '내가 보낸 메시지만 바꿀 수 있어요.' };
    return { message };
  }

  // 바뀐 메시지 전체를 방에 다시 보낸다 → 화면은 같은 id 를 새것으로 바꿔 끼움
  function broadcastUpdated(message, ack) {
    io.to(roomKey(message.roomId)).emit('message:updated', message);
    reply(ack, { ok: true, message });
  }

  // 방 화면을 열 때: 참여자인지 확인하고 소켓 그룹에 넣기
  socket.on('room:join', async ({ roomId } = {}, ack) => {
    try {
      const id = toId(roomId);
      if (!id || !(await isMember(id, user.id))) return reply(ack, { ok: false, message: '참여한 방이 아니에요.' });
      socket.join(roomKey(id));
      reply(ack, { ok: true });
    } catch (err) {
      console.error(err);
      reply(ack, { ok: false, message: '서버 오류가 났어요.' });
    }
  });

  // 읽음: 화면에 보인 마지막 메시지 id → 책갈피 이동 → 방 사람들에게 숫자 갱신, 내 다른 탭에는 안 읽은 개수 0
  socket.on('message:read', async ({ roomId, messageId } = {}) => {
    try {
      const id = toId(roomId);
      const msgId = toId(messageId);
      if (!id || !msgId) return;
      if (await markRead(id, user.id, msgId)) {
        io.to(roomKey(id)).emit('read:update', { roomId: id, userId: user.id, lastReadMessageId: msgId });
        io.to(`user:${user.id}`).emit('room:read', { roomId: id, lastReadMessageId: msgId });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // 방 화면을 닫을 때 (참여는 유지, 실시간 수신만 멈춤)
  socket.on('room:leave', ({ roomId } = {}) => {
    const id = toId(roomId);
    if (id) socket.leave(roomKey(id));
  });

  // 메시지 보내기: 확인 → DB 저장 → 방 전체(나 포함)에 message:new
  socket.on('message:send', async ({ roomId, content } = {}, ack) => {
    try {
      const id = toId(roomId);
      if (!id) return reply(ack, { ok: false, message: '참여한 방이 아니에요.' });
      const text = String(content ?? '').trim();
      if (!text) return reply(ack, { ok: false, message: '내용을 입력해 주세요.' });
      if (text.length > MESSAGE_MAX_LENGTH) return reply(ack, { ok: false, message: `메시지는 ${MESSAGE_MAX_LENGTH}자까지예요.` });
      if (!(await isMember(id, user.id))) return reply(ack, { ok: false, message: '참여한 방이 아니에요.' });

      const message = await saveMessage({ roomId: id, userId: user.id, content: text });
      io.to(roomKey(id)).emit('message:new', message);
      reply(ack, { ok: true, message });

      // 보낸 사람은 자기 메시지를 읽은 것
      if (await markRead(id, user.id, message.id)) {
        io.to(roomKey(id)).emit('read:update', { roomId: id, userId: user.id, lastReadMessageId: message.id });
      }
      // 다른 참여자들에게 알림 (방 화면을 안 보고 있어도 받도록 user:N 그룹으로)
      const room = await findRoom(id);
      const others = (await listMemberIds(id)).filter((uid) => uid !== user.id).map((uid) => `user:${uid}`);
      if (others.length) io.to(others).emit('notify:message', { roomId: id, roomName: room.name, message });
    } catch (err) {
      console.error(err);
      reply(ack, { ok: false, message: '메시지를 보내지 못했어요.' });
    }
  });

  // 메시지 수정 (내 글만)
  socket.on('message:edit', async ({ messageId, content } = {}, ack) => {
    try {
      const text = String(content ?? '').trim();
      if (!text) return reply(ack, { ok: false, message: '내용을 입력해 주세요.' });
      if (text.length > MESSAGE_MAX_LENGTH) return reply(ack, { ok: false, message: `메시지는 ${MESSAGE_MAX_LENGTH}자까지예요.` });
      const { message, error } = await loadChangeable(messageId, { mineOnly: true });
      if (error) return reply(ack, { ok: false, message: error });
      if (text === message.content) return reply(ack, { ok: true, message }); // 바뀐 게 없으면 그대로
      broadcastUpdated(await editMessage(message.id, text), ack);
    } catch (err) {
      console.error(err);
      reply(ack, { ok: false, message: '수정하지 못했어요.' });
    }
  });

  // 메시지 삭제 (내 글만). 자리는 남고 "삭제된 메시지예요"로 보인다
  socket.on('message:delete', async ({ messageId } = {}, ack) => {
    try {
      const { message, error } = await loadChangeable(messageId, { mineOnly: true });
      if (error) return reply(ack, { ok: false, message: error });
      broadcastUpdated(await deleteMessage(message.id), ack);
    } catch (err) {
      console.error(err);
      reply(ack, { ok: false, message: '삭제하지 못했어요.' });
    }
  });

  // 반응 누르기/취소 (방 참여자 누구나)
  socket.on('reaction:toggle', async ({ messageId, emoji } = {}, ack) => {
    try {
      if (!REACTION_EMOJIS.includes(emoji)) return reply(ack, { ok: false, message: '쓸 수 없는 반응이에요.' });
      const { message, error } = await loadChangeable(messageId, { mineOnly: false });
      if (error) return reply(ack, { ok: false, message: error });
      broadcastUpdated(await toggleReaction(message.id, user.id, emoji), ack);
    } catch (err) {
      console.error(err);
      reply(ack, { ok: false, message: '반응을 남기지 못했어요.' });
    }
  });
}
