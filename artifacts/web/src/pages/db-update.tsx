import { useState, useRef, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  Upload, FileText, X, ChevronDown, AlertCircle,
  Loader2, CheckCircle2, DatabaseZap, Trash2, Info,
  RefreshCw, BarChart3, Package, Calendar, Hash,
} from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/use-auth";

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

interface CompanyStat {
  company_name: string;
  total_rows: number;
  unique_items: number;
  total_qty: number;
  total_amount: number;
  first_date: string;
  last_date: string;
  last_uploaded_at: string;
}

export default function DbUpdate() {
  const { data: authData } = useAuth();
  const isAdmin = authData?.user?.role === "admin";

  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // 업체별 DB 통계
  const [companyStats, setCompanyStats] = useState<CompanyStat[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCompanies = async () => {
    setIsLoadingCompanies(true);
    const { data } = await supabase.from("excel_mappings").select("company_name");
    const names = (data || []).map((d: { company_name: string }) => d.company_name);
    setCompanies(names);
    setIsLoadingCompanies(false);
  };

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch("/api/purchase-history/stats", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setCompanyStats(json.stats || []);
      }
    } catch { /* silent */ }
    setIsLoadingStats(false);
  };

  useEffect(() => {
    loadCompanies();
    loadStats();
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
        const { rows, isDbFormat } = await parseExcel(file, mapping, selectedCompany);
        if (rows.length === 0) {
          results.push({ fileName: file.name, inserted: 0, status: "error", message: "품목명이 없는 행만 있습니다." });
          continue;
        }
        const res = await fetch("/api/purchase-history/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ rows, fileName: file.name, replace: isDbFormat }),
        });
        if (!res.ok) {
          const text = await res.text();
          let msg = "서버 오류";
          try { msg = JSON.parse(text).error || msg; } catch { /* non-JSON response */ }
          if (res.status === 413) msg = "파일 데이터가 너무 큽니다. 파일을 분할해 주세요.";
          results.push({ fileName: file.name, inserted: 0, status: "error", message: msg });
        } else {
          const json = await res.json();
          results.push({ fileName: file.name, inserted: json.inserted, status: "success" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "파일 파싱 오류";
        results.push({ fileName: file.name, inserted: 0, status: "error", message: msg });
      }
    }

    setUploadResults(results);
    setPendingFiles([]);
    setIsUploading(false);
    await loadStats(); // 통계 새로고침
  };

  const handleDeleteCompany = async (company: string) => {
    if (!window.confirm(`"${company}" 업체의 모든 발주 이력을 삭제하시겠습니까?`)) return;
    setDeletingCompany(company);
    try {
      const res = await fetch(
        `/api/purchase-history/company/${encodeURIComponent(company)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (res.ok) {
        await loadStats();
      } else {
        const json = await res.json();
        setError(json.error || "삭제 중 오류가 발생했습니다.");
      }
    } catch {
      setError("삭제 요청 중 오류가 발생했습니다.");
    }
    setDeletingCompany(null);
  };

  const parseExcel = (
    file: File,
    mapping: MappingJson,
    companyName: string
  ): Promise<{ rows: object[]; isDbFormat: boolean }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          // raw: true → 날짜/숫자 원시값 (발주서 형식)
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];
          // raw: false → Excel에 표시된 서식 그대로 (DB 형식 숫자 정확도 보장)
          const fmtRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as Record<string, unknown>[];

          // 컬럼명 공백 제거 후 정규화
          const normalize = (rows: Record<string, unknown>[]) =>
            rows.map((r) => {
              const n: Record<string, string> = {};
              Object.entries(r).forEach(([k, v]) => { n[k.trim()] = String(v ?? ""); });
              return n;
            });

          const normRows = normalize(rawRows);
          const fmtNormRows = normalize(fmtRows);

          // ① 발주서 형식: Supabase 매핑 사용
          let rows = normRows
            .filter((r) => r[mapping.itemName.trim()])
            .map((r) => ({
              company_name: companyName,
              order_date: r[mapping.orderDate.trim()] || null,
              due_date: r[mapping.dueDate.trim()] || null,
              order_type: r[mapping.orderType.trim()] || null,
              item_code: r[mapping.itemCode.trim()] || null,
              order_no: r[(mapping.orderNo || "").trim()] || null,
              item_name: r[mapping.itemName.trim()],
              order_qty: parseFloat(r[mapping.orderQty.trim()]) || 0,
              order_price: parseFloat(r[mapping.orderPrice.trim()]) || 0,
              delivery_amount: parseFloat(r[mapping.deliveryAmount.trim()]) || 0,
              delivery_status: r[mapping.deliveryStatus.trim()] || null,
              note: r[mapping.note.trim()] || null,
            }));

          let isDbFormat = false;

          // ② DB 형식 자동 감지: 품명, 수량, 납품가 컬럼이 있으면
          if (rows.length === 0 && fmtNormRows.length > 0 && fmtNormRows[0]["품명"]) {
            isDbFormat = true;

            // Excel 표시값 기반 숫자 파싱 (쉼표 제거 후 파싱)
            const cleanNum = (s: string): number => {
              const n = parseFloat(s.replace(/,/g, ""));
              return isNaN(n) ? 0 : n;
            };

            rows = fmtNormRows
              .filter((r) => r["품명"])
              .map((r) => {
                const qty   = cleanNum(r["수량"]);
                const price = cleanNum(r["납품가"]);
                const total = cleanNum(r["합계"]);
                const cost  = cleanNum(r["원가"]);
                return {
                  company_name: companyName,
                  order_date: null,
                  due_date: null,
                  order_type: null,
                  item_code: r["품목코드"] || null,
                  order_no: null,
                  item_name: r["품명"],
                  order_qty: qty,
                  order_price: price,
                  delivery_amount: total,
                  delivery_status: null,
                  note: null,
                  purchase_price: cost || null,
                  supplier: r["구매처"] || null,
                };
              });
          }

          resolve({ rows, isDbFormat });
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const totalInserted = uploadResults.reduce((s, r) => s + r.inserted, 0);
  const successCount = uploadResults.filter((r) => r.status === "success").length;

  const fmtNum = (n: number | string | null | undefined) => {
    if (n === null || n === undefined || n === "") return "-";
    return Number(n).toLocaleString();
  };
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "-";
    return String(d).slice(0, 10);
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">DB 업데이트</span>
        </header>

        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <DatabaseZap className="w-5 h-5 text-blue-600" />
              발주 이력 DB 업로드
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              업체별 DB 엑셀 파일을 업로드합니다.
              발주서 형식과 DB 형식 모두 자동으로 인식합니다.
            </p>
          </div>

          {/* 안내 */}
          <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg mb-6 text-sm text-blue-700">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              반드시 <strong>업체를 먼저 선택</strong>한 후 해당 업체의 DB 파일을 업로드하세요.
              발주서 형식(매핑 적용)과 DB 형식(품목코드·품명·수량·납품가·합계)을 자동으로 인식합니다.
            </span>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── 업체별 DB 현황 ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-gray-800">업체별 DB 현황</span>
              </div>
              <button
                onClick={loadStats}
                disabled={isLoadingStats}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingStats ? "animate-spin" : ""}`} />
                새로고침
              </button>
            </div>

            {isLoadingStats ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> 통계 불러오는 중...
              </div>
            ) : companyStats.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                <DatabaseZap className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                아직 업로드된 이력 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">업체명</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">발주 건수</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">품목 종류</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">총 발주수량</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">총 발주금액</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500">기간</th>
                      <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500">최근 업로드</th>
                      {isAdmin && <th className="py-2 px-3"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {companyStats.map((stat) => (
                      <tr key={stat.company_name} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{stat.company_name}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">
                          <span className="inline-flex items-center gap-1">
                            <Hash className="w-3 h-3 text-gray-400" />
                            {fmtNum(stat.total_rows)}건
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-700">
                          <span className="inline-flex items-center gap-1">
                            <Package className="w-3 h-3 text-gray-400" />
                            {fmtNum(stat.unique_items)}종
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmtNum(stat.total_qty)}</td>
                        <td className="py-2.5 px-3 text-right text-blue-700 font-medium">
                          ₩{fmtNum(stat.total_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-500 text-xs">
                          <span className="flex items-center justify-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fmtDate(stat.first_date)} ~ {fmtDate(stat.last_date)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-400 text-xs">
                          {fmtDate(stat.last_uploaded_at)}
                        </td>
                        {isAdmin && (
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => handleDeleteCompany(stat.company_name)}
                              disabled={deletingCompany === stat.company_name}
                              className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title={`"${stat.company_name}" 이력 삭제`}
                            >
                              {deletingCompany === stat.company_name
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 업체 선택 ───────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span className="font-semibold text-gray-800">업로드할 업체 선택</span>
            </div>
            {isLoadingCompanies ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> 업체 목록 불러오는 중...
              </div>
            ) : (
              <>
                <div className="relative inline-block">
                  <select
                    value={selectedCompany}
                    onChange={(e) => { setSelectedCompany(e.target.value); setUploadResults([]); }}
                    className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                  >
                    <option value="">— 선택 —</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {selectedCompany && companyStats.find((s) => s.company_name === selectedCompany) && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg text-xs text-blue-700">
                    <BarChart3 className="w-3.5 h-3.5" />
                    현재 DB: {fmtNum(companyStats.find((s) => s.company_name === selectedCompany)?.total_rows)}건 저장됨
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── 파일 업로드 ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span className="font-semibold text-gray-800">"{selectedCompany}" DB 파일 선택</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-1">여러 파일 동시 가능</span>
            </div>
            <p className="text-xs text-red-500 mb-4 ml-8">
              ※ 선택한 업체("{selectedCompany}")의 파일만 올려주세요. 다른 업체 파일은 잘못 저장될 수 있습니다.
            </p>

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
              <p className="text-sm font-medium text-gray-600">DB 엑셀 파일을 이곳에 드래그 앤 드롭</p>
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
                "{selectedCompany}" 이력 저장 중...
              </>
            ) : (
              <>
                <DatabaseZap className="w-4 h-4" />
                "{selectedCompany}" DB에 저장하기 ({pendingFiles.length}개 파일)
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
                  — 총 <strong className="text-blue-600">{totalInserted.toLocaleString()}건</strong> 저장됨
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
                    {r.status === "success"
                      ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-500" />
                      : <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />}
                    <span className="flex-1 truncate font-medium">{r.fileName}</span>
                    <span className="text-xs">
                      {r.status === "success" ? `${r.inserted.toLocaleString()}건 저장` : r.message || "오류"}
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
