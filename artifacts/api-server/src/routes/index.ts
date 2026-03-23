import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import partsRouter from "./parts";
import purchaseHistoryRouter from "./purchase-history";
import orderProcessingLogRouter from "./order-processing-log";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(partsRouter);
router.use(purchaseHistoryRouter);
router.use(orderProcessingLogRouter);

export default router;
