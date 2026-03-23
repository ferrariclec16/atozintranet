import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  FileText, Upload, Download, X, ChevronDown,
  AlertCircle, Loader2, DatabaseZap, CheckCircle2, Save,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const OUTPUT_COLUMNS = [
  "발주일자", "납기일자", "발주구분", "품목코드", "발주번호",
  "품목명", "발주수량", "발주단가", "납품금액", "납품여부",
  "매입가(입고가)", "마진", "재고", "비고", "매입처", "연락처", "위치",
];

const COMPLETED_STATUS = "발주완결";

interface MappingJson {
  orderDate: string;
  dueDate: string;
  orderType: string;
  itemCode: string;
  orderNo?: string;
  itemName: string;
  orderQty: string;
  orderPrice: string;
  deliveryAmount: string;
  deliveryStatus: string;
  note: string;
}

interface MasterData {
  item_name: string;
  purchase_price: number;
  supplier: string;
  contact: string;
  location: string;
  stock: number;
}

type OutputRow = Record<string, string | number>;

function excelDateToString(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  if (isNaN(n) || n < 30000 || n > 90000) return String(val);
  const date = new Date(Math.round((n - 25569) * 86400 * 1000));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OrderProcessing() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [error, setError] = useState<string>("");

  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [completedRows, setCompletedRows] = useState<OutputRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingCompanies(true);
      const { data, error } = await supabase.from("excel_mappings").select("company_name");
      if (error || !data) {
        setError("업체 목록을 불러오지 못했습니다.");
      } else {
        const names = data.map((d: { company_name: string }) => d.company_name);
        setCompanies(names);
      }
      setIsLoadingCompanies(false);
    })();
  }, []);

  // ── DB Excel 출력 (DB 파일 형식) ─────────────────────────────────
  const handleDownloadDbFormat = (rows: OutputRow[]) => {
    if (!rows.length) return;
    const header = ["품목코드", "품명", "수량", "납품가", "합계", "", "원가", "합계(원가)", "구매처"];
    const aoa: (string | number)[][] = [header];
    rows.forEach((r) => {
      aoa.push([
        String(r["품목코드"] ?? ""),
        String(r["품명"] ?? ""),
        Number(r["수량"]) || 0,
        Number(r["납품가"]) || 0,
        Number(r["합계"]) || 0,
        "",
        Number(r["원가"]) || 0,
        Number(r["합계(원가)"]) || 0,
        String(r["구매처"] ?? ""),
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "내수");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `AtoZELECTRON_DB_${today}.xlsx`);
  };

  // ── 발주서 처리 ────────────────────────────────────────────────
  const processFile = useCallback(async (
    allRows: Record<string, unknown>[],
    company: string
  ) => {
    setIsProcessing(true);
    setError("");
    setSaveMessage("");

    const { data: mappingData, error: mappingError } = await supabase
      .from("excel_mappings")
      .select("mapping_json")
      .eq("company_name", company)
      .single();

    if (mappingError || !mappingData) {
      setError("업체 매핑 정보를 불러오지 못했습니다.");
      setIsProcessing(false);
      return;
    }

    const mapping: MappingJson = mappingData.mapping_json;
    setTotalRows(allRows.length);

    const completed = allRows.filter((row) => {
      const status = String(row[mapping.deliveryStatus] ?? "").trim();
      return status === COMPLETED_STATUS;
    });

    const itemNames = [
      ...new Set(completed.map((r) => String(r[mapping.itemName] ?? "")).filter(Boolean)),
    ];

    const { data: masterList } = itemNames.length > 0
      ? await supabase.from("master_data").select("*").in("item_name", itemNames)
      : { data: [] };

    const masterMap: Record<string, MasterData> = {};
    (masterList || []).forEach((item: MasterData) => {
      masterMap[item.item_name] = item;
    });

    const outputRows: OutputRow[] = completed.map((row) => {
      const itemName = String(row[mapping.itemName] ?? "");
      const db = masterMap[itemName] ?? ({} as MasterData);
      const orderQty = Number(row[mapping.orderQty] ?? "") || 0;
      const orderPrice = parseFloat(String(row[mapping.orderPrice] ?? "")) || 0;
      // TODO: 원가는 구매 당시 가격으로 추후 수정 필요
      const purchasePrice = parseFloat(String(db.purchase_price ?? "")) || 0;
      // 마진 = 발주수량 × (발주단가 - 원가)
      const margin = orderQty > 0 && orderPrice > 0 && purchasePrice > 0
        ? orderQty * (orderPrice - purchasePrice)
        : "";

      return {
        "발주일자": excelDateToString(row[mapping.orderDate]),
        "납기일자": excelDateToString(row[mapping.dueDate]),
        "발주구분": String(row[mapping.orderType] ?? ""),
        "품목코드": String(row[mapping.itemCode] ?? ""),
        "발주번호": String(row[mapping.orderNo ? mapping.orderNo : "발주번호"] ?? ""),
        "품목명": itemName,
        "발주수량": orderQty || "",
        "발주단가": orderPrice || "",
        "납품금액": Number(row[mapping.deliveryAmount] ?? "") || "",
        "납품여부": String(row[mapping.deliveryStatus] ?? ""),
        "매입가(입고가)": purchasePrice || "",
        "마진": margin,
        "재고": db.stock ?? "",
        "비고": String(row[mapping.note] ?? ""),
        "매입처": db.supplier ?? "",
        "연락처": db.contact ?? "",
        "위치": db.location ?? "",
      };
    });

    setCompletedRows(outputRows);
    setIsProcessing(false);
  }, []);

  const readExcel = useCallback((file: File, company: string) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError("엑셀 파일(.xlsx, .xls, .csv)만 업로드 가능합니다.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });

      let allRows: Record<string, unknown>[] = [];
      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
        if (rows.length > 0 && "발주상태" in rows[0]) {
          allRows = rows;
          break;
        }
      }
      if (allRows.length === 0) {
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        allRows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      }

      setFileName(file.name);
      setIsLoaded(true);
      setCompletedRows(null);
      processFile(allRows, company);
    };
    reader.readAsArrayBuffer(file);
  }, [processFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) readExcel(file, selectedCompany);
    },
    [readExcel, selectedCompany]
  );

  const handleClear = () => {
    setFileName("");
    setCompletedRows(null);
    setIsLoaded(false);
    setError("");
    setSaveMessage("");
    setTotalRows(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadOrder = () => {
    if (!completedRows || completedRows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(completedRows, { header: OUTPUT_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "발주완결_결과");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `AtoZELECTRON_발주완결_${selectedCompany}_${today}.xlsx`);
  };

  const handleSaveToDb = async () => {
    if (!completedRows || completedRows.length === 0) return;
    setIsSaving(true);
    setSaveMessage("");

    const rows = completedRows.map((row) => ({
      company_name: selectedCompany,
      order_date: String(row["발주일자"]),
      due_date: String(row["납기일자"]),
      order_type: String(row["발주구분"]),
      item_code: String(row["품목코드"]),
      order_no: String(row["발주번호"]),
      item_name: String(row["품목명"]),
      order_qty: Number(row["발주수량"]) || 0,
      order_price: Number(row["발주단가"]) || 0,
      delivery_amount: Number(row["납품금액"]) || 0,
      delivery_status: String(row["납품여부"]),
      note: String(row["비고"]),
    }));

    try {
      const res = await fetch("/api/purchase-history/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage(`✅ ${data.inserted}개 항목이 DB에 저장되었습니다.`);
      } else {
        setSaveMessage(`❌ 저장 실패: ${data.error || "알 수 없는 오류"}`);
      }
    } catch {
      setSaveMessage("❌ 서버 연결 오류가 발생했습니다.");
    }
    setIsSaving(false);
  };

  // ── DB 조회용 OutputRow (DB Excel 형식) 변환 ─────────────────────
  const completedRowsAsDbFormat = (): OutputRow[] => {
    if (!completedRows) return [];
    return completedRows.map((r) => ({
      "품목코드": r["품목코드"],
      "품명": r["품목명"],
      "수량": r["발주수량"],
      "납품가": r["발주단가"],
      "합계": Number(r["발주수량"]) * Number(r["발주단가"]),
      "원가": r["매입가(입고가)"],
      "합계(원가)": Number(r["매입가(입고가)"]) > 0
        ? Number(r["매입가(입고가)"]) * Number(r["발주수량"])
        : "",
      "구매처": r["매입처"],
    }));
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">발주서 정리</span>
        </header>

        <div className="flex-1 p-8 max-w-6xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900">발주서 정리</h1>
                <p className="text-sm text-gray-500 mt-1">
                  발주 엑셀을 업로드하면 <strong>발주완결</strong> 항목이 자동 추출되어 원하는 양식으로 출력되고 DB에 저장됩니다.
                </p>
              </div>

              {/* Step 1: 업체 선택 */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                  <span className="font-semibold text-gray-800">담당 업체 선택</span>
                </div>
                {isLoadingCompanies ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> 업체 목록 불러오는 중...
                  </div>
                ) : (
                  <div className="relative inline-block">
                    <select
                      value={selectedCompany}
                      onChange={(e) => { setSelectedCompany(e.target.value); handleClear(); }}
                      className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                    >
                      <option value="" disabled>— 선택 —</option>
                      {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Step 2: 파일 업로드 */}
              <div className={`bg-white rounded-xl border p-6 mb-4 shadow-sm transition-opacity ${!selectedCompany ? "border-gray-100 opacity-50 pointer-events-none" : "border-gray-200"}`}>
                <div className="flex items-center gap-2 mb-4">
                  <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${!selectedCompany ? "bg-gray-300" : "bg-blue-600"}`}>2</span>
                  <span className="font-semibold text-gray-800">발주 엑셀 업로드</span>
                  {!selectedCompany && <span className="text-xs text-gray-400 ml-1">— 업체를 먼저 선택해주세요</span>}
                </div>
                {!isLoaded ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                      isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                    }`}
                  >
                    <Upload className={`w-9 h-9 mx-auto mb-3 ${isDragging ? "text-blue-500" : "text-gray-300"}`} />
                    <p className="text-sm font-medium text-gray-600">발주 엑셀 파일을 이곳에 드래그 앤 드롭</p>
                    <p className="text-xs text-gray-400 mt-1">또는 클릭하여 파일 선택</p>
                    <p className="text-xs text-gray-300 mt-3">.xlsx · .xls · .csv 지원</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) readExcel(f, selectedCompany); }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-800 truncate">{fileName}</p>
                      <p className="text-xs text-green-600">총 {totalRows}행 로드 완료</p>
                    </div>
                    <button onClick={handleClear} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 처리 중 */}
              {isProcessing && (
                <div className="flex items-center gap-3 px-5 py-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                  <p className="text-sm text-blue-700 font-medium">발주완결 항목 추출 중...</p>
                </div>
              )}

              {/* 결과 */}
              {!isProcessing && completedRows !== null && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="font-semibold text-gray-800">발주완결 항목</span>
                      <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${completedRows.length > 0 ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {completedRows.length}건
                      </span>
                      {totalRows > 0 && (
                        <span className="text-xs text-gray-400">(전체 {totalRows}행 중)</span>
                      )}
                    </div>

                    {completedRows.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {saveMessage && (
                          <span className={`text-xs font-medium ${saveMessage.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
                            {saveMessage}
                          </span>
                        )}
                        <button
                          onClick={handleSaveToDb}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          DB 저장
                        </button>
                        <button
                          onClick={handleDownloadOrder}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          원하는양식 Excel
                        </button>
                        <button
                          onClick={() => handleDownloadDbFormat(completedRowsAsDbFormat())}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          DB형식 Excel
                        </button>
                      </div>
                    )}
                  </div>

                  {completedRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <DatabaseZap className="w-10 h-10 text-gray-200 mb-3" />
                      <p className="text-sm font-medium text-gray-500">발주완결 항목이 없습니다</p>
                      <p className="text-xs text-gray-400 mt-1">
                        업로드한 파일에서 <strong>발주상태 = "발주완결"</strong>인 행을 찾지 못했습니다.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-800">
                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 border-r border-gray-700 w-10">#</th>
                            {OUTPUT_COLUMNS.map((col) => {
                              const isMasterCol = ["매입가(입고가)", "마진", "재고", "매입처", "연락처", "위치"].includes(col);
                              return (
                                <th key={col} className={`px-3 py-3 text-center text-xs font-medium whitespace-nowrap border-r border-gray-700 last:border-r-0 ${isMasterCol ? "text-yellow-300" : "text-white"}`}>
                                  {col}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {completedRows.map((row, i) => (
                            <tr key={i} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                              <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100">{i + 1}</td>
                              {OUTPUT_COLUMNS.map((col) => {
                                const isMasterCol = ["매입가(입고가)", "마진", "재고", "매입처", "연락처", "위치"].includes(col);
                                const val = row[col];
                                let displayVal = "";
                                if (col === "마진" && typeof val === "number") {
                                  displayVal = val >= 0 ? `+${val.toLocaleString()}` : val.toLocaleString();
                                } else if (typeof val === "number" && val !== 0) {
                                  displayVal = val.toLocaleString();
                                } else {
                                  displayVal = String(val ?? "");
                                }
                                return (
                                  <td key={col} className={`px-3 py-2.5 text-center whitespace-nowrap border-r border-gray-100 last:border-r-0 text-xs ${isMasterCol ? "text-amber-700 bg-amber-50/40 font-medium" : "text-gray-700"} ${col === "납품여부" && displayVal === COMPLETED_STATUS ? "text-green-700 font-semibold" : ""} ${col === "매입처" && !displayVal ? "text-red-400 italic" : ""}`}>
                                    {col === "매입처" && !displayVal ? "DB 미등록" : displayVal}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 안내 */}
              {!isLoaded && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 사용 방법</h3>
                  <ol className="space-y-2 text-sm text-gray-600">
                    <li><strong>① 업체 선택</strong> — 발주 파일에 해당하는 거래처를 선택합니다.</li>
                    <li><strong>② 발주 엑셀 업로드</strong> — 내부 발주 파일을 업로드합니다. (<code className="bg-gray-100 px-1 rounded">발주상태</code> 컬럼 포함)</li>
                    <li><strong>③ 자동 추출</strong> — <strong>발주완결</strong> 상태인 항목이 자동으로 추출됩니다.</li>
                    <li><strong>④ Excel 다운로드</strong> — 원하는 양식 또는 DB형식으로 Excel을 저장합니다.</li>
                    <li><strong>⑤ DB 저장</strong> — 발주완결 이력을 DB에 저장합니다.</li>
                  </ol>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                      ※ <span className="text-amber-600 font-medium">노란색 컬럼</span>(매입가·마진·재고·매입처·연락처·위치)은 마스터 DB에서 자동으로 채워집니다.
                      원가는 추후 구매 당시 가격 기반으로 개선 예정입니다.
                    </p>
                  </div>
                </div>
              )}
        </div>
      </main>
    </div>
  );
}
