import { Router, type IRouter } from "express";
import { employees } from "../config/employees";
import { Pool } from "pg";

const router: IRouter = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 테이블 자동 생성
pool.query(`
  CREATE TABLE IF NOT EXISTS access_logs (
    id        SERIAL PRIMARY KEY,
    time      TEXT NOT NULL,
    username  TEXT NOT NULL,
    display_name TEXT NOT NULL,
    ip        TEXT NOT NULL
  )
`).catch((e) => console.error("[access_logs 테이블 생성 실패]", e));

function kstNow(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);
}

async function appendLog(entry: { time: string; username: string; displayName: string; ip: string }) {
  try {
    await pool.query(
      `INSERT INTO access_logs (time, username, display_name, ip) VALUES ($1, $2, $3, $4)`,
      [entry.time, entry.username, entry.displayName, entry.ip]
    );
  } catch (e) {
    console.error("[접속 로그 저장 실패]", e);
  }
}

// ─────────────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
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

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  await appendLog({ time: kstNow(), username: employee.username, displayName: employee.displayName, ip });

  req.session.save((err) => {
    if (err) {
      console.error("[세션 저장 오류]", err);
      res.status(500).json({ error: "세션 저장 중 오류가 발생했습니다." });
      return;
    }
    res.json({
      success: true,
      user: { username: employee.username, displayName: employee.displayName, role: employee.role },
    });
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
router.get("/admin/access-logs", async (req, res) => {
  if (!req.session.username) { res.status(401).json({ error: "로그인이 필요합니다." }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "관리자만 접근할 수 있습니다." }); return; }

  try {
    const result = await pool.query(
      `SELECT id, time, username, display_name AS "displayName", ip FROM access_logs ORDER BY id DESC`
    );
    res.json({ logs: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
