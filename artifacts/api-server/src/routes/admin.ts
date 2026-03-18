import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, licensesTable, loginLogsTable, securityLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function kstNow(): string {
  const now = new Date();
  now.setHours(now.getHours() + 9);
  return now.toISOString().replace("T", " ").substring(0, 19);
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.username) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  if (req.session.role !== "admin") {
    res.status(403).json({ error: "관리자만 접근할 수 있습니다." });
    return;
  }
  next();
}

router.get("/admin/licenses", requireAdmin, async (_req, res) => {
  try {
    const licenses = await db
      .select()
      .from(licensesTable)
      .orderBy(licensesTable.createdAt);
    res.json({ licenses });
  } catch {
    res.status(500).json({ error: "데이터를 불러오는 중 오류가 발생했습니다." });
  }
});

router.post("/admin/licenses", requireAdmin, async (req, res) => {
  const { userName, licenseKey } = req.body as { userName?: string; licenseKey?: string };
  if (!userName || !licenseKey) {
    res.status(400).json({ error: "직원 이름과 라이선스 키를 입력해주세요." });
    return;
  }
  try {
    const [created] = await db
      .insert(licensesTable)
      .values({ userName: userName.trim(), licenseKey: licenseKey.trim(), hwid: "" })
      .onConflictDoUpdate({
        target: licensesTable.licenseKey,
        set: { userName: userName.trim() },
      })
      .returning();
    res.json({ success: true, license: created });
  } catch {
    res.status(500).json({ error: "라이선스 등록 중 오류가 발생했습니다." });
  }
});

router.post("/admin/licenses/:key/reset", requireAdmin, async (req, res) => {
  const licenseKey = decodeURIComponent(req.params.key);
  try {
    await db
      .update(licensesTable)
      .set({ hwid: "" })
      .where(eq(licensesTable.licenseKey, licenseKey));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "기기 초기화 중 오류가 발생했습니다." });
  }
});

router.delete("/admin/licenses/:key", requireAdmin, async (req, res) => {
  const licenseKey = decodeURIComponent(req.params.key);
  try {
    await db
      .delete(licensesTable)
      .where(eq(licensesTable.licenseKey, licenseKey));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "삭제 중 오류가 발생했습니다." });
  }
});

router.get("/admin/login-logs", requireAdmin, async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(loginLogsTable)
      .orderBy(loginLogsTable.id);
    res.json({ logs: logs.reverse() });
  } catch {
    res.status(500).json({ error: "로그를 불러오는 중 오류가 발생했습니다." });
  }
});

router.get("/admin/security-logs", requireAdmin, async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(securityLogsTable)
      .orderBy(securityLogsTable.id);
    res.json({ logs: logs.reverse() });
  } catch {
    res.status(500).json({ error: "로그를 불러오는 중 오류가 발생했습니다." });
  }
});

router.post("/verify", async (req, res) => {
  const { license_key, hwid } = req.body as { license_key?: string; hwid?: string };

  if (!license_key || !hwid) {
    res.status(400).json({ status: "error", message: "라이선스 키와 기기 ID가 필요합니다." });
    return;
  }

  try {
    const [doc] = await db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.licenseKey, license_key.trim()));

    if (!doc) {
      res.json({ status: "error", message: "존재하지 않거나 삭제된 라이선스입니다." });
      return;
    }

    const kst = kstNow();

    if (doc.hwid === "" || doc.hwid === hwid) {
      if (doc.hwid === "") {
        await db
          .update(licensesTable)
          .set({ hwid: hwid.trim() })
          .where(eq(licensesTable.licenseKey, license_key.trim()));
      }
      await db.insert(loginLogsTable).values({
        time: kst,
        licenseKey: license_key.trim(),
        userName: doc.userName,
        hwid: hwid.trim(),
      });
      res.json({ status: "success" });
      return;
    }

    await db.insert(securityLogsTable).values({
      time: kst,
      licenseKey: license_key.trim(),
      userName: doc.userName,
      registeredHwid: doc.hwid,
      attemptedHwid: hwid.trim(),
    });
    res.json({
      status: "error",
      message: "다른 기기에 등록된 라이선스입니다. 관리자에게 기기 초기화를 요청하세요.",
    });
  } catch {
    res.status(500).json({ status: "error", message: "서버 오류가 발생했습니다." });
  }
});

export default router;
