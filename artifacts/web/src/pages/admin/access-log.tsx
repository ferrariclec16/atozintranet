import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ClipboardList, RefreshCw } from "lucide-react";

interface LoginLog {
  id: number;
  time: string;
  licenseKey: string;
  userName: string;
  hwid: string;
}

export default function AccessLog() {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/login-logs`, { credentials: "include" });
      const data = await res.json() as { logs: LoginLog[] };
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
          <span className="text-sm font-semibold text-gray-700">접속 기록</span>
        </header>

        <div className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-bold text-gray-800">접속 성공 기록</h1>
              <span className="text-sm text-gray-400">({logs.length}건)</span>
            </div>
            <button
              onClick={() => void fetchLogs()}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-gray-400">
                불러오는 중...
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-gray-400">
                <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
                접속 기록이 없습니다.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">접속 시간 (KST)</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">직원명</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">사용된 키</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">접속 기기 ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-600 text-xs">{log.time}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-700">{log.userName}</td>
                      <td className="px-5 py-3.5">
                        <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">
                          {log.licenseKey}
                        </code>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 font-mono">{log.hwid}</td>
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
