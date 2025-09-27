// src/routes/careers.js
import express from "express";
import multer from "multer";
import fs from "fs";
import {
  apply,
  getApplications,
  getApplicationById,
  downloadResume,
  deleteApplication,
} from '../controllers/CareersController.js';

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Routes
router.post("/apply", upload.single("resume"), apply);
router.get("/", getApplications);
router.get("/:id", getApplicationById);
router.get("/:id/resume", downloadResume);
router.delete("/:id", deleteApplication);

export default router;