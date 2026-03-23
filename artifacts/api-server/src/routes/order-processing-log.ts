import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.username) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  next();
}

// GET /api/order-processing-log
router.get("/order-processing-log", requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT id, saved_at, username, company_name, file_name
       FROM order_processing_log
       WHERE username = $1
       ORDER BY saved_at DESC`,
      [req.session.username]
    );
    res.json({ logs: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/order-processing-log/:id/rows
router.get("/order-processing-log/:id/rows", requireAuth, async (req: any, res) => {
  try {
    const result = await pool.query(
      `SELECT rows FROM order_processing_log WHERE id = $1 AND username = $2`,
      [req.params.id, req.session.username]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "기록을 찾을 수 없습니다." });
    }
    res.json({ rows: result.rows[0].rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/order-processing-log
router.post("/order-processing-log", requireAuth, async (req: any, res) => {
  const { company_name, file_name, rows } = req.body;
  if (!company_name || !file_name || !rows) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO order_processing_log (username, company_name, file_name, rows)
       VALUES ($1, $2, $3, $4)
       RETURNING id, saved_at, username, company_name, file_name`,
      [req.session.username, company_name, file_name, JSON.stringify(rows)]
    );
    res.json({ log: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/order-processing-log/:id
router.delete("/order-processing-log/:id", requireAuth, async (req: any, res) => {
  try {
    await pool.query(
      `DELETE FROM order_processing_log WHERE id = $1 AND username = $2`,
      [req.params.id, req.session.username]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
