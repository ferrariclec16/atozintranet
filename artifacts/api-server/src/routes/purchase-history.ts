import { Router } from "express";
import { Pool } from "pg";
import { employees } from "../config/employees";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.session?.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  if (req.session?.role !== "admin") { res.status(403).json({ error: "관리자만 접근할 수 있습니다." }); return; }
  next();
}

function kstNow(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString().replace("T", " ").substring(0, 19);
}

// ── 이력 업로드 (POST /purchase-history/upload) ───────────────────
interface HistoryRow {
  company_name?: string;
  order_date?: string;
  due_date?: string;
  order_type?: string;
  item_code?: string;
  order_no?: string;
  item_name: string;
  order_qty?: number;
  order_price?: number;
  delivery_amount?: number;
  delivery_status?: string;
  note?: string;
}

router.post("/purchase-history/upload", requireAuth, async (req, res) => {
  const { rows, fileName } = req.body as { rows?: HistoryRow[]; fileName?: string };
  if (!rows || rows.length === 0) {
    return res.status(400).json({ error: "업로드할 데이터가 없습니다." });
  }

  const username = req.session?.username as string;
  const employee = employees.find((e) => e.username === username);
  const displayName = employee?.displayName || username;
  const companyName = rows[0]?.company_name || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const row of rows) {
      if (!row.item_name) continue;
      await client.query(
        `INSERT INTO purchase_history
           (company_name, order_date, due_date, order_type, item_code, order_no,
            item_name, order_qty, order_price, delivery_amount, delivery_status, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.company_name || null,
          row.order_date || null,
          row.due_date || null,
          row.order_type || null,
          row.item_code || null,
          row.order_no || null,
          row.item_name,
          row.order_qty || 0,
          row.order_price || 0,
          row.delivery_amount || 0,
          row.delivery_status || null,
          row.note || null,
        ]
      );
      inserted++;
    }
    await client.query("COMMIT");

    // 업로드 로그 기록
    try {
      await pool.query(
        `INSERT INTO db_upload_log (username, display_name, company_name, file_name, rows_inserted, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [username, displayName, companyName, fileName || null, inserted, kstNow()]
      );
    } catch (logErr) {
      console.error("[업로드 로그 저장 실패]", logErr);
    }

    return res.json({ success: true, inserted });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[이력 업로드 오류]", e);
    return res.status(500).json({ error: "저장 중 오류가 발생했습니다." });
  } finally {
    client.release();
  }
});

// ── 품목명 검색 (GET /purchase-history/search?q=xxx&company=yyy) ──
// company가 있으면 해당 업체 데이터만, 없으면 전체
router.get("/purchase-history/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const company = String(req.query.company || "").trim();
  if (!q) return res.status(400).json({ error: "검색어를 입력해주세요." });

  try {
    let rowSql: string;
    let aggSql: string;
    let params: (string | undefined)[];

    if (company) {
      rowSql = `SELECT * FROM purchase_history
                WHERE item_name ILIKE $1 AND company_name = $2
                ORDER BY order_date DESC NULLS LAST`;
      aggSql = `SELECT
                  item_name,
                  COUNT(*)::int                          AS order_count,
                  SUM(order_qty)::numeric                AS total_qty,
                  SUM(order_qty * order_price)::numeric  AS total_amount,
                  MAX(order_date)                        AS last_order_date,
                  array_agg(DISTINCT company_name)       AS companies
                FROM purchase_history
                WHERE item_name ILIKE $1 AND company_name = $2
                GROUP BY item_name`;
      params = [`%${q}%`, company];
    } else {
      rowSql = `SELECT * FROM purchase_history
                WHERE item_name ILIKE $1
                ORDER BY order_date DESC NULLS LAST`;
      aggSql = `SELECT
                  item_name,
                  COUNT(*)::int                          AS order_count,
                  SUM(order_qty)::numeric                AS total_qty,
                  SUM(order_qty * order_price)::numeric  AS total_amount,
                  MAX(order_date)                        AS last_order_date,
                  array_agg(DISTINCT company_name)       AS companies
                FROM purchase_history
                WHERE item_name ILIKE $1
                GROUP BY item_name`;
      params = [`%${q}%`];
    }

    const [rows, agg] = await Promise.all([
      pool.query(rowSql, params),
      pool.query(aggSql, params),
    ]);

    return res.json({ rows: rows.rows, aggregates: agg.rows });
  } catch (e) {
    console.error("[이력 검색 오류]", e);
    return res.status(500).json({ error: "검색 중 오류가 발생했습니다." });
  }
});

