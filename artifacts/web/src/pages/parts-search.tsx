import { useState, useRef, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import * as XLSX from "xlsx";

const WHITELIST = ["digi", "mouser", "arrow", "farnell", "element14", "tti", "verical", "future", "chip one", "texas"];

function checkTrusted(name: string): boolean {
  const lower = name.toLowerCase();
  if (WHITELIST.some((w) => lower.includes(w))) return true;
  if (lower === "ti" || lower === "texas instruments") return true;
  return false;
}

interface Offer {
  company: string;
  clickUrl: string;
  stock: number;
  moq: number;
  packaging: string;
  priceBreaks: { quantity: number; price: number }[];
  buyQty: number;
  unitPrice: number;
  totalPrice: number;
}

interface PartResult {
  partName: string;
  qty: number;
  offers: Offer[];
}

interface ModalRow {
  id: number;
  part: string;
  qty: string;
}

async function fetchAndAnalyze(partInput: string, targetQty: number): Promise<Offer[]> {
  const res = await fetch("/api/parts/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ part_number: partInput }),
  });
  const resData = await res.json();
  if (resData.status !== "success") return [];

  const parts = resData.data?.data?.supSearch?.results;
  if (!parts || parts.length === 0) return [];

  const allOffers: Offer[] = [];

  parts.forEach((resultItem: any) => {
    const targetPart = resultItem.part;
    if (!targetPart) return;
    (targetPart.sellers || []).forEach((seller: any) => {
      const companyName = seller.company?.name || "알 수 없는 유통사";
      if (!checkTrusted(companyName)) return;

      (seller.offers || []).forEach((offer: any) => {
        const clickUrl = offer.clickUrl || "#";
        const moq = offer.moq || 1;
        const stock = offer.inventoryLevel || 0;
        const packaging = offer.packaging || "N/A";
        const buyQty = Math.max(targetQty, moq);
        const prices: { quantity: number; price: number }[] = offer.prices || [];

        let unitPrice = 0;
        let totalPrice = Infinity;
        if (prices.length > 0) {
          const valid = prices.filter((p) => p.quantity <= buyQty);
          if (valid.length > 0) {
            unitPrice = valid[valid.length - 1].price;
            totalPrice = buyQty * unitPrice;
          }
        }

        if (totalPrice !== Infinity) {
          allOffers.push({ company: companyName, clickUrl, stock, moq, packaging, priceBreaks: prices, buyQty, unitPrice, totalPrice });
        }
      });
    });
  });

  // 업체+패키징 기준 최저가 1개만
  const best: Record<string, Offer> = {};
  allOffers.forEach((item) => {
    const key = `${item.company}_${item.packaging}`;
    if (!best[key] || item.totalPrice < best[key].totalPrice) best[key] = item;
  });
  return Object.values(best).sort((a, b) => a.totalPrice - b.totalPrice);
}

