import { Router } from "express";
import ExcelJS from "exceljs";
import { Pool } from "pg";

const router = Router();

const NEXAR_CLIENT_ID = process.env.NEXAR_CLIENT_ID!;
const NEXAR_CLIENT_SECRET = process.env.NEXAR_CLIENT_SECRET!;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── PostgreSQL 기반 캐시 (배포 후에도 12시간 유지) ──────────────
async function initCache() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parts_cache (
      cache_key  TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      cached_at  TEXT NOT NULL
    )
  `);
  // BIGINT→TEXT 마이그레이션 (이전 버전 호환)
  await pool.query(`
    ALTER TABLE parts_cache ALTER COLUMN cached_at TYPE TEXT USING cached_at::TEXT
  `).catch(() => { /* 이미 TEXT이면 무시 */ });

  const minAt = String(Date.now() - CACHE_TTL_MS);
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM parts_cache WHERE cached_at > $1`,
    [minAt]
  );
  console.log(`[캐시 로드] ${rows[0].cnt}개 부품 캐시 복원 (DB)`);
}
initCache().catch((e) => console.error("[parts_cache 초기화 실패]", e));

async function getCached(key: string): Promise<{ data: unknown; cachedAt: number } | null> {
  try {
    const { rows } = await pool.query(
      `SELECT data, cached_at FROM parts_cache WHERE cache_key = $1`,
      [key]
    );
    if (rows.length === 0) return null;
    const cachedAt = Number(rows[0].cached_at);
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
    return { data: rows[0].data, cachedAt };
  } catch {
    return null;
  }
}