// ── 업체별 통계 (GET /purchase-history/stats) ────────────────────
// company가 있으면 해당 업체 상세, 없으면 전체 업체 목록 통계
router.get("/purchase-history/stats", requireAuth, async (req, res) => {
  const company = String(req.query.company || "").trim();
  try {
    if (company) {
      // 특정 업체: 발주일자 기준 월별 집계
      const result = await pool.query(
        `SELECT
           company_name,
           COUNT(*)::int          AS total_rows,
           COUNT(DISTINCT item_name)::int AS unique_items,
           SUM(order_qty)::numeric        AS total_qty,
           SUM(order_qty * order_price)::numeric AS total_amount,
           MIN(order_date)               AS first_date,
           MAX(order_date)               AS last_date,
           MAX(uploaded_at)              AS last_uploaded_at
         FROM purchase_history
         WHERE company_name = $1
         GROUP BY company_name`,
        [company]
      );
      return res.json({ stats: result.rows[0] || null });
    } else {
      // 전체 업체 목록 + 각 업체 통계
      const result = await pool.query(
        `SELECT
           company_name,
           COUNT(*)::int          AS total_rows,
           COUNT(DISTINCT item_name)::int AS unique_items,
           SUM(order_qty)::numeric        AS total_qty,
           SUM(order_qty * order_price)::numeric AS total_amount,
           MIN(order_date)               AS first_date,
           MAX(order_date)               AS last_date,
           MAX(uploaded_at)              AS last_uploaded_at
         FROM purchase_history
         WHERE company_name IS NOT NULL
         GROUP BY company_name
         ORDER BY company_name`
      );
      return res.json({ stats: result.rows });
    }
  } catch (e) {
    console.error("[통계 조회 오류]", e);
    return res.status(500).json({ error: "통계 조회 중 오류가 발생했습니다." });
  }
});

// ── 업체별 전체 목록 (GET /purchase-history/list?company=xxx) ────
router.get("/purchase-history/list", requireAuth, async (req, res) => {
  const company = String(req.query.company || "").trim();
  try {
    const result = company
      ? await pool.query(
          "SELECT * FROM purchase_history WHERE company_name = $1 ORDER BY order_date DESC NULLS LAST, id DESC",
          [company]
        )
      : await pool.query(
          "SELECT * FROM purchase_history ORDER BY order_date DESC NULLS LAST, id DESC"
        );
    return res.json({ rows: result.rows });
  } catch (e) {
    console.error("[목록 조회 오류]", e);
    return res.status(500).json({ error: "조회 중 오류가 발생했습니다." });
  }
});

// ── 업체별 이력 삭제 (DELETE /purchase-history/company/:name) ─────
router.delete("/purchase-history/company/:name", requireAuth, async (req, res) => {
  if (req.session?.role !== "admin") {
    return res.status(403).json({ error: "관리자만 삭제할 수 있습니다." });
  }
  const name = req.params.name;
  try {
    const result = await pool.query(
      "DELETE FROM purchase_history WHERE company_name = $1",
      [name]
    );
    return res.json({ success: true, deleted: result.rowCount });
  } catch (e) {
    return res.status(500).json({ error: "삭제 중 오류가 발생했습니다." });
  }
});

// ── DB 업로드 로그 조회 (GET /purchase-history/upload-log) — 관리자 전용 ──
router.get("/purchase-history/upload-log", requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, display_name, company_name, file_name, rows_inserted, uploaded_at
       FROM db_upload_log
       ORDER BY id DESC
       LIMIT 500`
    );
    return res.json({ logs: result.rows });
  } catch (e) {
    console.error("[업로드 로그 조회 오류]", e);
    return res.status(500).json({ error: "로그 조회 중 오류가 발생했습니다." });
  }
});

// ── 전체 삭제 (DELETE /purchase-history/all) — 관리자 전용 ────────
router.delete("/purchase-history/all", requireAuth, async (req, res) => {
  if (req.session?.role !== "admin") {
    return res.status(403).json({ error: "관리자만 전체 삭제할 수 있습니다." });
  }
  try {
    await pool.query("TRUNCATE TABLE purchase_history RESTART IDENTITY");
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: "삭제 중 오류가 발생했습니다." });
  }
});

export default router;
