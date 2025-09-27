// src/utils/mailer.js
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

let _transporter = null;
let _usingEthereal = false;

async function createTransporter() {
  if (_transporter) return _transporter;

  // Accept many env var names for compatibility
  const useEthereal =
    process.env.USE_ETHEREAL === "1" ||
    process.env.USE_ETHEREAL === "true";

  const host = process.env.MAIL_HOST || process.env.SMTP_HOST;
  const user =
    process.env.MAIL_USER || process.env.SMTP_USER || process.env.FROM_EMAIL;
  const pass = process.env.MAIL_PASS || process.env.SMTP_PASS;
  const portEnv = process.env.MAIL_PORT || process.env.SMTP_PORT;
  const secureEnv =
    (process.env.MAIL_SECURE || process.env.SMTP_SECURE || "").toLowerCase() ===
    "true";

  if (useEthereal || !host || !user || !pass) {
    // Ethereal (dev) fallback
    console.log(
      "Using Ethereal (dev) mail account — set USE_ETHEREAL=0 and/MAIL_* (or SMTP_*) vars for real SMTP"
    );
    const testAccount = await nodemailer.createTestAccount();
    _usingEthereal = true;
    _transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  } else {
    const port = portEnv ? parseInt(portEnv, 10) : secureEnv ? 465 : 587;
    const secure = secureEnv || port === 465;
    _transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      pool: true,
      maxConnections: 5,
    });
  }

  try {
    await _transporter.verify();
    console.log(
      `📧 Mailer ready (${_usingEthereal ? "ethereal" : "smtp"}). Host=${host ||
        "ethereal"}`
    );
  } catch (err) {
    console.warn("⚠ Mailer verify failed:", err.message || err);
  }
  return _transporter;
}

export async function sendMail({ to, subject, text, html, cc, bcc, attachments = [] }) {
  const transporter = await createTransporter();
  const fromName = process.env.FROM_NAME || "Techlynx Innovations";
  const fromEmail =
    process.env.FROM_EMAIL || process.env.MAIL_USER || process.env.SMTP_USER || "no-reply@example.com";
  const from = `"${fromName}" <${fromEmail}>`;

  const mailOptions = { from, to, cc, bcc, subject, text, html, attachments };

  const info = await transporter.sendMail(mailOptions);

  if (_usingEthereal) {
    info.previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("Email preview URL:", info.previewUrl);
  }
  console.log(`Sent mail -> to: ${to} subject: ${subject}`);
  return info;
}

function buildFormDataHtml(formData = {}) {
  if (!formData || typeof formData !== "object") return "";
  const rows = Object.keys(formData)
    .map(
      (k) =>
        `<tr><td style="padding:6px;border:1px solid #eee;"><strong>${k}</strong></td><td style="padding:6px;border:1px solid #eee;">${String(formData[k] ?? "")}</td></tr>`
    )
    .join("");
  return `<table style="border-collapse:collapse;">${rows}</table>`;
}

/**
 * sendApplicationEmails(args)
 * - applicantEmail, applicantName, hrEmail, position, formData, resumePath, applicationUrl
 */
export async function sendApplicationEmails({
  applicantEmail,
  applicantName,
  hrEmail,
  position = "Submission",
  formData = {},
  resumePath = null,
  applicationUrl = "",
}) {
  try {
    const submittedAt = new Date().toLocaleString();
    const referenceId = formData.id || Math.random().toString(36).slice(2, 9).toUpperCase();

    // HR email (include resume if exists)
    const hrHtml = `
      <h3>New ${position}</h3>
      <p><strong>Applicant:</strong> ${applicantName} &lt;${applicantEmail}&gt;</p>
      <p><strong>Reference ID:</strong> ${referenceId}<br/><strong>Submitted:</strong> ${submittedAt}</p>
      ${buildFormDataHtml(formData)}
      ${applicationUrl ? `<p><a href="${applicationUrl}" target="_blank">Open in admin</a></p>` : ""}
    `;
    const hrAttachments = [];
    if (resumePath && fs.existsSync(resumePath)) {
      hrAttachments.push({ filename: path.basename(resumePath), path: resumePath });
    }

    const hrPromise = sendMail({
      to: hrEmail,
      subject: `New ${position} — ${applicantName}`,
      html: hrHtml,
      attachments: hrAttachments,
    });

    // Applicant confirmation
    const applicantHtml = `
      <p>Hi ${applicantName || "Applicant"},</p>
      <p>Thanks for your ${position} submission. We received your details (Ref: <strong>${referenceId}</strong>) on ${submittedAt}.</p>
      <p>Summary of your submission:</p>
      ${buildFormDataHtml(formData)}
      <p>— ${process.env.FROM_NAME || "Techlynx Innovations"}</p>
    `;

    const applicantPromise = sendMail({
      to: applicantEmail,
      subject: `We received your ${position} — ${process.env.FROM_NAME || "Techlynx Innovations"}`,
      html: applicantHtml,
    });

    const results = await Promise.allSettled([hrPromise, applicantPromise]);
    return results;
  } catch (err) {
    console.error("Error in sendApplicationEmails:", err);
    throw err;
  }
}

export default { sendMail, sendApplicationEmails };