async function setCached(key: string, data: unknown): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO parts_cache (cache_key, data, cached_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET data = $2, cached_at = $3`,
      [key, JSON.stringify(data), String(Date.now())]
    );
  } catch (e) {
    console.error("[캐시 저장 실패]", e);
  }
}

// ── Nexar API ─────────────────────────────────────────────────────
async function getNexarToken(): Promise<string> {
  const response = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: NEXAR_CLIENT_ID,
      client_secret: NEXAR_CLIENT_SECRET,
    }).toString(),
  });
  if (!response.ok) throw new Error("Nexar 토큰 발급 실패");
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

const NEXAR_QUERY = `
query Search($q: String!) {
  supSearch(q: $q) {
    results {
      part {
        mpn
        sellers {
          company { name }
          offers {
            clickUrl
            sku
            inventoryLevel
            moq
            packaging
            prices { price quantity }
          }
        }
      }
    }
  }
}
`;

router.post("/parts/search", async (req, res) => {
  const { part_number } = req.body as { part_number?: string };
  if (!part_number) return res.status(400).json({ status: "error", message: "부품 번호를 입력해주세요." });

  const cacheKey = part_number.trim().toLowerCase();
  const cached = await getCached(cacheKey);
  if (cached) {
    const ageMin = Math.round((Date.now() - cached.cachedAt) / 60000);
    console.log(`[캐시 HIT] ${part_number} (${ageMin}분 전 캐시)`);
    return res.json({ status: "success", data: cached.data, cached: true });
  }

  try {
    console.log(`[API 호출] ${part_number}`);
    const token = await getNexarToken();
    const response = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: NEXAR_QUERY, variables: { q: part_number } }),
    });
    if (!response.ok) throw new Error(`Nexar API 오류: ${response.status}`);
    const data = await response.json();
    await setCached(cacheKey, data);
    return res.json({ status: "success", data, cached: false });
  } catch (error: unknown) {
    return res.status(500).json({ status: "error", message: error instanceof Error ? error.message : "알 수 없는 오류" });
  }
});

// ── 서버 사이드 Excel 생성 ────────────────────────────────────────
interface PriceBreak { quantity: number; price: number; }
interface Offer {
  company: string; clickUrl: string; stock: number; moq: number;
  packaging: string; priceBreaks: PriceBreak[]; buyQty: number;
  unitPrice: number; totalPrice: number;
}
interface PartResult { partName: string; qty: number; offers: Offer[]; }

const RED   = { argb: "FFCC0000" };
const BLUE  = { argb: "FF4472C4" };
const WHITE = { argb: "FFFFFFFF" };
const LBLUE = { argb: "FFDDEEFF" };

function labelStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: LBLUE };
  cell.alignment = { vertical: "middle" };
}
function headStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: WHITE };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: BLUE };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

router.post("/parts/export", async (req, res) => {
  const { results } = req.body as { results?: PartResult[] };
  if (!results || results.length === 0)
    return res.status(400).json({ status: "error", message: "내보낼 데이터가 없습니다." });

  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("비교견적리포트");

    // 고정 컬럼 1~2 너비만 설정, 나머지는 부품별로 동적 처리
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 20;

    results.forEach(({ partName, qty, offers }) => {
      // ── 이 부품에 실제 있는 회사+패키징 조합만 컬럼 생성 ──
      interface Col { key: string; company: string; packaging: string; }
      const cols: Col[] = [];
      const seen = new Set<string>();
      offers.forEach(({ company, packaging }) => {
        const k = `${company}||${packaging}`;
        if (!seen.has(k)) { seen.add(k); cols.push({ key: k, company, packaging }); }
      });

      // 컬럼 너비 설정 (부품별로 덮어쓰기 — 마지막 부품 기준이 되지만 무방)
      cols.forEach((_, i) => { ws.getColumn(i + 3).width = 24; });

      // offer 맵 (company||packaging → offer)
      const offerMap = new Map<string, Offer>();
      offers.forEach((o) => {
        const k = `${o.company}||${o.packaging}`;
        if (!offerMap.has(k)) offerMap.set(k, o);
      });

      const matched = cols.map((c) => offerMap.get(c.key)!);
      const maxPbLines = Math.max(1, ...matched.map((o) => o.priceBreaks.length));

      // 행1: 품목명
      const r1 = ws.addRow(["품목명", partName, ...cols.map(() => "")]);
      r1.height = 18; labelStyle(r1.getCell(1)); r1.getCell(2).font = { bold: true };

      // 행2: 수량
      const r2 = ws.addRow(["수량", qty, ...cols.map(() => "")]);
      r2.height = 18; labelStyle(r2.getCell(1));

      // 행3: 회사명만 (패키징은 Pkg 행에서 표시)
      const r3 = ws.addRow(["", "", ...cols.map((c) => c.company)]);
      r3.height = 20;
      cols.forEach((_, i) => headStyle(r3.getCell(i + 3)));

      // 데이터 행
      const rowNames = ["Pkg", "Stock", "Min Qty", "Price Breaks", "Buy Qty", "Total"];
      const rowData: (string | number)[][] = rowNames.map(() => []);

      matched.forEach((offer) => {
        const isShortage = offer.stock < qty;
        const pbText = offer.priceBreaks
          .map((p) => `${p.quantity.toLocaleString()}  $${p.price.toFixed(4)}`)
          .join("\n");
        rowData[0].push(offer.packaging);
        rowData[1].push(offer.stock.toLocaleString() + (isShortage ? " (재고부족)" : ""));
        rowData[2].push(offer.moq.toLocaleString());
        rowData[3].push(pbText);
        rowData[4].push(offer.buyQty.toLocaleString());
        rowData[5].push(`$${offer.totalPrice.toFixed(2)}`);
      });

      rowNames.forEach((name, ri) => {
        const isPb = ri === 3;
        const exRow = ws.addRow([name, "", ...rowData[ri]]);
        exRow.height = isPb ? Math.max(18, maxPbLines * 15) : 18;
        labelStyle(exRow.getCell(1));
        matched.forEach((offer, mi) => {
          const cell = exRow.getCell(mi + 3);
          const isShortage = offer.stock < qty;
          if (isShortage) cell.font = { color: RED };
          cell.alignment = { vertical: "top", wrapText: isPb };
        });
      });

      ws.addRow([]).height = 8;
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="AtoZ_%EB%8B%A8%EA%B0%80%EB%B9%84%EA%B5%90_%ED%94%BC%EB%B2%97.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error: unknown) {
    return res.status(500).json({ status: "error", message: error instanceof Error ? error.message : "Excel 생성 실패" });
  }
});

export default router;
