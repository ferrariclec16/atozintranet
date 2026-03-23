import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { FileText, Upload, Search, Download, X, ChevronDown, AlertCircle, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const TARGET_COLUMNS = [
  "발주일자", "납기일자", "발주구분", "품목코드", "발주번호",
  "품목명", "발주수량", "발주단가", "납품금액", "납품여부",
  "매입가(입고가)", "마진", "재고", "비고", "매입처", "연락처", "위치"
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

export default function Feature2() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [globalData, setGlobalData] = useState<Record<string, string>[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [results, setResults] = useState<OutputRow[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supabase에서 업체 목록 로드
  useEffect(() => {
    async function loadCompanies() {
      setIsLoadingCompanies(true);
      const { data, error } = await supabase
        .from("excel_mappings")
        .select("company_name");
      if (error || !data) {
        setError("업체 목록을 불러오지 못했습니다. Supabase 연결을 확인해 주세요.");
      } else {
        const names = data.map((d: { company_name: string }) => d.company_name);
        setCompanies(names);
        if (names.length > 0) setSelectedCompany(names[0]);
      }
      setIsLoadingCompanies(false);
    }
    loadCompanies();
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

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query || !isLoaded || !selectedCompany) return;
    setIsSearching(true);
    setError("");

    try {
      // 1. Supabase에서 업체 매핑 규칙 가져오기
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

      // 2. 엑셀에서 품목명 필터링
      const filtered = globalData.filter((row) => {
        const val = row[mapping.itemName];
        return val && String(val).includes(query);
      });

      if (filtered.length === 0) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      // 3. 품목명 목록으로 마스터 DB 조회
      const itemNames = [...new Set(filtered.map((r) => r[mapping.itemName]))];
      const { data: masterList, error: masterError } = await supabase
        .from("master_data")
        .select("*")
        .in("item_name", itemNames);

      if (masterError) {
        setError("전산 데이터를 불러오는 데 실패했습니다.");
        setIsSearching(false);
        return;
      }

      const masterMap: Record<string, MasterData> = {};
      (masterList || []).forEach((item: MasterData) => {
        masterMap[item.item_name] = item;
      });

      // 4. 17개 고정 양식으로 변환
      const finalData: OutputRow[] = filtered.map((row) => {
        const itemName = row[mapping.itemName];
        const db = masterMap[itemName] || ({} as MasterData);
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
        };
      });

      setResults(finalData);
    } catch {
      setError("오류가 발생했습니다. 다시 시도해 주세요.");
    }
    setIsSearching(false);
  };

  const handleDownload = () => {
    if (!results || results.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(results, { header: TARGET_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "발주서_통합결과");
    XLSX.writeFile(wb, `AtoZELECTRON_${selectedCompany}_맞춤발주서.xlsx`);
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

          {/* 오류 메시지 */}
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
            </div>
            {isLoadingCompanies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                업체 목록 불러오는 중...
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
            <p className="text-xs text-gray-400 mt-2">업체는 Supabase DB에서 실시간으로 불러옵니다.</p>
          </div>

          {/* Step 2: 파일 업로드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span className="font-semibold text-gray-800">발주서 엑셀 파일 업로드</span>
            </div>

            {!isLoaded ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                }`}
              >
                <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? "text-blue-500" : "text-gray-300"}`} />
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
              <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${isLoaded ? "bg-blue-600" : "bg-gray-300"}`}>3</span>
              <span className={`font-semibold ${isLoaded ? "text-gray-800" : "text-gray-400"}`}>품목명 검색 및 전산 조회</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={isLoaded ? "품목명 입력 (예: S1NB60-7062)" : "먼저 파일을 업로드하세요"}
                  disabled={!isLoaded}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!isLoaded || !searchQuery.trim() || isSearching}
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
                </div>
                {results.length > 0 && (
                  <button onClick={handleDownload} className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium">
                    <Download className="w-4 h-4" />
                    맞춤 발주서 엑셀 저장
                  </button>
                )}
              </div>

              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">검색 결과가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-1">"{searchQuery}" 에 해당하는 품목을 찾을 수 없어요</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        {TARGET_COLUMNS.map((col) => (
                          <th key={col} className="px-4 py-3 text-center text-xs font-medium text-white whitespace-nowrap border-r border-gray-700 last:border-r-0">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          {TARGET_COLUMNS.map((col) => (
                            <td key={col} className="px-4 py-3 text-center text-gray-700 whitespace-nowrap border-r border-gray-100 last:border-r-0">
                              {col === "마진" && typeof row[col] === "number"
                                ? (row[col] as number) >= 0
                                  ? `+${row[col].toLocaleString()}`
                                  : (row[col] as number).toLocaleString()
                                : String(row[col] ?? "")}
                            </td>
                          ))}
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
