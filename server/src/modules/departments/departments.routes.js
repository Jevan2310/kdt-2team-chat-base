import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// GET /api/departments → { departments: [{ id, name }] }  (회원가입 화면에서도 쓰므로 로그인 없이)
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM departments ORDER BY sort_order, name');
  res.json({ departments: rows });
});

export default router;
