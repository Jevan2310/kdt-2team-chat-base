import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// GET /api/health — 서버와 DB가 살아 있는지 확인
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS rooms FROM rooms');
    res.json({ ok: true, db: true, rooms: rows[0].rooms, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: true, db: false, error: err.code ?? err.message });
  }
});

export default router;
