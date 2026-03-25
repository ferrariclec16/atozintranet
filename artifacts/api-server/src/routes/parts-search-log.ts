import { Router } from "express";
import { Pool } from "pg";
import { employees } from "../config/employees";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parts_search_log (
      id           SERIAL PRIMARY KEY,
      time         TEXT NOT NULL,
      username     TEXT NOT NULL,
      display_name TEXT NOT NULL,
      search_type  TEXT NOT NULL,
      query        TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      file_name    TEXT,
      file_data    BYTEA
    )
  `);
  // 기존 테이블에 파일 컬럼이 없으면 추가 (마이그레이션)
  await pool.query(`ALTER TABLE parts_search_log ADD COLUMN IF NOT EXISTS file_name TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE parts_search_log ADD COLUMN IF NOT EXISTS file_data BYTEA`).catch(() => {});
}
initTable().catch((e) => console.error("[parts_search_log 초기화 실패]", e));

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "관리자만 접근할 수 있습니다." }); return; }
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
  const { query, searchType, resultCount, fileName, fileBase64 } = req.body as {
    query?: string;
    searchType?: string;
    resultCount?: number;
    fileName?: string;
    fileBase64?: string;
  };

  if (!query || !searchType) {
    res.status(400).json({ error: "필수 값이 누락되었습니다." });
    return;
  }

  const employee = employees.find((e) => e.username === req.session.username);
  const displayName = employee?.displayName ?? req.session.username;

  const fileBuffer = fileBase64 ? Buffer.from(fileBase64, "base64") : null;

  try {
    await pool.query(
      `INSERT INTO parts_search_log (time, username, display_name, search_type, query, result_count, file_name, file_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [kstNow(), req.session.username, displayName, searchType, query, resultCount ?? 0, fileName ?? null, fileBuffer]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/parts-search-log — 관리자 전용 조회 (파일 데이터 제외)
router.get("/admin/parts-search-log", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, time, username, display_name AS "displayName",
              search_type AS "searchType", query, result_count AS "resultCount",
              file_name AS "fileName",
              (file_data IS NOT NULL) AS "hasFile"
       FROM parts_search_log
       ORDER BY id DESC`
    );
    res.json({ logs: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/parts-search-log/:id/download — 파일 다운로드
router.get("/admin/parts-search-log/:id/download", requireAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "잘못된 ID" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT file_name, file_data FROM parts_search_log WHERE id = $1`,
      [id]
    );
    if (!rows[0] || !rows[0].file_data) {
      res.status(404).json({ error: "파일이 없습니다." });
      return;
    }
    const fileName = rows[0].file_name || "검색파일.xlsx";
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(rows[0].file_data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
