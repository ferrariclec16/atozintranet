import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Key, RotateCcw, Trash2, RefreshCw } from "lucide-react";

interface License {
  id: number;
  licenseKey: string;
  userName: string;
  hwid: string;
  createdAt: string;
}

export default function LicenseManage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/licenses`, { credentials: "include" });
      const data = await res.json() as { licenses: License[] };
      setLicenses(data.licenses ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [BASE]);

  useEffect(() => { void fetchLicenses(); }, [fetchLicenses]);

  async function handleReset(licenseKey: string) {
    if (!confirm(`[${licenseKey}]의 기기 정보를 초기화하시겠습니까?`)) return;
    setActionLoading(licenseKey + "-reset");
    try {
      await fetch(`${BASE}/api/admin/licenses/${encodeURIComponent(licenseKey)}/reset`, {
        method: "POST",
        credentials: "include",
      });
      await fetchLicenses();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(licenseKey: string) {
    if (!confirm(`[${licenseKey}]를 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setActionLoading(licenseKey + "-delete");
    try {
      await fetch(`${BASE}/api/admin/licenses/${encodeURIComponent(licenseKey)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await fetchLicenses();
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white gap-2">
          <span className="text-sm text-orange-400 font-medium">관리자 전용</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">라이선스 관리</span>
        </header>

        <div className="flex-1 p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-bold text-gray-800">라이선스 현황</h1>
              <span className="text-sm text-gray-400">({licenses.length}개)</span>
            </div>
            <button
              onClick={() => void fetchLicenses()}
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
            ) : licenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-sm text-gray-400">
                <Key className="w-10 h-10 text-gray-200 mb-3" />
                등록된 라이선스가 없습니다.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">직원명</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">라이선스 키</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">등록 기기 ID (HWID)</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {licenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-700">{lic.userName}</td>
                      <td className="px-5 py-3.5">
                        <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">
                          {lic.licenseKey}
                        </code>
                      </td>
                      <td className="px-5 py-3.5">
                        {lic.hwid ? (
                          <span className="text-xs text-gray-500 font-mono">{lic.hwid}</span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">미등록 (최초 접속 대기)</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => void handleReset(lic.licenseKey)}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-600 hover:bg-orange-200 px-2.5 py-1.5 rounded-md transition-colors mr-1.5 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          기기 초기화
                        </button>
                        <button
                          onClick={() => void handleDelete(lic.licenseKey)}
                          disabled={actionLoading !== null}
                          className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" />
                          삭제
                        </button>
                      </td>
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
