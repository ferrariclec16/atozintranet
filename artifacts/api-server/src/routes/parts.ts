import { Router } from "express";
import ExcelJS from "exceljs";

const router = Router();

const NEXAR_CLIENT_ID = process.env.NEXAR_CLIENT_ID!;
const NEXAR_CLIENT_SECRET = process.env.NEXAR_CLIENT_SECRET!;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry { data: unknown; cachedAt: number; }
const searchCache = new Map<string, CacheEntry>();

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
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[캐시 HIT] ${part_number} (${Math.round((Date.now() - cached.cachedAt) / 60000)}분 전 캐시)`);
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
    searchCache.set(cacheKey, { data, cachedAt: Date.now() });
    return res.json({ status: "success", data, cached: false });
  } catch (error: unknown) {
    return res.status(500).json({ status: "error", message: error instanceof Error ? error.message : "알 수 없는 오류" });
  }
});

// ── 서버 사이드 Excel 생성 (ExcelJS) ──────────────────────────────
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
const GREY  = { argb: "FF999999" };

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
  if (!results || results.length === 0) return res.status(400).json({ status: "error", message: "내보낼 데이터가 없습니다." });

  try {
    // 전체 결과에서 등장하는 회사명을 수집 → 동적 컬럼
    const companyOrder: string[] = [];
    const seen = new Set<string>();
    results.forEach(({ offers }) =>
      offers.forEach(({ company }) => { if (!seen.has(company)) { seen.add(company); companyOrder.push(company); } })
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("비교견적리포트");
    ws.columns = [
      { width: 14 }, { width: 20 },
      ...companyOrder.map(() => ({ width: 24 })),
    ];

    results.forEach(({ partName, qty, offers }) => {
      // 이 부품의 offer를 회사명으로 빠르게 조회
      const offerByCompany = new Map<string, Offer>();
      offers.forEach((o) => { if (!offerByCompany.has(o.company)) offerByCompany.set(o.company, o); });

      const matched = companyOrder.map((c) => offerByCompany.get(c) ?? null);
      const maxPbLines = Math.max(1, ...matched.map((o) => (o ? o.priceBreaks.length : 1)));

      const r1 = ws.addRow(["품목명", partName, ...companyOrder.map(() => "")]);
      r1.height = 18; labelStyle(r1.getCell(1)); r1.getCell(2).font = { bold: true };

      const r2 = ws.addRow(["수량", qty, ...companyOrder.map(() => "")]);
      r2.height = 18; labelStyle(r2.getCell(1));

      const r3 = ws.addRow(["", "", ...companyOrder]);
      r3.height = 20;
      companyOrder.forEach((_, i) => headStyle(r3.getCell(i + 3)));

      const rowNames = ["Pkg","Stock","Min Qty","Price Breaks","Buy Qty","Total"];
      const rowData: (string | number)[][] = rowNames.map(() => []);

      matched.forEach((offer) => {
        if (!offer) { rowData.forEach((rd) => rd.push("-")); return; }
        const isShortage = offer.stock < qty;
        const pbText = offer.priceBreaks.map((p) => `${p.quantity.toLocaleString()}  $${p.price.toFixed(4)}`).join("\n");
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
          if (!offer) {
            cell.font = { color: GREY }; cell.alignment = { vertical: "top" };
          } else {
            const isShortage = offer.stock < qty;
            if (isShortage) cell.font = { color: RED };
            cell.alignment = { vertical: "top", wrapText: isPb };
          }
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
