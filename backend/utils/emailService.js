const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  requireTLS: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

transporter.verify(function(error, success) {
 
    if(error){
        console.log(error);
    }else{
        console.log("SMTP SERVER READY");
    }
 
});
/* ------------------------- OTP ------------------------- */

const sendOtpEmail = async ({ email, otp }) => {
  await new Promise((resolve, reject) => {
    transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: "WriTask Email Verification",
      html: `
        <div style="font-family: Arial;">
          <h2>Email Verification</h2>
          <p>Your OTP Code:</p>
          <h1>${otp}</h1>
          <p>Valid for 5 minutes.</p>
        </div>
      `,
    }, (error, info) => {
      if (error) {
        console.error("Error sending OTP email");
        console.log(error);
        reject(error);
      } else {
        resolve(info);
      }
    });
  });
};

/* ---------------- Google Sign-Up temporary password ---------------- */

const sendGoogleSignupPasswordEmail = async ({ email, tempPassword }) => {
  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to: email,
    subject: "Your WriTask account password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px;">
        <h2>Welcome to WriTask</h2>
        <p>Your account was created using Google Sign-In. Here is a one-time password you can use to sign in with your email and password as well:</p>
        <h1 style="letter-spacing: 2px;">${tempPassword}</h1>
        <p>Please sign in and change your password afterward for security.</p>
      </div>
    `,
  });
};

/* -------------------- Forgot Password -------------------- */

const sendForgotPasswordEmail = async ({ email, resetLink }) => {
  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to: email,
    subject: "Reset Password",
    html: `
      <h2>Reset Password</h2>

      <p>Click below to reset your password:</p>

      <a href="${resetLink}">
        Reset Password
      </a>
    `,
  });
};

/* ---------------- Organization Invite ---------------- */

const sendOrgInviteEmail = async ({
  to,
  orgName,
  role,
  inviteUrl,
  inviterName,
}) => {
  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to,
    subject: `You're invited to join ${orgName} on WriTask`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px;">
        <h2>Organization Invitation</h2>

        <p>
          <strong>${inviterName}</strong>
          invited you to join
          <strong>${orgName}</strong>
          as
          <strong>${role}</strong>.
        </p>

        <p>
          Click below to accept the invitation.
        </p>

        <p>
          <a
            href="${inviteUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#06b6d4;
              color:#fff;
              text-decoration:none;
              border-radius:8px;
            "
          >
            Accept Invitation
          </a>
        </p>

        <p style="color:#666;font-size:13px;">
          This link expires in 7 days.
        </p>

      </div>
    `,
  });
};

/* ---------------- Project Invite ---------------- */

const sendProjectInviteEmail = async ({
  to,
  projectName,
  orgName,
  role,
  inviteUrl,
  inviterName,
  alreadyAdded = false,
}) => {
  const cta = alreadyAdded
    ? "Open Project Board"
    : "Accept & Join Project";

  const intro = alreadyAdded
    ? `
      <p>
      You have been added to
      <strong>${projectName}</strong>
      ${orgName ? `in <strong>${orgName}</strong>` : ""}
      as
      <strong>${role}</strong>.
      </p>
    `
    : `
      <p>
      <strong>${inviterName}</strong>
      invited you to
      <strong>${projectName}</strong>
      ${orgName ? `in <strong>${orgName}</strong>` : ""}
      as
      <strong>${role}</strong>.
      </p>
    `;

  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to,
    subject: `You're invited to project "${projectName}" on WriTask`,
    html: `
      <div style="font-family: Arial; max-width:560px;">

        <h2>Project Invitation</h2>

        ${intro}

        <a
          href="${inviteUrl}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#06b6d4;
            color:#fff;
            text-decoration:none;
            border-radius:8px;
          "
        >
          ${cta}
        </a>

      </div>
    `,
  });
};

/* ---------------- Weekly Report Digest ---------------- */

const sendWeeklyReportEmail = async ({
  to,
  orgName,
  weekLabel,
  memberCount,
  attachments = [],
  // Member display names — prefer memberNames[]; employeeName kept for single-member callers
  memberNames = [],
  employeeName,
  pdfBuffer,
} = {}) => {
  const resolvedAttachments =
    attachments.length > 0
      ? attachments
      : pdfBuffer
        ? [
            {
              filename: `${employeeName || "member"} Weekly Task Report.pdf`,
              content: Buffer.from(pdfBuffer),
            },
          ]
        : [];

  const names = [
    ...new Set(
      [
        ...(Array.isArray(memberNames) ? memberNames : []),
        employeeName,
      ]
        .map((name) => (name != null ? String(name).trim() : ""))
        .filter(Boolean)
    ),
  ];

  const resolvedOrgName = orgName || "WriTask";
  const resolvedMemberLabel =
    names.length > 0
      ? names.join(", ")
      : memberCount > 0
        ? `${memberCount} team member${memberCount === 1 ? "" : "s"}`
        : "team members";

  const attachmentList =
    resolvedAttachments.length > 0
      ? `<p>${resolvedAttachments.length} report PDF(s) attached.</p>`
      : `<p>No report PDF was generated for this week.</p>`;

  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to,
    subject: `Weekly reports · ${resolvedOrgName} · ${weekLabel}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px;">
        <h2>Weekly team reports</h2>
        <p>
          Here are the weekly member reports for
          <strong>${resolvedOrgName}</strong>
          covering <strong>${weekLabel}</strong>.
        </p>
        <p>Report generated for: <strong>${resolvedMemberLabel}</strong></p>
        ${attachmentList}
        <p style="color:#666;font-size:13px;">
          Sent automatically by WriTask every Monday.
        </p>
      </div>
    `,
    attachments: resolvedAttachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: "application/pdf",
    })),
  });
};

/* ---------------- Contact Support (landing page) ---------------- */

// Public, unauthenticated submission — escape before interpolating into HTML.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const sendContactSupportEmail = async ({ name, email, subject, message }) => {
  await new Promise((resolve, reject) => {
    transporter.sendMail(
      {
        from: process.env.SMTP_EMAIL,
        to: process.env.SUPPORT_EMAIL || process.env.SMTP_EMAIL,
        replyTo: email,
        subject: `[Contact Support] ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px;">
            <h2>New contact support request</h2>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
          </div>
        `,
      },
      (error, info) => {
        if (error) {
          console.error("Error sending contact support email");
          console.log(error);
          reject(error);
        } else {
          resolve(info);
        }
      }
    );
  });
};

module.exports = {
  sendOtpEmail,
  sendGoogleSignupPasswordEmail,
  sendForgotPasswordEmail,
  sendOrgInviteEmail,
  sendProjectInviteEmail,
  sendWeeklyReportEmail,
  sendContactSupportEmail,
};
