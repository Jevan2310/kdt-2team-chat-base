import { pool } from '../../db.js';

// 방 목록 + 참여자 수 + 내가 들어가 있는지 + 안 읽은 개수
// 안 읽은 개수 = 내 책갈피(last_read_message_id)보다 뒤에 온, 남이 보낸 일반 메시지 수
export async function listRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.type, r.created_at AS createdAt,
            (SELECT COUNT(*) FROM room_members m WHERE m.room_id = r.id) AS memberCount,
            (me.user_id IS NOT NULL) AS joined,
            CASE WHEN me.user_id IS NULL THEN 0 ELSE (
              SELECT COUNT(*) FROM messages msg
               WHERE msg.room_id = r.id
                 AND msg.id > COALESCE(me.last_read_message_id, 0)
                 AND msg.type <> 'system'
                 AND msg.deleted_at IS NULL
                 AND (msg.user_id IS NULL OR msg.user_id <> ?)
            ) END AS unreadCount
       FROM rooms r
       LEFT JOIN room_members me ON me.room_id = r.id AND me.user_id = ?
      WHERE r.type = 'group'
      ORDER BY r.id`,
    [userId, userId],
  );
  return rows.map((r) => ({ ...r, joined: Boolean(r.joined) }));
}

export async function findRoom(roomId) {
  const [rows] = await pool.query(
    'SELECT id, name, type, created_by AS createdBy, created_at AS createdAt FROM rooms WHERE id = ?',
    [roomId],
  );
  return rows[0] ?? null;
}

export async function listMembers(roomId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, u.department, u.role, u.avatar_url AS avatarUrl, m.joined_at AS joinedAt,
            m.last_read_message_id AS lastReadMessageId
       FROM room_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ?
      ORDER BY m.joined_at`,
    [roomId],
  );
  return rows;
}

export async function isMember(roomId, userId) {
  const [rows] = await pool.query('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return rows.length > 0;
}

// 방 만들기 + 만든 사람 자동 참여 (둘 다 성공하거나 둘 다 취소 → 트랜잭션)
export async function createRoom(name, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO rooms (name, type, created_by) VALUES (?, ?, ?)', [name, 'group', userId]);
    await conn.query('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', [result.insertId, userId]);
    await conn.commit();
    return findRoom(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// 참여. 새로 들어왔으면 true, 이미 있었으면 false
// 책갈피는 지금 방의 마지막 메시지로 → 들어오기 전 메시지는 "안 읽음"으로 세지 않는다
export async function joinRoom(roomId, userId) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO room_members (room_id, user_id, last_read_message_id)
     VALUES (?, ?, (SELECT MAX(id) FROM messages WHERE room_id = ?))`,
    [roomId, userId, roomId],
  );
  return result.affectedRows === 1;
}

// 한 사람의 참여 정보 (방금 들어온 사람의 실제 책갈피를 다른 사람들에게 알려 줄 때)
export async function findMember(roomId, userId) {
  const [rows] = await pool.query(
    `SELECT last_read_message_id AS lastReadMessageId, joined_at AS joinedAt
       FROM room_members WHERE room_id = ? AND user_id = ?`,
    [roomId, userId],
  );
  return rows[0] ?? null;
}

// 나가기. 실제로 나갔으면 true
export async function leaveRoom(roomId, userId) {
  const [result] = await pool.query('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return result.affectedRows === 1;
}

// 읽음 처리: 책갈피를 messageId 로 옮긴다 (앞으로만, 그 방의 메시지일 때만). 옮겼으면 true
export async function markRead(roomId, userId, messageId) {
  const [result] = await pool.query(
    `UPDATE room_members
        SET last_read_message_id = ?
      WHERE room_id = ? AND user_id = ?
        AND (last_read_message_id IS NULL OR last_read_message_id < ?)
        AND EXISTS (SELECT 1 FROM messages WHERE id = ? AND room_id = ?)`,
    [messageId, roomId, userId, messageId, messageId, roomId],
  );
  return result.affectedRows === 1;
}

// 방 참여자 id 목록 (알림 보낼 때)
export async function listMemberIds(roomId) {
  const [rows] = await pool.query('SELECT user_id AS id FROM room_members WHERE room_id = ?', [roomId]);
  return rows.map((r) => r.id);
}
