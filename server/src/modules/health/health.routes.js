import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// GET /api/health — 서버와 DB가 살아 있는지 확인 (로그인 없이 누구나 부를 수 있으므로 오류 내용은 밖으로 보내지 않는다)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS rooms FROM rooms');
    res.json({ ok: true, db: true, rooms: rows[0].rooms, time: new Date().toISOString() });
  } catch (err) {
    console.error('[health] DB 확인 실패:', err.code ?? err.message); // 자세한 내용은 서버 로그에만
    res.status(503).json({ ok: false, db: false, message: 'DB에 연결할 수 없어요.' });
  }
});

export default router;
