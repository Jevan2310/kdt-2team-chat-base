import { pool } from '../../db.js';

export const MESSAGE_MAX_LENGTH = 2000;

// 메시지 + 보낸 사람 정보를 화면에 쓰기 좋은 모양으로
const SELECT_MESSAGE = `
  SELECT m.id, m.room_id AS roomId, m.type, m.content, m.metadata, m.created_at AS createdAt,
         u.id AS userId, u.nickname, u.department, u.role
    FROM messages m
    LEFT JOIN users u ON u.id = m.user_id`;

function toMessage(row) {
  return {
    id: row.id,
    roomId: row.roomId,
    type: row.type,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt,
    user: row.userId ? { id: row.userId, nickname: row.nickname, department: row.department, role: row.role } : null,
  };
}

export async function findMessage(id) {
  const [rows] = await pool.query(`${SELECT_MESSAGE} WHERE m.id = ?`, [id]);
  return rows[0] ? toMessage(rows[0]) : null;
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
  return { messages: rows.slice(0, limit).reverse().map(toMessage), hasMore };
}
