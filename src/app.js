// src/app.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import careerRoutes from "./routes/careers.js";
import { sendApplicationEmails } from "../mailer.js";

dotenv.config();
const app = express();

// ✅ MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Mysql@1249",
  database: process.env.DB_NAME || "techlynxproject2",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(process.env.UPLOAD_DIR || "uploads"));

app.use("/api/careers", careerRoutes);

app.get("/", (req, res) => res.send("Techlynx Careers API ✅"));

// ================= Enrollments ================= //
app.post("/enroll", async (req, res) => {
  try {
    const { name, email, phone, course, mode, message } = req.body;
    if (!name || !email || !course || !mode) {
      return res.status(400).json({ error: "⚠ Please fill all required fields." });
    }

    const [existing] = await pool.execute(
      "SELECT id FROM enrollments WHERE email = ? LIMIT 1",
      [email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "⚠ This email is already enrolled." });
    }

    const [result] = await pool.execute(
      "INSERT INTO enrollments (name, email, phone, course, mode, message) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, phone || null, course, mode, message || null]
    );

    // ✅ Send emails
    await sendApplicationEmails({
      applicantEmail: email,
      applicantName: name,
      hrEmail: process.env.HR_EMAIL,
      position: `Course Enrollment: ${course}`,
      formData: { name, email, phone, course, mode, message },
    });

    return res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("DB Error:", err);
    return res.status(500).json({ error: "❌ Database error" });
  }
});

app.get("/enrollments", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM enrollments ORDER BY created_at DESC");
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "❌ Database error" });
  }
});

// ================= Connect With Us (training page) ================= //
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "❌ All fields are required." });
    }

    await pool.execute(
      "INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)",
      [name, email, message]
    );

    // ✅ Send emails
    await sendApplicationEmails({
      applicantEmail: email,
      applicantName: name,
      hrEmail: process.env.HR_EMAIL,
      position: "Connect With Us",
      formData: { name, email, message },
    });

    res.status(201).json({ message: "✅ Message saved successfully!" });
  } catch (err) {
    console.error("Error inserting data:", err);
    res.status(500).json({ error: "❌ Database error" });
  }
});

// ================= Contact Form (main contact page) ================= //
app.post("/api/contact-form", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, address, course, message } = req.body;
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS count FROM messages WHERE firstName = ? AND lastName = ? AND email = ?",
      [firstName, lastName, email]
    );
    if (rows[0].count >= 2) {
      return res.status(400).json({
        message: "You have already submitted this form twice. Cannot submit again.",
      });
    }

    await pool.execute(
      "INSERT INTO messages (firstName, lastName, email, phone, address, course, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [firstName, lastName, email, phone, address, course, message]
    );

    // ✅ Send emails
    await sendApplicationEmails({
      applicantEmail: email,
      applicantName: `${firstName} ${lastName}`,
      hrEmail: process.env.HR_EMAIL,
      position: "Contact Form",
      formData: { firstName, lastName, email, phone, address, course, message },
    });

    res.status(200).json({ message: "✅ Message saved successfully" });
  } catch (err) {
    console.error("Error in MainContactPage:", err);
    res.status(500).json({ error: "❌ Database error", details: err.message });
  }
});

// ================= Feedback Form ================= //
app.post("/feedback", async (req, res) => {
  try {
    const {
      name,
      email,
      category,
      overall_rating,
      course_quality,
      teaching_method,
      support_staff,
      value_for_money,
      recommendation,
      overall_experience,
      detailed_feedback,
      suggestions,
    } = req.body;

    if (!name || !email || !detailed_feedback) {
      return res
        .status(400)
        .json({ message: "⚠ Name, Email, and Feedback are required" });
    }

    await pool.execute(
      `INSERT INTO feedback 
      (name, email, category, overall_rating, course_quality, teaching_method, support_staff, value_for_money, recommendation, overall_experience, detailed_feedback, suggestions) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        category,
        overall_rating,
        course_quality,
        teaching_method,
        support_staff,
        value_for_money,
        recommendation,
        overall_experience,
        detailed_feedback,
        suggestions,
      ]
    );

    // ✅ Send emails
    await sendApplicationEmails({
      applicantEmail: email,
      applicantName: name,
      hrEmail: process.env.HR_EMAIL,
      position: "Feedback Submission",
      formData: {
        name,
        email,
        category,
        overall_rating,
        course_quality,
        teaching_method,
        support_staff,
        value_for_money,
        recommendation,
        overall_experience,
        detailed_feedback,
        suggestions,
      },
    });

    res.json({ message: "✅ Feedback submitted successfully!" });
  } catch (err) {
    console.error("Error inserting feedback:", err);
    res.status(500).json({ message: "❌ Database error", error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
