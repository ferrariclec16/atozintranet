import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  FileText, Upload, Search, Download, X, ChevronDown,
  AlertCircle, Loader2, DatabaseZap, Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── 파일 업로드 결과에 이력 집계를 붙인 17+4 컬럼 양식 ─────────────
const FILE_COLUMNS = [
  "발주일자", "납기일자", "발주구분", "품목코드", "발주번호",
  "품목명", "발주수량", "발주단가", "납품금액", "납품여부",
  "매입가(입고가)", "마진", "재고", "비고", "매입처", "연락처", "위치",
  "총발주수량(이력)", "총발주금액(이력)", "발주횟수(이력)", "최근발주일(이력)",
];

// ── DB 전용 검색 결과 컬럼 ─────────────────────────────────────────
const DB_COLUMNS = [
  "품목명", "발주횟수", "총발주수량", "총발주금액", "최근발주일", "관련업체",
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

interface DbAggregate {
  item_name: string;
  order_count: number;
  total_qty: number;
  total_amount: number;
  last_order_date: string;
  companies: string[];
}

type OutputRow = Record<string, string | number>;
type SearchMode = "file" | "db";

export default function Feature2() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [globalData, setGlobalData] = useState<Record<string, string>[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [results, setResults] = useState<OutputRow[] | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingCompanies(true);
      const { data, error } = await supabase.from("excel_mappings").select("company_name");
      if (error || !data) {
        setError("업체 목록을 불러오지 못했습니다. Supabase 연결을 확인해 주세요.");
      } else {
        const names = data.map((d: { company_name: string }) => d.company_name);
        setCompanies(names);
        if (names.length > 0) setSelectedCompany(names[0]);
      }
      setIsLoadingCompanies(false);
    })();
  }, []);

  const readExcel = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError("엑셀 파일(.xlsx, .xls, .csv)만 업로드 가능합니다.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      setGlobalData(XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, string>[]);
      setFileName(file.name);
      setIsLoaded(true);
      setResults(null);
      setSearchQuery("");
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) readExcel(file);
    },
    [readExcel]
  );

  // ── DB 이력 집계 조회 헬퍼 (업체 지정 가능) ──────────────────────
  const fetchDbAggregates = async (query: string, company?: string): Promise<DbAggregate[]> => {
    const params = new URLSearchParams({ q: query });
    if (company) params.set("company", company);
    const res = await fetch(`/api/purchase-history/search?${params}`, { credentials: "include" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.aggregates as DbAggregate[];
  };

  // ── 검색 실행 ─────────────────────────────────────────────────
  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setIsSearching(true);
    setError("");

    try {
      // ── 파일 업로드된 경우: 파일 + DB 이력 합산 ─────────────────
      if (isLoaded && selectedCompany) {
        const { data: mappingData, error: mappingError } = await supabase
          .from("excel_mappings")
          .select("mapping_json")
          .eq("company_name", selectedCompany)
          .single();

        if (mappingError || !mappingData) {
          setError("업체 매핑 정보를 불러오지 못했습니다.");
          setIsSearching(false);
          return;
        }
        const mapping: MappingJson = mappingData.mapping_json;

        const filtered = globalData.filter((row) => {
          const val = row[mapping.itemName];
          return val && String(val).includes(query);
        });

        // master_data 조회
        const itemNames = [...new Set(filtered.map((r) => r[mapping.itemName]))];
        const { data: masterList } = await supabase
          .from("master_data")
          .select("*")
          .in("item_name", itemNames);

        const masterMap: Record<string, MasterData> = {};
        (masterList || []).forEach((item: MasterData) => {
          masterMap[item.item_name] = item;
        });

        // DB 이력 집계 조회 — 선택된 업체 기준
        const dbAggregates = await fetchDbAggregates(query, selectedCompany);
        const aggMap: Record<string, DbAggregate> = {};
        dbAggregates.forEach((a) => { aggMap[a.item_name] = a; });

        const finalData: OutputRow[] = filtered.map((row) => {
          const itemName = row[mapping.itemName];
          const db = masterMap[itemName] || ({} as MasterData);
          const agg = aggMap[itemName];
          const orderPrice = parseFloat(row[mapping.orderPrice]) || 0;
          const purchasePrice = parseFloat(String(db.purchase_price)) || 0;
          const margin = orderPrice && purchasePrice ? orderPrice - purchasePrice : "";

          return {
            "발주일자": row[mapping.orderDate] || "",
            "납기일자": row[mapping.dueDate] || "",
            "발주구분": row[mapping.orderType] || "",
            "품목코드": row[mapping.itemCode] || "",
            "발주번호": row[mapping.orderNo || ""] || "",
            "품목명": itemName || "",
            "발주수량": row[mapping.orderQty] || "",
            "발주단가": orderPrice || "",
            "납품금액": row[mapping.deliveryAmount] || "",
            "납품여부": row[mapping.deliveryStatus] || "",
            "매입가(입고가)": purchasePrice || "",
            "마진": margin,
            "재고": db.stock || "",
            "비고": row[mapping.note] || "",
            "매입처": db.supplier || "DB 미등록",
            "연락처": db.contact || "",
            "위치": db.location || "",
            "총발주수량(이력)": agg ? Number(agg.total_qty) : "",
            "총발주금액(이력)": agg ? Number(agg.total_amount) : "",
            "발주횟수(이력)": agg ? agg.order_count : "",
            "최근발주일(이력)": agg ? (agg.last_order_date || "") : "",
          };
        });

        setSearchMode("file");
        setResults(finalData);
      } else {
        // ── 파일 없음: DB 이력만 검색 (선택된 업체 기준) ────────────
        const dbAggregates = await fetchDbAggregates(query, selectedCompany || undefined);

        if (dbAggregates.length === 0) {
          setResults([]);
          setSearchMode("db");
          setIsSearching(false);
          return;
        }

        const dbRows: OutputRow[] = dbAggregates.map((a) => ({
          "품목명": a.item_name,
          "발주횟수": a.order_count,
          "총발주수량": Number(a.total_qty),
          "총발주금액": Number(a.total_amount),
          "최근발주일": a.last_order_date || "",
          "관련업체": (a.companies || []).filter(Boolean).join(", "),
        }));

        setSearchMode("db");
        setResults(dbRows);
      }
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
    }
    setIsSearching(false);
  };

  const handleDownload = () => {
    if (!results || results.length === 0) return;
    const cols = searchMode === "file" ? FILE_COLUMNS : DB_COLUMNS;
    const ws = XLSX.utils.json_to_sheet(results, { header: cols });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "발주서_통합결과");
    const label = searchMode === "file" ? `${selectedCompany}_맞춤발주서` : "이력조회결과";
    XLSX.writeFile(wb, `AtoZELECTRON_${label}.xlsx`);
  };

  const handleClear = () => {
    setFileName("");
    setGlobalData([]);
    setSearchQuery("");
    setResults(null);
    setIsLoaded(false);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const activeCols = searchMode === "file" ? FILE_COLUMNS : DB_COLUMNS;

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
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">업체별 발주서 맞춤 검색</h1>
            <p className="text-sm text-gray-500 mt-1">
              담당 업체를 선택하고 발주서 엑셀 파일을 업로드하면 설정된 양식에 맞추어 엑셀이 생성됩니다.
            </p>
          </div>

          {/* 안내 */}
          <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 text-sm text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>파일 업로드 없이</strong>도 3단계에서 품목명을 검색하면 DB에 저장된 이력 데이터를 조회할 수 있습니다.
              과거 발주서는 <strong>DB 업데이트</strong> 메뉴에서 미리 업로드해 두세요.
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: 업체 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span className="font-semibold text-gray-800">담당 업체 선택</span>
              <span className="text-xs text-gray-400 ml-1">(파일 업로드 시 필요)</span>
            </div>
            {isLoadingCompanies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> 업체 목록 불러오는 중...
              </div>
            ) : (
              <div className="relative inline-block">
                <select
                  value={selectedCompany}
                  onChange={(e) => { setSelectedCompany(e.target.value); setResults(null); }}
                  className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                >
                  {companies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Step 2: 파일 업로드 (선택사항) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span className="font-semibold text-gray-800">발주서 엑셀 파일 업로드</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-1">선택사항</span>
            </div>
            <p className="text-xs text-gray-400 mb-4 ml-8">
              파일을 올리면 현재 발주서 기준으로 검색하며, 건너뛰면 DB에 저장된 이력 데이터만 조회합니다.
            </p>

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
                <p className="text-sm font-medium text-gray-600">발주서 엑셀 파일을 이곳에 드래그 앤 드롭</p>
                <p className="text-xs text-gray-400 mt-1">또는 클릭하여 파일 선택</p>
                <p className="text-xs text-gray-300 mt-3">.xlsx · .xls · .csv 지원</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) readExcel(f); }} />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800 truncate">{fileName}</p>
                  <p className="text-xs text-green-600">{globalData.length}행 로드 완료</p>
                </div>
                <button onClick={handleClear} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Step 3: 검색 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
              <span className="font-semibold text-gray-800">품목명 검색 및 전산 조회</span>
              {!isLoaded && (
                <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full ml-1">
                  <DatabaseZap className="w-3 h-3" /> DB 이력 조회 모드
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={isLoaded ? "품목명 입력 (예: S1NB60-7062)" : "품목명 입력 (DB 이력에서 검색됩니다)"}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                전산 조회
              </button>
              {results && results.length > 0 && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  엑셀 다운로드
                </button>
              )}
            </div>
          </div>

          {/* 결과 테이블 */}
          {results !== null && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">조회 결과</span>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${results.length > 0 ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                    {results.length}건
                  </span>
                  {searchMode === "db" && (
                    <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      <DatabaseZap className="w-3 h-3" /> DB 이력 조회
                    </span>
                  )}
                  {searchMode === "file" && (
                    <span className="text-xs text-gray-400">
                      — 이력 집계 컬럼(총발주수량·금액·횟수·최근발주일) 포함
                    </span>
                  )}
                </div>
                {results.length > 0 && (
                  <button onClick={handleDownload} className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium">
                    <Download className="w-4 h-4" />
                    엑셀 저장
                  </button>
                )}
              </div>

              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">검색 결과가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-1">"{searchQuery}" 에 해당하는 품목을 찾을 수 없어요</p>
                  {!isLoaded && (
                    <p className="text-xs text-orange-500 mt-2">
                      DB에 이력이 없습니다. DB 업데이트 메뉴에서 발주서를 먼저 업로드해 주세요.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        {activeCols.map((col) => {
                          const isHistoryCol = col.includes("이력") || col.includes("총발주");
                          return (
                            <th
                              key={col}
                              className={`px-4 py-3 text-center text-xs font-medium whitespace-nowrap border-r border-gray-700 last:border-r-0 ${
                                isHistoryCol ? "text-orange-300" : "text-white"
                              }`}
                            >
                              {col}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          {activeCols.map((col) => {
                            const isHistoryCol = col.includes("이력") || col.includes("총발주");
                            const val = row[col];
                            let displayVal = "";
                            if (col === "마진" && typeof val === "number") {
                              displayVal = val >= 0 ? `+${val.toLocaleString()}` : val.toLocaleString();
                            } else if (typeof val === "number") {
                              displayVal = val.toLocaleString();
                            } else {
                              displayVal = String(val ?? "");
                            }
                            return (
                              <td
                                key={col}
                                className={`px-4 py-3 text-center whitespace-nowrap border-r border-gray-100 last:border-r-0 ${
                                  isHistoryCol ? "text-orange-700 bg-orange-50/30 font-medium" : "text-gray-700"
                                }`}
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
