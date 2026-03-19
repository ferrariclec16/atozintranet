import { useState, useRef, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { FileText, Upload, Search, Download, X, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";

interface CompanyConfig {
  label: string;
  searchColumn: string;
  description: string;
}

const companyConfigs: Record<string, CompanyConfig> = {
  hanyoungnux: {
    label: "한영넉스",
    searchColumn: "품목명",
    description: "품목명 기준 검색",
  },
  B: {
    label: "B사",
    searchColumn: "품목코드",
    description: "품목코드 기준 검색",
  },
};

export default function Feature2() {
  const [selectedCompany, setSelectedCompany] = useState<string>("hanyoungnux");
  const [fileName, setFileName] = useState<string>("");
  const [globalData, setGlobalData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [results, setResults] = useState<Record<string, string>[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultTableRef = useRef<HTMLTableElement>(null);

  const readExcel = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert("엑셀 파일(.xlsx, .xls, .csv)만 업로드 가능합니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
      if (json.length > 0) {
        setHeaders(json[0]);
        setGlobalData(XLSX.utils.sheet_to_json(worksheet) as Record<string, string>[]);
        setFileName(file.name);
        setIsLoaded(true);
        setResults(null);
        setSearchQuery("");
      }
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

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readExcel(file);
  };

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query || !isLoaded) return;
    const targetColumn = companyConfigs[selectedCompany].searchColumn;
    const filtered = globalData.filter((row) => {
      const cellValue = row[targetColumn];
      return cellValue && String(cellValue).includes(query);
    });
    setResults(filtered);
  };

  const handleDownload = () => {
    if (!results || results.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "검색결과");
    XLSX.writeFile(wb, `발주서_검색결과_${companyConfigs[selectedCompany].label}.xlsx`);
  };

  const handleClear = () => {
    setFileName("");
    setGlobalData([]);
    setHeaders([]);
    setSearchQuery("");
    setResults(null);
    setIsLoaded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const noResults = results !== null && results.length === 0;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">발주서 정리</span>
        </header>

        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">업체별 발주서 맞춤 검색</h1>
            <p className="text-sm text-gray-500 mt-1">
              담당 업체를 선택하고 발주서 엑셀 파일을 업로드하면 자동으로 데이터를 인식합니다.
            </p>
          </div>

          {/* Step 1: 업체 선택 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span className="font-semibold text-gray-800">담당 업체 선택</span>
            </div>
            <div className="relative inline-block">
              <select
                value={selectedCompany}
                onChange={(e) => {
                  setSelectedCompany(e.target.value);
                  setResults(null);
                }}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
              >
                {Object.entries(companyConfigs).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label} — {cfg.description}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              선택된 업체의 발주서 양식에 맞게 데이터를 자동 인식합니다.
            </p>
          </div>

          {/* Step 2: 파일 업로드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="font-semibold text-gray-800">엑셀 파일 업로드</span>
            </div>

            {!isLoaded ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                }`}
              >
                <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? "text-blue-500" : "text-gray-300"}`} />
                <p className="text-sm font-medium text-gray-600">
                  엑셀 파일을 이곳에 드래그 앤 드롭
                </p>
                <p className="text-xs text-gray-400 mt-1">또는 클릭하여 파일 선택</p>
                <p className="text-xs text-gray-300 mt-3">.xlsx · .xls · .csv 지원</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800 truncate">{fileName}</p>
                  <p className="text-xs text-green-600">{globalData.length}행 로드 완료</p>
                </div>
                <button
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Step 3: 검색 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center ${isLoaded ? "bg-blue-600" : "bg-gray-300"}`}>
                3
              </span>
              <span className={`font-semibold ${isLoaded ? "text-gray-800" : "text-gray-400"}`}>
                데이터 검색
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={
                    isLoaded
                      ? `${companyConfigs[selectedCompany].searchColumn} 기준으로 검색...`
                      : "먼저 파일을 업로드하세요"
                  }
                  disabled={!isLoaded}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!isLoaded || !searchQuery.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                검색
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
                <div>
                  <span className="font-semibold text-gray-800">검색 결과</span>
                  <span className={`ml-2 text-sm font-medium px-2 py-0.5 rounded-full ${
                    results.length > 0 ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"
                  }`}>
                    {results.length}건
                  </span>
                </div>
                {results.length > 0 && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    엑셀로 저장
                  </button>
                )}
              </div>

              {noResults ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm font-medium text-gray-500">검색 결과가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-1">
                    "{searchQuery}" 에 해당하는 {companyConfigs[selectedCompany].searchColumn}을 찾을 수 없어요
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table ref={resultTableRef} className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {headers.map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {results.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          {headers.map((h) => (
                            <td key={h} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                              {row[h] ?? ""}
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
