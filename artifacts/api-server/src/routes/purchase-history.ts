import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  next();
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
  const { rows } = req.body as { rows?: HistoryRow[] };
  if (!rows || rows.length === 0) {
    return res.status(400).json({ error: "업로드할 데이터가 없습니다." });
  }

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
    return res.json({ success: true, inserted });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[이력 업로드 오류]", e);
    return res.status(500).json({ error: "저장 중 오류가 발생했습니다." });
  } finally {
    client.release();
  }
});

// ── 품목명 검색 (GET /purchase-history/search?q=xxx) ─────────────
router.get("/purchase-history/search", requireAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "검색어를 입력해주세요." });

  try {
    // 개별 행
    const rows = await pool.query(
      `SELECT * FROM purchase_history
       WHERE item_name ILIKE $1
       ORDER BY order_date DESC NULLS LAST`,
      [`%${q}%`]
    );

    // 집계
    const agg = await pool.query(
      `SELECT
         item_name,
         COUNT(*)::int                          AS order_count,
         SUM(order_qty)::numeric                AS total_qty,
         SUM(order_qty * order_price)::numeric  AS total_amount,
         MAX(order_date)                        AS last_order_date,
         array_agg(DISTINCT company_name)       AS companies
       FROM purchase_history
       WHERE item_name ILIKE $1
       GROUP BY item_name`,
      [`%${q}%`]
    );

    return res.json({ rows: rows.rows, aggregates: agg.rows });
  } catch (e) {
    console.error("[이력 검색 오류]", e);
    return res.status(500).json({ error: "검색 중 오류가 발생했습니다." });
  }
});

// ── 이력 전체 삭제 (DELETE /purchase-history/all) — 관리자 전용 ──
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
