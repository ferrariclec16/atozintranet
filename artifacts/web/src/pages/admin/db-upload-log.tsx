import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { DatabaseZap, RefreshCw, User, Clock, Building2 } from "lucide-react";

interface UploadLog {
  id: number;
  username: string;
  display_name: string;
  company_name: string | null;
  file_name: string | null;
  rows_inserted: number;
  uploaded_at: string;
}

export default function DbUploadLog() {
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/purchase-history/upload-log", { credentials: "include" });
      const data = await res.json() as { logs: UploadLog[] };
      setLogs(data.logs ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const filtered = filter.trim()
    ? logs.filter(
        (l) =>
          l.display_name.toLowerCase().includes(filter.toLowerCase()) ||
          l.username.toLowerCase().includes(filter.toLowerCase()) ||
          (l.company_name || "").toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  // 직원별 업로드 횟수 집계
  const byUser: Record<string, { displayName: string; count: number; last: string }> = {};
  logs.forEach((l) => {
    if (!byUser[l.username]) {
      byUser[l.username] = { displayName: l.display_name, count: 0, last: l.uploaded_at };
    }
    byUser[l.username].count++;
    if (l.uploaded_at > byUser[l.username].last) byUser[l.username].last = l.uploaded_at;
  });
  const userStats = Object.entries(byUser).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white gap-2">
          <span className="text-sm text-orange-400 font-medium">관리자 전용</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">DB 업로드 기록</span>
        </header>

        <div className="flex-1 p-8 space-y-6">
          {/* 직원별 요약 카드 */}
          {userStats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">직원별 업로드 현황</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {userStats.map(([username, stat]) => (
                  <div key={username} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-gray-800 truncate">{stat.displayName}</span>
                    </div>
                    <div className="text-xs text-gray-400 pl-9">
                      총 <span className="font-semibold text-blue-600">{stat.count}</span>회 업로드
                    </div>
                    <div className="text-[10px] text-gray-300 pl-9 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {stat.last}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 상세 로그 테이블 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DatabaseZap className="w-5 h-5 text-orange-500" />
                <h1 className="text-xl font-bold text-gray-800">상세 업로드 기록</h1>
                <span className="text-sm text-gray-400">({filtered.length}건)</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="직원명·업체 검색..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 w-44"
                />
                <button
                  onClick={() => void fetchLogs()}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  새로고침
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                  불러오는 중...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-sm text-gray-400">
                  <DatabaseZap className="w-10 h-10 text-gray-200 mb-3" />
                  {filter ? "검색 결과가 없습니다." : "업로드 기록이 없습니다."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 w-44">업로드 시간 (KST)</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">직원명</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">아이디</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">업체명</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">파일명</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">저장 건수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 text-gray-500 text-xs font-mono">{log.uploaded_at}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <User className="w-3 h-3 text-blue-600" />
                            </div>
                            <span className="font-semibold text-gray-800">{log.display_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <code className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-mono">
                            {log.username}
                          </code>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            {log.company_name || <span className="text-gray-300 italic">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-gray-400 max-w-[200px] truncate" title={log.file_name || ""}>
                          {log.file_name || <span className="italic">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            {log.rows_inserted.toLocaleString()}건
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
