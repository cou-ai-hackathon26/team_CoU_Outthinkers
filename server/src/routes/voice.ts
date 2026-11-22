import { Router } from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { aiServiceHeaders } from "../lib/ai-client";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const AI_URL =
  process.env.AI_SERVICE_URL || "http://localhost:8000";

router.post("/", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Audio file is required",
      });
    }

    const form = new FormData();

    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || "application/octet-stream",
      knownLength: req.file.size,
    });

    const response = await axios.post(
      `${AI_URL}/transcribe`,
      form,
      {
        headers: { ...form.getHeaders(), ...aiServiceHeaders() },
        timeout: 180000,
        maxBodyLength: 10 * 1024 * 1024,
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error("AI transcription proxy failed", error);
    return res.status(502).json({
      error: axios.isAxiosError(error)
        ? String(error.response?.data?.detail || error.response?.data?.error || "AI transcription failed")
        : "AI transcription service unavailable",
    });
  }
});

export default router;