export default function PartsSearch() {
  const [results, setResults] = useState<PartResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [partInput, setPartInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [modalRows, setModalRows] = useState<ModalRow[]>([{ id: 1, part: "", qty: "" }]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextModalId = useRef(2);

  const toggleAccordion = (idx: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const searchSingle = async () => {
    const part = partInput.trim();
    const qty = parseInt(qtyInput.replace(/,/g, "")) || 1;
    if (!part) return alert("부품 번호를 입력해주세요.");
    setLoading(true);
    setResults([]);
    setOpenIds(new Set());
    const offers = await fetchAndAnalyze(part, qty);
    setResults([{ partName: part, qty, offers }]);
    setOpenIds(new Set([0]));
    setLoading(false);
  };

  const processParts = async (parts: { partName: string; qty: number }[]) => {
    if (parts.length === 0) return alert("유효한 데이터를 찾을 수 없습니다.");
    setLoading(true);
    setResults([]);
    setOpenIds(new Set());
    const allResults: PartResult[] = [];
    for (const { partName, qty } of parts) {
      const offers = await fetchAndAnalyze(partName, qty);
      allResults.push({ partName, qty, offers });
    }
    setResults(allResults);
    setOpenIds(new Set([0]));
    setLoading(false);
  };

  const setPendingFileFromList = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      alert("한 번에 하나의 파일만 업로드할 수 있습니다.");
      return;
    }
    setPendingFile(files[0]);
  };

  const startExcelSearch = useCallback(() => {
    if (!pendingFile) return;
    const file = pendingFile;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
      const parts: { partName: string; qty: number }[] = [];
      json.forEach((row) => {
        if (!row[0] || ["품명", "부품명"].includes(String(row[0]).trim())) return;
        let raw = String(row[0]).trim();

        if (raw.includes("->")) {
          raw = raw.split("->").pop()!.trim();
        }

        const baseName = raw.includes(",") ? raw.split(",").pop()!.trim() : raw;

        const names: string[] = [];
        const parenMatch = baseName.match(/^(.+?)\((.+?)\)(.*)$/);
        if (parenMatch) {
          const outer = (parenMatch[1] + parenMatch[3]).trim();
          const inner = parenMatch[2].trim();
          if (outer) names.push(outer);
          if (inner) names.push(inner);
        } else {
          names.push(baseName);
        }

        for (let col = 1; col <= 3; col++) {
          if (row[col]) {
            const q = parseInt(String(row[col]).replace(/,/g, "").trim());
            if (!isNaN(q) && q > 0) {
              names.forEach((n) => { if (n) parts.push({ partName: n, qty: q }); });
            }
          }
        }
      });
      await processParts(parts);
    };
    reader.readAsArrayBuffer(file);
  }, [pendingFile]);

  const downloadBatchExcel = async () => {
    if (results.length === 0) return;
    try {
      const res = await fetch("/api/parts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error("Excel 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "AtoZ_단가비교_피벗.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Excel 다운로드 중 오류가 발생했습니다.");
    }
  };

  const downloadCreatedExcel = () => {
    const wsData: (string | number)[][] = [["부품명", "수량1", "수량2", "수량3"]];
    let hasData = false;
    modalRows.forEach(({ part, qty }) => {
      const p = part.trim();
      const q = parseInt(qty) || 1;
      if (p) { wsData.push([p, q, "", ""]); hasData = true; }
    });
    if (!hasData) return alert("입력된 데이터가 없습니다.");
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "검색리스트");
    XLSX.writeFile(wb, "AtoZ_검색용_부품리스트.xlsx");
    setModalOpen(false);
  };

  const addModalRow = () => {
    setModalRows((prev) => [...prev, { id: nextModalId.current++, part: "", qty: "" }]);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">부품 검색기</span>
        </header>

        <div className="flex-1 p-6 max-w-6xl w-full mx-auto">
          {/* 상단 버튼 */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-xl font-bold text-blue-600">AtoZ 부품 검색기</h1>
              <p className="text-sm text-gray-500 mt-0.5">신뢰하는 유통사(Digi-Key, Mouser, Arrow 등)의 최저가를 패키징별로 검색합니다.</p>
              <p className="text-sm text-red-500 font-semibold">업체 이름을 클릭하면 구매페이지로 바로 이동합니다.</p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowSampleModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <span className="text-base">🗒️</span>
                엑셀 양식 보기
              </button>
              <button
                onClick={() => { setModalOpen(true); setModalRows([{ id: 1, part: "", qty: "" }]); }}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                📝 직접 엑셀 만들기
              </button>
              <button
                onClick={downloadBatchExcel}
                disabled={results.length === 0}
                className="px-4 py-2 bg-green-700 text-white text-sm font-bold rounded-lg hover:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                💾 결과 엑셀 저장
              </button>
            </div>
          </div>

          {/* 검색 입력 */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={partInput}
              onChange={(e) => setPartInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSingle()}
              placeholder="부품명 (예: STM32F103C8T6)"
              className="flex-[2] px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchSingle()}
              placeholder="필요 수량 (예: 80)"
              className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={searchSingle}
              className="px-6 py-3 bg-blue-600 text-white text-base font-bold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              검색
            </button>
          </div>

          {/* 드래그 앤 드롭 */}
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" multiple
            onChange={(e) => { setPendingFileFromList(e.target.files); e.target.value = ""; }} />

          {pendingFile ? (
            <div className="w-full mb-6 border-2 border-blue-400 bg-blue-50 rounded-xl px-6 pt-4 pb-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{pendingFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(pendingFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 hover:bg-red-100 text-gray-500 hover:text-red-600 text-lg font-bold transition-colors"
                  title="파일 삭제"
                >×</button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={startExcelSearch}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  🔍 엑셀 검색
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = e.dataTransfer.files;
                if (files.length > 1) { alert("한 번에 하나의 파일만 업로드할 수 있습니다."); return; }
                if (files.length === 1) setPendingFile(files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-8 border-2 border-dashed rounded-xl text-center cursor-pointer mb-6 transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-blue-300 bg-blue-50/50 hover:bg-blue-50"}`}
            >
              <p className="text-blue-600 font-bold text-base">📁 이곳에 엑셀 파일을 드래그해서 넣거나 클릭하여 업로드하세요.</p>
              <p className="text-gray-400 text-sm mt-1">(A열: 부품명, B열: 필요 수량) 형식으로 작성된 엑셀</p>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="text-center text-blue-600 font-bold text-base my-6 animate-pulse">🔍 검색중입니다...</div>
          )}

          {/* 결과 아코디언 */}
          <div className="space-y-3">
            {results.map((result, idx) => {
              const isOpen = openIds.has(idx);
              const hasResults = result.offers.length > 0;
              return (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  <div
                    className="bg-gray-100 px-5 py-4 flex justify-between items-center cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => toggleAccordion(idx)}
                  >
                    <span className="font-bold text-base">
                      🔍 {result.partName}{" "}
                      <span className="text-sm text-gray-500 font-normal">(수량: {result.qty.toLocaleString()}개)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {hasResults
                        ? <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-semibold">완료</span>
                        : <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 font-semibold">결과 없음</span>}
                      <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse" style={{ whiteSpace: "nowrap" }}>
                        <thead>
                          <tr className="bg-gray-700 text-white">
                            {["Distributor", "Pkg", "Stock", "Min Qty", "Price Breaks", "Buy Qty", "Total ($)"].map((h) => (
                              <th key={h} className="px-3 py-3 text-left font-normal border-r border-gray-600 last:border-r-0">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {!hasResults ? (
                            <tr>
                              <td colSpan={7} className="text-center py-5 text-gray-400">
                                조건에 맞는 화이트리스트 유통사가 없습니다.
                              </td>
                            </tr>
                          ) : (
                            result.offers.map((offer, oidx) => {
                              const isShortage = offer.stock < result.qty;
                              const rowCls = isShortage ? "text-red-600" : "text-gray-700";
                              return (
                                <tr key={oidx} className={`border-t border-gray-100 hover:bg-gray-50 ${rowCls}`}>
                                  <td className="px-3 py-3 border-r border-gray-100">
                                    {offer.clickUrl !== "#" ? (
                                      <a href={offer.clickUrl} target="_blank" rel="noopener noreferrer"
                                        className="underline font-bold" style={{ color: isShortage ? "#d93025" : "#1a73e8" }}>
                                        {offer.company} ↗
                                      </a>
                                    ) : (
                                      <strong>{offer.company}</strong>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 border-r border-gray-100">
                                    <span className={`text-xs px-2 py-1 rounded ${isShortage ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600"}`}>
                                      {offer.packaging}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 border-r border-gray-100">
                                    {isShortage
                                      ? `${offer.stock.toLocaleString()} (재고부족)`
                                      : offer.stock.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 border-r border-gray-100">{offer.moq.toLocaleString()}</td>
                                  <td className="px-3 py-3 border-r border-gray-100 font-mono text-xs leading-relaxed">
                                    {offer.priceBreaks.map((p, pi) => (
                                      <div key={pi}>
                                        <span>{p.quantity.toLocaleString()}</span>{" "}
                                        <span>${p.price.toFixed(4)}</span>
                                      </div>
                                    ))}
                                  </td>
                                  <td className="px-3 py-3 border-r border-gray-100 font-bold text-sm">
                                    {offer.buyQty.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-3 font-bold text-base" style={{ color: isShortage ? "#d93025" : "#1a73e8" }}>
                                    ${offer.totalPrice.toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* 엑셀 만들기 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-[500px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-start border-b pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-blue-600">📝 검색용 엑셀 만들기</h2>
                <p className="text-xs text-gray-400 mt-1">부품명 → Tab → 수량 → Tab → 새 부품 자동 추가</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-2xl text-gray-400 hover:text-gray-600 leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-1 mb-4 space-y-2">
              {modalRows.map((row, ridx) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="부품명"
                    value={row.part}
                    onChange={(e) => setModalRows((prev) => prev.map((r) => r.id === row.id ? { ...r, part: e.target.value } : r))}
                    className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    type="number"
                    placeholder="수량"
                    value={row.qty}
                    onChange={(e) => setModalRows((prev) => prev.map((r) => r.id === row.id ? { ...r, qty: e.target.value } : r))}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && !e.shiftKey && ridx === modalRows.length - 1) {
                        e.preventDefault();
                        addModalRow();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={() => setModalRows((prev) => prev.filter((r) => r.id !== row.id))}
                    className="px-2 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold hover:bg-red-100"
                  >❌</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t pt-4">
              <button onClick={addModalRow} className="flex-1 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-bold text-sm hover:bg-gray-200">
                ➕ 부품 추가
              </button>
              <button onClick={downloadCreatedExcel} className="flex-1 py-2 bg-green-700 text-white rounded-lg font-bold text-sm hover:bg-green-800">
                📥 만든 엑셀 다운로드
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 샘플 양식 모달 */}
      {showSampleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗒️</span>
                <h2 className="text-base font-bold text-gray-900">부품 검색 엑셀 양식</h2>
              </div>
              <button onClick={() => setShowSampleModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {/* 샘플 표 */}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-8 py-2 px-3 text-center text-xs text-gray-400 bg-gray-50 border-r border-gray-200"></th>
                    {[
                      { col: "A", label: "부품명", color: "text-green-700 bg-green-50" },
                      { col: "B", label: "가격1",  color: "text-orange-600 bg-orange-50" },
                      { col: "C", label: "가격2",  color: "text-orange-600 bg-orange-50" },
                      { col: "D", label: "가격3",  color: "text-orange-600 bg-orange-50" },
                    ].map(({ col, color }) => (
                      <th key={col} className={`py-2 px-4 text-center text-xs font-bold border-r last:border-r-0 border-gray-200 ${color}`}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 text-center text-xs text-gray-400 border-r border-gray-200">1</td>
                    <td className="py-2 px-4 text-xs font-semibold text-gray-700 border-r border-gray-200">부품명 (필수)</td>
                    <td className="py-2 px-4 text-xs font-semibold text-gray-700 border-r border-gray-200">가격1 (선택)</td>
                    <td className="py-2 px-4 text-xs font-semibold text-gray-700 border-r border-gray-200">가격2 (선택)</td>
                    <td className="py-2 px-4 text-xs font-semibold text-gray-700">가격3 (선택)</td>
                  </tr>
                  {[
                    ["STM32F103C8T6", "1500", "1600", "1450"],
                    ["LM358",         "200",  "220",  ""],
                    ["ATmega328P",    "800",  "",     ""],
                  ].map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 text-center text-xs text-gray-400 border-r border-gray-200">{i + 2}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`py-2 px-4 text-xs border-r last:border-r-0 border-gray-100 ${cell ? "text-gray-700" : "text-gray-300 italic"}`}>
                          {cell || "비워도 가능"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} className="py-2 px-4 text-center text-xs text-gray-400 italic">… 하위 데이터 계속</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setShowSampleModal(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
