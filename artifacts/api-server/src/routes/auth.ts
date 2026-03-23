import { Router, type IRouter } from "express";
import { employees } from "../config/employees";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

// ── 접속 로그 (파일 기반) ─────────────────────────────────────────
const LOG_FILE = path.join(process.cwd(), ".cache", "access-logs.json");

interface AccessLog {
  id: number;
  time: string;
  username: string;
  displayName: string;
  ip: string;
}

function loadLogs(): AccessLog[] {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")) as AccessLog[];
    }
  } catch { /* ignore */ }
  return [];
}

function appendLog(entry: Omit<AccessLog, "id">): void {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const logs = loadLogs();
    const newEntry: AccessLog = { id: (logs[logs.length - 1]?.id ?? 0) + 1, ...entry };
    logs.push(newEntry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs), "utf-8");
  } catch (e) {
    console.error("[접속 로그 저장 실패]", e);
  }
}

function kstNow(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);
}

// ─────────────────────────────────────────────────────────────────
router.post("/auth/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(401).json({ error: "아이디와 비밀번호를 입력해주세요." });
    return;
  }

  const employee = employees.find(
    (e) => e.username === username && e.password === password
  );

  if (!employee) {
    res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    return;
  }

  req.session.username = employee.username;
  req.session.role = employee.role;

  // 접속 로그 기록
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  appendLog({ time: kstNow(), username: employee.username, displayName: employee.displayName, ip });

  res.json({
    success: true,
    user: { username: employee.username, displayName: employee.displayName, role: employee.role },
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ success: true });
  });
});

router.get("/auth/me", (req, res) => {
  const username = req.session.username;
  if (!username) { res.json({ user: null }); return; }

  const employee = employees.find((e) => e.username === username);
  if (!employee) { req.session.destroy(() => {}); res.json({ user: null }); return; }

  res.json({ user: { username: employee.username, displayName: employee.displayName, role: employee.role } });
});

// 관리자용 접속 로그 조회
router.get("/admin/access-logs", (req, res) => {
  if (!req.session.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "관리자만 접근할 수 있습니다." }); return; }

  const logs = loadLogs();
  res.json({ logs: logs.reverse() }); // 최신순
});

export default router;
