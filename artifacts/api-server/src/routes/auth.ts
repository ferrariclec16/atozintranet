import { Router, type IRouter } from "express";
import { employees } from "../config/employees";

const router: IRouter = Router();

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

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

  res.json({
    success: true,
    user: {
      username: employee.username,
      displayName: employee.displayName,
      role: employee.role,
    },
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

  if (!username) {
    res.json({ user: null });
    return;
  }

  const employee = employees.find((e) => e.username === username);

  if (!employee) {
    req.session.destroy(() => {});
    res.json({ user: null });
    return;
  }

  res.json({
    user: {
      username: employee.username,
      displayName: employee.displayName,
      role: employee.role,
    },
  });
});

export default router;
