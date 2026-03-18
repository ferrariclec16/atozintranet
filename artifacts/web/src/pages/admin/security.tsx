import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ShieldAlert, RefreshCw } from "lucide-react";

interface SecurityLog {
  id: number;
  time: string;
  licenseKey: string;
  userName: string;
  registeredHwid: string;
  attemptedHwid: string;
}

export default function Security() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/security-logs`, { credentials: "include" });
      const data = await res.json() as { logs: SecurityLog[] };
      setLogs(data.logs ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [BASE]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white gap-2">
          <span className="text-sm text-orange-400 font-medium">관리자 전용</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">보안 모니터링</span>
        </header>

        <div className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-500" />
              <h1 className="text-xl font-bold text-gray-800">보안 차단 기록</h1>
              {logs.length > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  {logs.length}건 차단
                </span>
              )}
            </div>
            <button
              onClick={() => void fetchLogs()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </button>
          </div>

          {logs.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              다른 기기에서 접속을 시도한 기록이 있습니다. 확인이 필요합니다.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                불러오는 중...
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-gray-400">
                <ShieldAlert className="w-10 h-10 text-gray-200 mb-3" />
                <span className="text-green-600 font-medium">차단된 접속 시도가 없습니다.</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50 border-b border-red-100">
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">차단 시간 (KST)</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">직원명</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">라이선스 키</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">정상 등록 기기 ID</th>
                    <th className="text-left text-xs font-semibold text-red-500 px-5 py-3">불법 시도 기기 ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-red-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{log.time}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-700">{log.userName}</td>
                      <td className="px-5 py-3.5">
                        <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">
                          {log.licenseKey}
                        </code>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 font-mono">{log.registeredHwid}</td>
                      <td className="px-5 py-3.5 text-xs text-red-500 font-mono font-bold">{log.attemptedHwid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
