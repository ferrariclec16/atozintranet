import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  FileText, Upload, X, ChevronDown,
  AlertCircle, Loader2, Download, CheckCircle2,
  Search, Copy, Check, Save,
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
  const [outputRows, setOutputRows] = useState<OutputRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 복사 가능 컬럼
  const COPY_COLS = ["품목코드", "발주번호", "품목명"];

  const filteredRows = useMemo(() => {
    if (!outputRows) return null;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return outputRows;
    return outputRows.filter((r) =>
      COPY_COLS.some((col) => String(r[col] ?? "").toLowerCase().includes(q))
    );
  }, [outputRows, searchQuery]);

  useEffect(() => {
    (async () => {
      setIsLoadingCompanies(true);
      const { data, error } = await supabase.from("excel_mappings").select("company_name");
      if (error || !data) {
        setError("업체 목록을 불러오지 못했습니다.");
      } else {
        setCompanies(data.map((d: { company_name: string }) => d.company_name));
      }
      setIsLoadingCompanies(false);
    })();
  }, []);

  const processFile = useCallback(async (
    allRows: Record<string, unknown>[],
    company: string
  ) => {
    setIsProcessing(true);
    setError("");

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

    const itemNames = [
      ...new Set(allRows.map((r) => String(r[mapping.itemName] ?? "")).filter(Boolean)),
    ];

    const { data: masterList } = itemNames.length > 0
      ? await supabase.from("master_data").select("*").in("item_name", itemNames)
      : { data: [] };

    const masterMap: Record<string, MasterData> = {};
    (masterList || []).forEach((item: MasterData) => {
      masterMap[item.item_name] = item;
    });

    const rows: OutputRow[] = allRows.map((row) => {
      const itemName = String(row[mapping.itemName] ?? "");
      const db = masterMap[itemName] ?? ({} as MasterData);
      const orderQty = Number(row[mapping.orderQty] ?? "") || 0;
      const orderPrice = parseFloat(String(row[mapping.orderPrice] ?? "")) || 0;
      const purchasePrice = parseFloat(String(db.purchase_price ?? "")) || 0;
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

    setOutputRows(rows);
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
      setOutputRows(null);
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
    setOutputRows(null);
    setIsLoaded(false);
    setError("");
    setTotalRows(0);
    setSearchQuery("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = () => {
    const rows = filteredRows;
    if (!rows || rows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(rows, { header: OUTPUT_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "발주정리");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `AtoZELECTRON_발주정리_${selectedCompany}_${today}.xlsx`);
  };

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSaveResult = async () => {
    if (!outputRows || outputRows.length === 0 || !fileName) return;
    setIsSavingResult(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${BASE}/api/order-processing-log`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: selectedCompany,
          file_name: fileName,
          rows: outputRows,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "저장 실패");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSavingResult(false);
    }
  };

  const MASTER_COLS = ["매입가(입고가)", "마진", "재고", "매입처", "연락처", "위치"];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">발주서 정리</span>
        </header>

        <div className="flex-1 p-8 max-w-7xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">발주서 정리</h1>
            <p className="text-sm text-gray-500 mt-1">
              발주 엑셀을 업로드하면 마스터 DB 정보와 합쳐져 정리된 양식으로 출력됩니다.
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
              <p className="text-sm text-blue-700 font-medium">발주 항목 처리 중...</p>
            </div>
          )}

          {/* Step 3: 결과 */}
          {!isProcessing && outputRows !== null && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="font-semibold text-gray-800">발주 정리 결과</span>
                  <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${(filteredRows?.length ?? 0) > 0 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
                    {filteredRows?.length ?? 0}건
                    {searchQuery && outputRows && filteredRows && filteredRows.length !== outputRows.length && (
                      <span className="text-gray-400 font-normal ml-1">/ 전체 {outputRows.length}건</span>
                    )}
                  </span>
                </div>

                {outputRows.length > 0 && (
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveResult}
                        disabled={isSavingResult || saveSuccess}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          saveSuccess
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                        } disabled:opacity-60`}
                      >
                        {isSavingResult
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : saveSuccess
                            ? <Check className="w-4 h-4 text-green-600" />
                            : <Save className="w-4 h-4" />
                        }
                        {saveSuccess ? "저장 완료" : "결과 저장"}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Excel 다운로드
                      </button>
                    </div>
                    {saveSuccess ? (
                      <p className="text-xs text-green-600 font-medium">
                        ✓ 사이드바의 <span className="font-bold">발주서 기록</span> 탭에서 언제든지 다시 확인할 수 있습니다.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">
                        결과 저장 후 <span className="font-medium text-gray-500">발주서 기록</span> 탭에서 다시 조회 및 다운로드할 수 있습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 검색창 */}
              {outputRows.length > 0 && (
                <div className="px-6 py-3 border-b border-gray-100">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="품목코드, 발주번호, 품목명 검색..."
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 placeholder-gray-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium"
                      >
                        지우기
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(filteredRows?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">
                    {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다` : "처리된 항목이 없습니다"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-400 border-r border-gray-700 w-10">#</th>
                        {OUTPUT_COLUMNS.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-3 text-center text-xs font-medium text-white whitespace-nowrap border-r border-gray-700 last:border-r-0"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(filteredRows || []).map((row, i) => (
                        <tr key={i} className={`hover:bg-gray-50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-400 border-r border-gray-100">{i + 1}</td>
                          {OUTPUT_COLUMNS.map((col) => {
                            const val = row[col];
                            let displayVal = "";
                            if (col === "마진" && typeof val === "number") {
                              displayVal = val >= 0 ? `+${val.toLocaleString()}` : val.toLocaleString();
                            } else if (typeof val === "number" && val !== 0) {
                              displayVal = val.toLocaleString();
                            } else {
                              displayVal = String(val ?? "");
                            }
                            const isMasterCol = MASTER_COLS.includes(col);
                            const isCopyCol = COPY_COLS.includes(col);

                            if (isCopyCol) {
                              const cellKey = `${col}-${i}`;
                              const isCopied = copiedCell === cellKey && displayVal !== "";
                              return (
                                <td key={col} className="px-3 py-2.5 text-center whitespace-nowrap border-r border-gray-100 text-xs text-gray-700">
                                  <div className="flex items-center justify-center gap-1.5 group">
                                    <span>{displayVal}</span>
                                    {displayVal && (
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(displayVal).then(() => {
                                            setCopiedCell(cellKey);
                                            setTimeout(() => setCopiedCell(null), 1500);
                                          });
                                        }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600"
                                        title="복사"
                                      >
                                        {isCopied
                                          ? <Check className="w-3 h-3 text-green-500" />
                                          : <Copy className="w-3 h-3" />
                                        }
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={col}
                                className={`px-3 py-2.5 text-center whitespace-nowrap border-r border-gray-100 last:border-r-0 text-xs ${isMasterCol ? "text-gray-700 bg-blue-50/30" : "text-gray-700"}`}
                              >
                                {displayVal}
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
        </div>
      </main>
    </div>
  );
}
