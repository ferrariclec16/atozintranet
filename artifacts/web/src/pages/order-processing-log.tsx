import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import {
  History, Trash2, Download, Eye, Loader2,
  AlertCircle, CheckSquare, Square, FileText, X, Search, Copy, Check,
} from "lucide-react";
import * as XLSX from "xlsx";

const OUTPUT_COLUMNS = [
  "발주일자", "납기일자", "발주구분", "품목코드", "발주번호",
  "품목명", "발주수량", "발주단가", "납품금액", "납품여부",
  "매입가(입고가)", "마진", "재고", "비고", "매입처", "연락처", "위치",
];

const COPY_COLS = ["품목코드", "발주번호", "품목명"];
const MASTER_COLS = ["매입가(입고가)", "마진", "재고", "매입처", "연락처", "위치"];

interface LogEntry {
  id: number;
  saved_at: string;
  company_name: string;
  file_name: string;
}

type OutputRow = Record<string, string | number>;

function formatKst(isoStr: string) {
  const d = new Date(isoStr);
  const offset = d.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(offset);
  const date = kst.toISOString().slice(0, 10);
  const time = kst.toISOString().slice(11, 19);
  return { date, time };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function OrderProcessingLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 결과 보기 모달
  const [modalRows, setModalRows] = useState<OutputRow[] | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/order-processing-log`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setLogs(data.logs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(logs.map((l) => l.id));
  const clearAll = () => setSelectedIds([]);

  const handleDelete = () => {
    if (selectedIds.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const doDelete = async () => {
    if (selectedIds.length === 0) return;
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      for (const id of selectedIds) {
        await fetch(`${BASE}/api/order-processing-log/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
      }
      setSelectedIds([]);
      await fetchLogs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const openModal = async (log: LogEntry) => {
    setIsLoadingModal(true);
    setModalTitle(`${log.company_name} — ${log.file_name}`);
    setSearchQuery("");
    setModalRows(null);
    try {
      const res = await fetch(`${BASE}/api/order-processing-log/${log.id}/rows`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      setModalRows(data.rows);
    } catch (e: any) {
      setError(e.message);
      setIsLoadingModal(false);
      return;
    } finally {
      setIsLoadingModal(false);
    }
  };

  const handleDownload = async (log: LogEntry) => {
    try {
      const res = await fetch(`${BASE}/api/order-processing-log/${log.id}/rows`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "불러오기 실패");
      const rows: OutputRow[] = data.rows;
      const ws = XLSX.utils.json_to_sheet(rows, { header: OUTPUT_COLUMNS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "발주정리");
      const { date } = formatKst(log.saved_at);
      XLSX.writeFile(wb, `AtoZELECTRON_발주정리_${log.company_name}_${date.replace(/-/g, "")}.xlsx`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filteredRows = modalRows
    ? searchQuery
      ? modalRows.filter((r) =>
          COPY_COLS.some((col) =>
            String(r[col] ?? "").toLowerCase().includes(searchQuery.toLowerCase())
          )
        )
      : modalRows
    : null;

  const selectedLog = selectedIds.length === 1 ? logs.find((l) => l.id === selectedIds[0]) : undefined;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-400">메뉴</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">발주서 기록</span>
        </header>

        <div className="flex-1 p-8 max-w-5xl w-full mx-auto">
          <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">발주서 기록</h1>
              <p className="text-sm text-gray-500 mt-1">저장된 발주 정리 결과를 조회하고 다운로드할 수 있습니다.</p>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => selectedLog && openModal(selectedLog)}
                  disabled={isLoadingModal || selectedIds.length !== 1}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoadingModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  정리 결과 보기
                </button>
                <button
                  onClick={() => selectedLog && handleDownload(selectedLog)}
                  disabled={selectedIds.length !== 1}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Excel 다운로드
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {logs.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={selectAll}
                className="px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                전체선택
              </button>
              <button
                onClick={clearAll}
                className="px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                전체해제
              </button>
              {selectedIds.length > 0 && (
                <span className="text-xs text-blue-600 font-medium">{selectedIds.length}개 선택됨</span>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <History className="w-12 h-12 text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">저장된 발주서 기록이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1">발주서 정리 후 "결과 저장" 버튼을 눌러 저장하세요</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="w-10 px-4 py-3 text-center text-xs font-medium text-gray-400 border-r border-gray-700"></th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white border-r border-gray-700">저장 날짜</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white border-r border-gray-700">저장 시간</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white border-r border-gray-700">업체명</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white">파일명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log, i) => {
                    const { date, time } = formatKst(log.saved_at);
                    const isSelected = selectedIds.includes(log.id);
                    return (
                      <tr
                        key={log.id}
                        onClick={() => handleSelect(log.id)}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-50" : i % 2 === 0 ? "hover:bg-gray-50" : "bg-gray-50/50 hover:bg-gray-100"}`}
                      >
                        <td className="px-4 py-3 text-center border-r border-gray-100">
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                            : <Square className="w-4 h-4 text-gray-300 mx-auto" />
                          }
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium border-r border-gray-100">{date}</td>
                        <td className="px-4 py-3 text-gray-500 border-r border-gray-100">{time}</td>
                        <td className="px-4 py-3 text-gray-700 border-r border-gray-100">{log.company_name}</td>
                        <td className="px-4 py-3 text-gray-500">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {log.file_name}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 결과 보기 모달 */}
        {(modalRows !== null || isLoadingModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setModalRows(null); setSearchQuery(""); }} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-[95vw] max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-blue-500" />
                  <span className="font-semibold text-gray-800 text-sm">{modalTitle}</span>
                  {filteredRows && (
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {filteredRows.length}건
                      {searchQuery && modalRows && filteredRows.length !== modalRows.length && (
                        <span className="text-gray-400 font-normal ml-1">/ 전체 {modalRows.length}건</span>
                      )}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setModalRows(null); setSearchQuery(""); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 검색창 */}
              {modalRows && modalRows.length > 0 && (
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

              {/* 모달 바디 */}
              <div className="flex-1 overflow-auto">
                {isLoadingModal ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                ) : (filteredRows?.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Search className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm font-medium text-gray-500">
                      {searchQuery ? `"${searchQuery}" 검색 결과가 없습니다` : "데이터가 없습니다"}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
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
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900">기록 삭제</h3>
            </div>
            {selectedIds.length === 1 && selectedLog ? (
              <>
                <p className="text-sm text-gray-600 mb-1">아래 발주서 기록이 삭제됩니다.</p>
                <p className="text-sm font-semibold text-gray-900 mb-5">
                  {selectedLog.company_name} — {selectedLog.file_name}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-1">선택한 발주서 기록이 삭제됩니다.</p>
                <p className="text-sm font-semibold text-gray-900 mb-5">
                  총 {selectedIds.length}건
                </p>
              </>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={doDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
