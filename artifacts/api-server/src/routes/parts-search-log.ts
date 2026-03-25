import { Router } from "express";
import { Pool } from "pg";
import { employees } from "../config/employees";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(`
  CREATE TABLE IF NOT EXISTS parts_search_log (
    id           SERIAL PRIMARY KEY,
    time         TEXT NOT NULL,
    username     TEXT NOT NULL,
    display_name TEXT NOT NULL,
    search_type  TEXT NOT NULL,
    query        TEXT NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0
  )
`).catch((e) => console.error("[parts_search_log 테이블 생성 실패]", e));

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.username) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.username) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "관리자만 접근할 수 있습니다." });
    return;
  }
  next();
}

function kstNow(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);
}

// POST /api/parts-search-log — 검색 기록 저장
router.post("/parts-search-log", requireAuth, async (req: any, res) => {
  const { query, searchType, resultCount } = req.body as {
    query?: string;
    searchType?: string;
    resultCount?: number;
  };

  if (!query || !searchType) {
    res.status(400).json({ error: "필수 값이 누락되었습니다." });
    return;
  }

  const employee = employees.find((e) => e.username === req.session.username);
  const displayName = employee?.displayName ?? req.session.username;

  try {
    await pool.query(
      `INSERT INTO parts_search_log (time, username, display_name, search_type, query, result_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [kstNow(), req.session.username, displayName, searchType, query, resultCount ?? 0]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/parts-search-log — 관리자 전용 조회
router.get("/admin/parts-search-log", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, time, username, display_name AS "displayName",
              search_type AS "searchType", query, result_count AS "resultCount"
       FROM parts_search_log
       ORDER BY id DESC`
    );
    res.json({ logs: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
