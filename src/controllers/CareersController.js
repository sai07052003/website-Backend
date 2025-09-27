// src/controllers/careersController.js
import pool from "../config/db.js";
import fs from "fs";
import path from "path";
import { sendApplicationEmails } from "../../mailer.js";

// ===============================
// Submit application
// ===============================
export const apply = async (req, res) => {
  const { fullName, email, phone, position, coverLetter } = req.body;
  const experiences = JSON.parse(req.body.experience || "[]");
  const education = JSON.parse(req.body.education || "[]");

  const resumeFile = req.file;
  const resumePath = resumeFile ? resumeFile.path : null;

  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.query(
      `SELECT id FROM applications WHERE email = ? AND position_applied = ? LIMIT 1`,
      [email, position]
    );

    if (existing.length > 0) {
      if (resumePath && fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
      return res.status(200).json({
        already_applied: true,
        message:
          "You already applied for this job. We’ll reach you if your skills match.",
      });
    }

    await conn.beginTransaction();

    const [insertResult] = await conn.query(
      `INSERT INTO applications 
        (full_name, email, phone, position_applied, resume_path, resume_original_name, resume_mime, cover_letter)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        fullName,
        email,
        phone,
        position || null,
        resumePath,
        resumeFile?.originalname || null,
        resumeFile?.mimetype || null,
        coverLetter || null,
      ]
    );

    const applicationId = insertResult.insertId;

    if (Array.isArray(experiences) && experiences.length) {
      const expValues = experiences.map((e) => [
        applicationId,
        e.company || null,
        e.role || null,
        e.years || null,
      ]);
      await conn.query(
        "INSERT INTO experiences (application_id, company, role, years) VALUES ?",
        [expValues]
      );
    }

    if (Array.isArray(education) && education.length) {
      const eduValues = education.map((e) => [
        applicationId,
        e.institution || null,
        e.degree || null,
        e.year || null,
      ]);
      await conn.query(
        "INSERT INTO education (application_id, institution, degree, year) VALUES ?",
        [eduValues]
      );
    }

    await conn.commit();

    // ✅ Send emails (applicant + HR)
    await sendApplicationEmails({
      applicantEmail: email,
      applicantName: fullName,
      hrEmail: process.env.HR_EMAIL,
      position,
      formData: { fullName, email, phone, position, coverLetter },
      resumePath,
      applicationUrl: `${process.env.APP_WEB_URL || ""}/admin/applications/${applicationId}`,
    });

    res
      .status(201)
      .json({ message: "Application submitted", id: applicationId });
  } catch (err) {
    await conn.rollback();
    if (resumePath && fs.existsSync(resumePath)) fs.unlinkSync(resumePath);
    console.error("❌ Error submitting application:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// ===============================
// Get all applications
// ===============================
export const getApplications = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, position_applied, created_at 
       FROM applications ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching applications:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================
// Get application by ID
// ===============================
export const getApplicationById = async (req, res) => {
  const id = req.params.id;
  try {
    const [apps] = await pool.query(
      `SELECT * FROM applications WHERE id = ?`,
      [id]
    );
    const application = apps[0];
    if (!application) return res.status(404).json({ message: "Not found" });

    const [exps] = await pool.query(
      `SELECT company, role, years FROM experiences WHERE application_id = ?`,
      [id]
    );
    const [edus] = await pool.query(
      `SELECT institution, degree, year FROM education WHERE application_id = ?`,
      [id]
    );

    res.json({ application, experiences: exps, education: edus });
  } catch (err) {
    console.error("❌ Error fetching application by ID:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================
// Download resume
// ===============================
export const downloadResume = async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query(
      `SELECT resume_path, resume_original_name FROM applications WHERE id = ?`,
      [id]
    );
    const app = rows[0];
    if (!app || !app.resume_path)
      return res.status(404).json({ message: "Resume not found" });

    const filePath = path.resolve(app.resume_path);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: "File missing on server" });

    res.download(filePath, app.resume_original_name || "resume.pdf");
  } catch (err) {
    console.error("❌ Error downloading resume:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===============================
// Delete application
// ===============================
export const deleteApplication = async (req, res) => {
  const id = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT resume_path FROM applications WHERE id = ?`,
      [id]
    );
    const app = rows[0];
    if (!app) {
      await conn.rollback();
      return res.status(404).json({ message: "Application not found" });
    }

    await conn.query(`DELETE FROM applications WHERE id = ?`, [id]);
    await conn.commit();

    if (app.resume_path && fs.existsSync(app.resume_path)) {
      try {
        fs.unlinkSync(app.resume_path);
      } catch (e) {
        console.warn("⚠ Could not remove file:", e.message);
      }
    }

    res.json({ message: "Application deleted" });
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error deleting application:", err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};
