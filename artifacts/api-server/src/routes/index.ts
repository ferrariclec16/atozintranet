import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import partsRouter from "./parts";
import purchaseHistoryRouter from "./purchase-history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(partsRouter);
router.use(purchaseHistoryRouter);

export default router;
