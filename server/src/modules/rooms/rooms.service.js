import { pool } from '../../db.js';

// 방 목록 + 참여자 수 + 내가 들어가 있는지
export async function listRooms(userId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.type, r.created_at AS createdAt,
            COUNT(m.user_id) AS memberCount,
            COALESCE(MAX(m.user_id = ?), 0) AS joined
       FROM rooms r
       LEFT JOIN room_members m ON m.room_id = r.id
      WHERE r.type = 'group'
      GROUP BY r.id
      ORDER BY r.id`,
    [userId],
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
    `SELECT u.id, u.nickname, u.department, u.role, m.joined_at AS joinedAt
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
export async function joinRoom(roomId, userId) {
  const [result] = await pool.query('INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
  return result.affectedRows === 1;
}

// 나가기. 실제로 나갔으면 true
export async function leaveRoom(roomId, userId) {
  const [result] = await pool.query('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
  return result.affectedRows === 1;
}
