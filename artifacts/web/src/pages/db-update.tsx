import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  Upload, FileText, X, ChevronDown, AlertCircle,
  Loader2, CheckCircle2, DatabaseZap, Trash2, Info,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

interface UploadResult {
  fileName: string;
  inserted: number;
  status: "success" | "error";
  message?: string;
}

export default function DbUpdate() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingCompanies(true);
      const { data } = await supabase.from("excel_mappings").select("company_name");
      const names = (data || []).map((d: { company_name: string }) => d.company_name);
      setCompanies(names);
      if (names.length > 0) setSelectedCompany(names[0]);
      setIsLoadingCompanies(false);
    })();
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const validFiles = Array.from(files).filter((f) =>
      f.name.match(/\.(xlsx|xls|csv)$/i)
    );
    if (validFiles.length === 0) {
      setError("엑셀 파일(.xlsx, .xls, .csv)만 업로드 가능합니다.");
      return;
    }
    setError("");
    setPendingFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!selectedCompany || pendingFiles.length === 0) return;
    setIsUploading(true);
    setError("");
    setUploadResults([]);

    const { data: mappingData, error: mappingError } = await supabase
      .from("excel_mappings")
      .select("mapping_json")
      .eq("company_name", selectedCompany)
      .single();

    if (mappingError || !mappingData) {
      setError("업체 매핑 정보를 불러오지 못했습니다.");
      setIsUploading(false);
      return;
    }
    const mapping: MappingJson = mappingData.mapping_json;

    const results: UploadResult[] = [];

    for (const file of pendingFiles) {
      try {
        const rows = await parseExcel(file, mapping, selectedCompany);
        if (rows.length === 0) {
          results.push({ fileName: file.name, inserted: 0, status: "error", message: "품목명이 없는 행만 있습니다." });
          continue;
        }

        const res = await fetch("/api/purchase-history/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rows }),
        });
        const json = await res.json();

        if (!res.ok) {
          results.push({ fileName: file.name, inserted: 0, status: "error", message: json.error || "서버 오류" });
        } else {
          results.push({ fileName: file.name, inserted: json.inserted, status: "success" });
        }
      } catch (e) {
        results.push({ fileName: file.name, inserted: 0, status: "error", message: "파일 파싱 오류" });
      }
    }

    setUploadResults(results);
    setPendingFiles([]);
    setIsUploading(false);
  };

  const parseExcel = (
    file: File,
    mapping: MappingJson,
    companyName: string
  ): Promise<object[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, string>[];

          const rows = rawRows
            .filter((r) => r[mapping.itemName])
            .map((r) => ({
              company_name: companyName,
              order_date: r[mapping.orderDate] || null,
              due_date: r[mapping.dueDate] || null,
              order_type: r[mapping.orderType] || null,
              item_code: r[mapping.itemCode] || null,
              order_no: r[mapping.orderNo || ""] || null,
              item_name: String(r[mapping.itemName]),
              order_qty: parseFloat(String(r[mapping.orderQty])) || 0,
              order_price: parseFloat(String(r[mapping.orderPrice])) || 0,
              delivery_amount: parseFloat(String(r[mapping.deliveryAmount])) || 0,
              delivery_status: r[mapping.deliveryStatus] || null,
              note: r[mapping.note] || null,
            }));

          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const totalInserted = uploadResults.reduce((s, r) => s + r.inserted, 0);
  const successCount = uploadResults.filter((r) => r.status === "success").length;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">DB 업데이트</span>
        </header>

        <div className="flex-1 p-8 max-w-4xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <DatabaseZap className="w-5 h-5 text-blue-600" />
              발주 이력 DB 업로드
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              과거 발주서 엑셀 파일을 업로드하면 업체별 매핑 규칙으로 변환하여 DB에 저장됩니다.
              저장된 데이터는 <strong>발주서 정리</strong> 페이지의 품목명 검색에서 이력 조회에 활용됩니다.
            </p>
          </div>

          {/* 안내 박스 */}
          <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg mb-6 text-sm text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              업체를 선택하면 해당 업체의 엑셀 컬럼 매핑이 자동 적용됩니다.
              여러 파일을 동시에 업로드할 수 있으며, 중복 데이터는 별도 처리 없이 추가됩니다.
            </span>
          </div>

          {/* 오류 */}
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
              <span className="font-semibold text-gray-800">업체 선택</span>
            </div>
            {isLoadingCompanies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> 업체 목록 불러오는 중...
              </div>
            ) : (
              <div className="relative inline-block">
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
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

          {/* Step 2: 파일 업로드 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span className="font-semibold text-gray-800">발주서 파일 선택</span>
              <span className="text-xs text-gray-400 ml-1">(여러 파일 동시 가능)</span>
            </div>

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
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {/* 선택된 파일 목록 */}
            {pendingFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="flex-1 text-sm text-gray-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 업로드 버튼 */}
          <button
            onClick={handleUpload}
            disabled={!selectedCompany || pendingFiles.length === 0 || isUploading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors mb-6"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                DB에 저장 중...
              </>
            ) : (
              <>
                <DatabaseZap className="w-4 h-4" />
                DB에 저장하기 ({pendingFiles.length}개 파일)
              </>
            )}
          </button>

          {/* 결과 */}
          {uploadResults.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-semibold text-gray-800">업로드 완료</span>
                <span className="text-sm text-gray-500">
                  — 총 <strong className="text-blue-600">{totalInserted}건</strong> 저장됨
                  ({successCount}/{uploadResults.length}개 파일 성공)
                </span>
              </div>
              <div className="space-y-2">
                {uploadResults.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm ${
                      r.status === "success"
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-red-50 border-red-200 text-red-800"
                    }`}
                  >
                    {r.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
                    )}
                    <span className="flex-1 truncate font-medium">{r.fileName}</span>
                    <span className="text-xs">
                      {r.status === "success" ? `${r.inserted}건 저장` : r.message || "오류"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
