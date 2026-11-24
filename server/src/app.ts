import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import voiceRouter from "./routes/voice";
import locationsRouter from "./modules/locations/locations.router";
import authRouter from "./modules/auth/auth.router";
import adminRouter from "./modules/admin/admin.router";
import staffRouter from "./modules/staff/staff.router";
import patientRouter from "./modules/patients/patient.router";
import { requireAuth } from "./modules/auth/auth-token";
import { rateLimit } from "./lib/rate-limit";
import facilitiesRouter from "./modules/facilities/facilities.router";
import facilityWorkerRouter from "./modules/facility-workers/facility-worker.router";

dotenv.config();
export const app = express();
  app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    exposedHeaders: ["Retry-After", "X-RateLimit-Reset"],
  }));
app.use("/api/auth", rateLimit({ name: "auth", windowMs: 60_000, max: 60 }));
app.use("/api/voice-intake", requireAuth, voiceRouter);
app.use(express.json({ limit: "2mb" }));
app.use("/api/locations", locationsRouter);
app.use("/api/facilities", rateLimit({ name: "facility-search", windowMs: 60_000, max: 30 }), facilitiesRouter);
app.use("/api/facility-worker", facilityWorkerRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/staff", staffRouter);
app.use("/api/patient", patientRouter);
app.get("/api/health", (_request, response) => response.json({ status: "healthy", service: "MaternaCare API" }));

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error", error);
  if (response.headersSent) return;
  response.status(500).json({ error: "সার্ভারে একটি সমস্যা হয়েছে।" });
});
