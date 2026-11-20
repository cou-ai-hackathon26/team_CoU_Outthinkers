import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import voiceRouter from "./routes/voice";
import locationsRouter from "./modules/locations/locations.router";
import authRouter from "./modules/auth/auth.router";
import adminRouter from "./modules/admin/admin.router";

dotenv.config();

const app = express();

app.use("/api/voice-intake", voiceRouter);

app.use(express.json({ limit: "2mb" }));

app.use("/api/locations", locationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "MaternaCare API",
  });
});

const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MaternaCare API running on ${PORT}`);
});
