import { useState, useRef, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import * as XLSX from "xlsx";

// ─── 타입 ────────────────────────────────────────────────
interface PriceBreak { quantity: number; price: number; }
interface RawOffer { company: string; stock: number; moq: number; prices: PriceBreak[]; }
interface AnalyzedItem {
  company: string; clickUrl: string; stock: number; moq: number;
  packaging: string; priceBreaksArr: PriceBreak[];
  buyQty: number; unitPrice: number; totalPrice: number;
}
interface Combo { cost: number; parts: { company: string; qty: number }[]; }
interface PartResult {
  id: string; partName: string; targetQty: number;
  list: AnalyzedItem[]; top3: Combo[]; rawOffers: RawOffer[];
  open: boolean;
}

// ─── 최적 조합 계산 ───────────────────────────────────────
function getCost(offer: RawOffer, qty: number): number {
  let p = offer.prices[0]?.price ?? 0;
  for (const pb of offer.prices) { if (qty >= pb.quantity) p = pb.price; }
  return p * qty;
}

function calculateBestCombinations(offers: RawOffer[], targetQty: number): Combo[] {
  const combos: Combo[] = [];
  const valids = offers.filter((o) => o.stock > 0 && o.prices.length > 0);

  for (const o of valids) {
    const take = Math.max(targetQty, o.moq);
    if (o.stock >= take)
      combos.push({ cost: getCost(o, take), parts: [{ company: o.company, qty: take }] });
  }

  for (let i = 0; i < valids.length; i++) {
    for (let j = 0; j < valids.length; j++) {
      if (i === j) continue;
      const o1 = valids[i], o2 = valids[j];
      const take1 = o1.stock;
      if (take1 >= targetQty || take1 < o1.moq) continue;
      const rem = targetQty - take1;
      const take2 = Math.max(rem, o2.moq);
      if (o2.stock >= take2)
        combos.push({ cost: getCost(o1, take1) + getCost(o2, take2), parts: [{ company: o1.company, qty: take1 }, { company: o2.company, qty: take2 }] });
    }
  }

  for (let i = 0; i < valids.length; i++) {
    for (let j = 0; j < valids.length; j++) {
      for (let k = 0; k < valids.length; k++) {
        if (i === j || j === k || i === k) continue;
        const o1 = valids[i], o2 = valids[j], o3 = valids[k];
        const take1 = o1.stock;
        if (take1 >= targetQty || take1 < o1.moq) continue;
        const rem1 = targetQty - take1;
        const take2 = o2.stock;
        if (take2 >= rem1 || take2 < o2.moq) continue;
        const rem2 = rem1 - take2;
        const take3 = Math.max(rem2, o3.moq);
        if (o3.stock >= take3)
          combos.push({ cost: getCost(o1, take1) + getCost(o2, take2) + getCost(o3, take3), parts: [{ company: o1.company, qty: take1 }, { company: o2.company, qty: take2 }, { company: o3.company, qty: take3 }] });
      }
    }
  }

  combos.sort((a, b) => a.cost - b.cost);
  const seen = new Set<string>();
  const unique: Combo[] = [];
  for (const c of combos) {
    const key = c.parts.map((p) => `${p.company}:${p.qty}`).join("|");
    if (!seen.has(key)) { seen.add(key); unique.push(c); if (unique.length === 3) break; }
  }
  return unique;
}

// ─── API 응답 타입 ────────────────────────────────────────
interface NexarOffer { clickUrl?: string; moq?: number; inventoryLevel?: number; packaging?: string; prices?: PriceBreak[]; }
interface NexarSeller { company?: { name?: string }; offers?: NexarOffer[]; }
interface NexarPart { sellers?: NexarSeller[]; }
interface NexarResult { part?: NexarPart; }
interface SearchApiResponse {
  status: string;
  data?: { data?: { supSearch?: { results?: NexarResult[] } } };
}

// ─── API 호출 ─────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAndAnalyze(partInput: string, targetQty: number): Promise<{ list: AnalyzedItem[]; top3: Combo[]; rawOffers: RawOffer[] }> {
  try {
    const resp = await fetch(`${BASE}/api/parts/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ part_number: partInput }),
    });
    const resData = (await resp.json()) as SearchApiResponse;

    let analyzedList: AnalyzedItem[] = [];
    const rawOffers: RawOffer[] = [];

    if (resData.status === "success") {
      const parts = resData.data?.data?.supSearch?.results ?? [];
      for (const resultItem of parts) {
        const targetPart = resultItem.part;
        if (!targetPart) continue;
        for (const seller of targetPart.sellers ?? []) {
          const companyName = seller.company?.name ?? "알 수 없는 유통사";
          for (const offer of seller.offers ?? []) {
            const moq = offer.moq ?? 1;
            const stock = offer.inventoryLevel ?? 0;
            const prices = offer.prices ?? [];
            rawOffers.push({ company: companyName, stock, moq, prices });
            const buyQty = Math.max(targetQty, moq);
            const validPrices = prices.filter((p) => p.quantity <= buyQty);
            if (validPrices.length === 0) continue;
            const unitPrice = validPrices[validPrices.length - 1].price;
            const totalPrice = buyQty * unitPrice;
            analyzedList.push({
              company: companyName, clickUrl: offer.clickUrl ?? "#", stock, moq,
              packaging: offer.packaging ?? "N/A", priceBreaksArr: prices,
              buyQty, unitPrice, totalPrice,
            });
          }
        }
      }
      analyzedList.sort((a, b) => a.totalPrice - b.totalPrice);
      analyzedList = analyzedList.slice(0, 10);
    }

    const top3 = calculateBestCombinations(rawOffers, targetQty);
    return { list: analyzedList, top3, rawOffers };
  } catch {
    return { list: [], top3: [], rawOffers: [] };
  }
}

// ─── 서브 컴포넌트: 조합 패널 ──────────────────────────────
function ComboList({ combos, palette }: { combos: Combo[]; palette: "gold" | "blue" }) {
  const borders = palette === "gold"
    ? ["border-l-yellow-400", "border-l-gray-400", "border-l-amber-700"]
    : ["border-l-blue-600", "border-l-blue-400", "border-l-blue-300"];
  const ranks = ["1위", "2위", "3위"];
  return (
    <div className="space-y-2">
      {combos.map((combo, idx) => (
        <div key={idx} className={`flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2 border-l-4 ${borders[idx]}`}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-bold text-gray-400 w-6">{ranks[idx]}</span>
            <span className="text-gray-700">
              {combo.parts.map((p, pi) => (
                <span key={pi}>
                  {pi > 0 && <span className="text-gray-400 mx-1">+</span>}
                  <span className="font-semibold">{p.company}</span>
                  <span className="text-gray-500 ml-1">({p.qty.toLocaleString()}개)</span>
                </span>
              ))}
            </span>
          </div>
          <span className="text-blue-600 font-bold text-sm whitespace-nowrap ml-4">
            ${combo.cost.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── 서브 컴포넌트: 결과 아코디언 아이템 ──────────────────
function ResultItem({
  result, onToggle, onCustomCalc,
}: {
  result: PartResult;
  onToggle: (id: string) => void;
  onCustomCalc: (id: string, checked: string[]) => void;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [customCombos, setCustomCombos] = useState<Combo[] | null>(null);

  const toggleCheck = (company: string) => {
    setChecked((prev) =>
      prev.includes(company) ? prev.filter((c) => c !== company) : [...prev, company]
    );
    setCustomCombos(null);
  };

  const handleCustomCalc = () => {
    const selectedOffers = result.rawOffers.filter((o) => checked.includes(o.company));
    const combos = calculateBestCombinations(selectedOffers, result.targetQty);
    setCustomCombos(combos);
    onCustomCalc(result.id, checked);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* 헤더 */}
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => onToggle(result.id)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-800">{result.partName}</span>
          <span className="text-xs text-gray-400">필요 {result.targetQty.toLocaleString()}개</span>
        </div>
        <div className="flex items-center gap-2">
          {result.list.length > 0
            ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700">완료</span>
            : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600">결과 없음</span>
          }
          <span className="text-gray-400 text-xs">{result.open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* 콘텐츠 */}
      {result.open && (
        <div className="border-t border-gray-100 p-5 space-y-4">

          {/* 시스템 추천 Top3 */}
          {result.top3.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-amber-800 mb-3">💡 시스템 기본 추천 조합 (Top 3)</h4>
              <ComboList combos={result.top3} palette="gold" />
            </div>
          )}

          {/* 커스텀 조합 결과 */}
          {customCombos && customCombos.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-blue-800 mb-3">✅ 선택한 업체 최적 조합</h4>
              <ComboList combos={customCombos} palette="blue" />
            </div>
          )}
          {customCombos && customCombos.length === 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              선택한 업체로 조합을 만들 수 없습니다.
            </div>
          )}

          {/* 커스텀 계산 버튼 */}
          {result.list.length > 0 && (
            <button
              onClick={handleCustomCalc}
              disabled={checked.length === 0}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {checked.length === 0
                ? "아래 테이블에서 업체를 선택하세요"
                : `✅ ${checked.length}개 선택 업체로 최적 조합 찾기`}
            </button>
          )}

          {/* 결과 테이블 */}
          {result.list.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">조건에 맞는 유통사가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[22%]">Distributor</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[12%]">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[10%]">Min Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[30%]">Price Breaks</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[10%]">Buy Qty</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-200 w-[16%]">Total ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.list.map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/30 transition-colors border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-blue-600 w-3.5 h-3.5"
                            checked={checked.includes(item.company)}
                            onChange={() => toggleCheck(item.company)}
                          />
                          <a href={item.clickUrl} target="_blank" rel="noreferrer"
                            className="font-semibold text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>
                            {item.company}
                          </a>
                        </label>
                      </td>
                      <td className="px-4 py-3 font-bold text-green-600">{item.stock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-600">{item.moq.toLocaleString()}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500 leading-relaxed">
                        {item.priceBreaksArr.map((p, pi) => (
                          <div key={pi}><span className="text-gray-400">{p.quantity.toLocaleString()}</span> ${p.price.toFixed(4)}</div>
                        ))}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800">{item.buyQty.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-blue-600 text-base">${item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────
export default function Feature1() {
  const [partInput, setPartInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [results, setResults] = useState<PartResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 엑셀 만들기 모달
  const [showModal, setShowModal] = useState(false);
  const [modalRows, setModalRows] = useState<{ part: string; qty: string }[]>([{ part: "", qty: "" }]);

  const addResult = useCallback((partName: string, targetQty: number, data: { list: AnalyzedItem[]; top3: Combo[]; rawOffers: RawOffer[] }) => {
    const id = Math.random().toString(36).slice(2, 9);
    setResults((prev) => [...prev, { id, partName, targetQty, ...data, open: true }]);
  }, []);

  const searchSingle = async () => {
    const part = partInput.trim();
    const qty = parseInt(qtyInput.trim()) || 1;
    if (!part) return;
    setLoading(true);
    const data = await fetchAndAnalyze(part, qty);
    addResult(part, qty, data);
    setPartInput("");
    setQtyInput("");
    setLoading(false);
  };

  const processExcelFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<[string, number]>(ws, { header: 1 }) as Array<[string, number]>;
    const items: { part: string; qty: number }[] = [];
    for (const row of rows) {
      const part = String(row[0] ?? "").trim();
      const qty = parseInt(String(row[1] ?? "1")) || 1;
      if (part && part.toLowerCase() !== "부품명") items.push({ part, qty });
    }
    if (items.length === 0) return;
    setResults([]);
    setLoading(true);
    for (const { part, qty } of items) {
      const data = await fetchAndAnalyze(part, qty);
      addResult(part, qty, data);
    }
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { processExcelFile(e.target.files[0]); e.target.value = ""; }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.[0]) processExcelFile(e.dataTransfer.files[0]);
  };

  const toggleAccordion = (id: string) => {
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, open: !r.open } : r));
  };

  const downloadResultExcel = () => {
    if (results.length === 0) return;
    const wb = XLSX.utils.book_new();
    for (const res of results) {
      const wsData: (string | number)[][] = [["Distributor", "Stock", "Min Qty", "Buy Qty", "Unit Price", "Total ($)"]];
      for (const item of res.list) {
        wsData.push([item.company, item.stock, item.moq, item.buyQty, item.unitPrice, parseFloat(item.totalPrice.toFixed(2))]);
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, res.partName.slice(0, 31));
    }
    XLSX.writeFile(wb, "AtoZ_검색결과.xlsx");
  };

  const downloadCreatedExcel = () => {
    const validRows = modalRows.filter((r) => r.part.trim());
    if (validRows.length === 0) return;
    const wsData: (string | number)[][] = [["부품명", "수량"]];
    for (const r of validRows) wsData.push([r.part, parseInt(r.qty) || 1]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "검색리스트");
    XLSX.writeFile(wb, "AtoZ_검색용_부품리스트.xlsx");
    setShowModal(false);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">

        {/* 상단 헤더 */}
        <header className="h-14 px-8 flex items-center justify-between border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">메뉴</span>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-700">부품 검색기</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowModal(true); setModalRows([{ part: "", qty: "" }]); }}
              className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              📝 엑셀 만들기
            </button>
            <button
              onClick={downloadResultExcel}
              disabled={results.length === 0}
              className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              💾 결과 저장
            </button>
          </div>
        </header>

        <div className="flex-1 p-6 space-y-5 overflow-auto">

          {/* 단일 검색 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">단일 부품 검색</p>
            <div className="flex gap-3">
              <div className="flex-[2] flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">부품명 (Part Number)</label>
                <input
                  type="text" value={partInput}
                  onChange={(e) => setPartInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchSingle()}
                  placeholder="예: STM32F103C8T6"
                  className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">필요 수량</label>
                <input
                  type="number" value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchSingle()}
                  placeholder="예: 80"
                  className="px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={searchSingle}
                  disabled={loading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-bold rounded-lg transition-colors"
                >
                  🔍 검색
                </button>
              </div>
            </div>
          </div>

          {/* 엑셀 업로드 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">엑셀 일괄 검색</p>
            <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50"}`}
            >
              <div className="text-4xl mb-3">📁</div>
              <p className="font-semibold text-gray-700 mb-1">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-gray-400">A열: 부품명 &nbsp;|&nbsp; B열: 필요 수량</p>
            </div>
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="flex flex-col items-center py-12 gap-4">
              <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500 font-medium">최적의 구매 조합을 계산 중입니다...</p>
            </div>
          )}

          {/* 결과 목록 */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">검색 결과 ({results.length}개)</p>
                <button onClick={() => setResults([])} className="text-xs text-gray-400 hover:text-red-500 transition-colors">전체 초기화</button>
              </div>
              {results.map((res) => (
                <ResultItem key={res.id} result={res} onToggle={toggleAccordion} onCustomCalc={() => {}} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* 엑셀 만들기 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col shadow-2xl border border-gray-200 max-h-[85vh]">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-800 mb-1">📝 검색용 엑셀 만들기</h2>
                  <p className="text-xs text-gray-400">부품명 → Tab → 수량 → Tab → 자동으로 다음 줄</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">✕</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
              {modalRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text" value={row.part} placeholder="부품명"
                    onChange={(e) => setModalRows((prev) => prev.map((r, i) => i === idx ? { ...r, part: e.target.value } : r))}
                    className="flex-[2] px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="number" value={row.qty} placeholder="수량"
                    onChange={(e) => setModalRows((prev) => prev.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && !e.shiftKey && idx === modalRows.length - 1) {
                        e.preventDefault();
                        setModalRows((prev) => [...prev, { part: "", qty: "" }]);
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    onClick={() => setModalRows((prev) => prev.filter((_, i) => i !== idx))}
                    className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100 text-sm"
                  >✕</button>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setModalRows((prev) => [...prev, { part: "", qty: "" }])}
                className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >➕ 부품 추가</button>
              <button
                onClick={downloadCreatedExcel}
                className="flex-[2] py-2.5 text-sm font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >📥 엑셀 다운로드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
