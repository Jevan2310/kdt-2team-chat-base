import { pool } from '../../db.js';

export const MESSAGE_MAX_LENGTH = 2000;

// 누를 수 있는 반응. 화면(client/src/components/messages/reactions.js)과 같은 목록이어야 한다.
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// 메시지 + 보낸 사람 정보를 화면에 쓰기 좋은 모양으로
const SELECT_MESSAGE = `
  SELECT m.id, m.room_id AS roomId, m.type, m.content, m.metadata, m.created_at AS createdAt,
         m.edited_at AS editedAt, m.deleted_at AS deletedAt,
         u.id AS userId, u.nickname, u.department, u.role
    FROM messages m
    LEFT JOIN users u ON u.id = m.user_id`;

function toMessage(row, reactions = []) {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    roomId: row.roomId,
    type: row.type,
    content: deleted ? '' : row.content, // 지운 메시지는 내용을 보내지 않는다
    metadata: deleted ? null : row.metadata,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    reactions, // [{ emoji: '👍', userIds: [1, 3] }] — 먼저 누른 순서
    user: row.userId ? { id: row.userId, nickname: row.nickname, department: row.department, role: row.role } : null,
  };
}

// 메시지 여러 개의 반응을 한 번에 모은다 → Map(메시지 id → 반응 목록)
async function reactionsOf(messageIds) {
  const byMessage = new Map();
  if (!messageIds.length) return byMessage;
  const [rows] = await pool.query(
    `SELECT message_id AS messageId, emoji, user_id AS userId
       FROM message_reactions
      WHERE message_id IN (?)
      ORDER BY created_at, user_id`,
    [messageIds],
  );
  for (const r of rows) {
    const list = byMessage.get(r.messageId) ?? [];
    let item = list.find((x) => x.emoji === r.emoji);
    if (!item) {
      item = { emoji: r.emoji, userIds: [] };
      list.push(item);
    }
    item.userIds.push(r.userId);
    byMessage.set(r.messageId, list);
  }
  return byMessage;
}

async function withReactions(rows) {
  const byMessage = await reactionsOf(rows.map((r) => r.id));
  return rows.map((r) => toMessage(r, byMessage.get(r.id)));
}

export async function findMessage(id) {
  const [rows] = await pool.query(`${SELECT_MESSAGE} WHERE m.id = ?`, [id]);
  return rows[0] ? (await withReactions(rows))[0] : null;
}

// 메시지 저장 (type: text 일반 / system 입장·퇴장 안내 / 확장: bot, vacation …)
export async function saveMessage({ roomId, userId = null, type = 'text', content, metadata = null }) {
  const [result] = await pool.query(
    'INSERT INTO messages (room_id, user_id, type, content, metadata) VALUES (?, ?, ?, ?, ?)',
    [roomId, userId, type, content, metadata ? JSON.stringify(metadata) : null],
  );
  return findMessage(result.insertId);
}

// 최근 메시지 limit개 (before 가 있으면 그 번호보다 이전 것). 화면에 그리기 좋게 오래된 것 → 최근 순으로 돌려준다.
export async function listMessages(roomId, { before = null, limit = 50 } = {}) {
  const params = [roomId];
  let where = 'WHERE m.room_id = ?';
  if (before) {
    where += ' AND m.id < ?';
    params.push(before);
  }
  params.push(limit + 1); // 하나 더 가져와서 "더 있는지" 판단
  const [rows] = await pool.query(`${SELECT_MESSAGE} ${where} ORDER BY m.id DESC LIMIT ?`, params);
  const hasMore = rows.length > limit;
  return { messages: await withReactions(rows.slice(0, limit).reverse()), hasMore };
}

// 수정: 내용 바꾸고 수정 시각 기록
export async function editMessage(id, content) {
  await pool.query('UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?', [content, id]);
  return findMessage(id);
}

// 삭제: 행은 남기고(읽음 책갈피·메시지 순서가 그대로 유지) 내용·반응만 지운다
export async function deleteMessage(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM message_reactions WHERE message_id = ?', [id]);
    await conn.query("UPDATE messages SET content = '', metadata = NULL, deleted_at = NOW() WHERE id = ?", [id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return findMessage(id);
}

// 반응 누르기/취소: 이미 눌렀으면 지우고, 아니면 추가
export async function toggleReaction(messageId, userId, emoji) {
  const [removed] = await pool.query(
    'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    [messageId, userId, emoji],
  );
  if (removed.affectedRows === 0) {
    await pool.query('INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [
      messageId,
      userId,
      emoji,
    ]);
  }
  return findMessage(messageId);
}
