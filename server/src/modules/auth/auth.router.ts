import { Router } from "express";
import patientRegistrationRouter from "./patient-registration";
import staffLoginRouter from "./staff-login";
import patientOtpRouter from "./patient-otp";
import passwordResetRouter from "./password-reset";

const router = Router();

router.use(patientRegistrationRouter);
router.use(staffLoginRouter);
router.use(patientOtpRouter);
router.use(passwordResetRouter);

export default router;
