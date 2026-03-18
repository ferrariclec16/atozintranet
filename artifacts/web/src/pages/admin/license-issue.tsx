import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { FilePlus, CheckCircle, AlertCircle } from "lucide-react";

export default function LicenseIssue() {
  const [userName, setUserName] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userName.trim() || !licenseKey.trim()) return;
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`${BASE}/api/admin/licenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userName: userName.trim(), licenseKey: licenseKey.trim() }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (res.ok && data.success) {
        setStatus("success");
        setMessage(`[${licenseKey.trim()}] 키가 ${userName.trim()} 님께 발급되었습니다.`);
        setUserName("");
        setLicenseKey("");
      } else {
        setStatus("error");
        setMessage(data.error ?? "오류가 발생했습니다.");
      }
    } catch {
      setStatus("error");
      setMessage("서버 연결에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="h-14 px-8 flex items-center border-b border-gray-200 bg-white gap-2">
          <span className="text-sm text-orange-400 font-medium">관리자 전용</span>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-700">신규 라이선스 발급</span>
        </header>

        <div className="flex-1 p-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 mb-1">
              <FilePlus className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-bold text-gray-800">신규 라이선스 발급</h1>
            </div>
            <p className="text-sm text-gray-400 mb-6">직원 이름과 라이선스 키를 입력하여 등록합니다.</p>

            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">직원 이름</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="예: 홍길동"
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">라이선스 키</label>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="예: ATOZ-2026-001"
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                />
              </div>

              {status === "success" && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {message}
                </div>
              )}
              {status === "error" && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
              >
                {status === "loading" ? "등록 중..." : "등록하기"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
