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

const sendForgotPasswordEmail = async ({
  email,
  resetLink,
  organizationName,
}) => {
  const forOrg = organizationName
    ? ` for <strong>${organizationName}</strong>`
    : "";
  const subject = organizationName
    ? `Reset password for ${organizationName}`
    : "Reset Password";

  await transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to: email,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px;">
        <h2>Reset Password${organizationName ? ` — ${organizationName}` : ""}</h2>

        <p>
          You requested a password reset${forOrg} on WriTask.
          ${
            organizationName
              ? "This link updates only that organization's password. Your other organizations are unchanged."
              : "Click below to choose a new password."
          }
        </p>

        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px;">
            Reset password${organizationName ? ` for ${organizationName}` : ""}
          </a>
        </p>

        <p style="color:#64748b;font-size:13px;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
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

/* ---------------- Request Form thank-you email ---------------- */

const sendRequestFormThankYouEmail = async ({
  to,
  formName,
  requestReference,
  senderName,
  greeting,
  message,
  closing,
  responses = [],
  mentionedByName,
}) => {
  const resolvedSender = senderName?.trim() || "WriTask";

  const responseRows = responses
    .map(
      (item) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;white-space:nowrap;">${escapeHtml(
          item.label
        )}</td><td style="padding:4px 0;">${escapeHtml(item.value)}</td></tr>`
    )
    .join("");

  await new Promise((resolve, reject) => {
    transporter.sendMail(
      {
        from: process.env.SMTP_EMAIL,
        to,
        subject: `${resolvedSender}: We received your request (${requestReference})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px;">
            ${
              mentionedByName
                ? `<p style="color:#64748b;font-size:13px;">You are receiving this email because you were mentioned in ${escapeHtml(
                    mentionedByName
                  )}'s request form.</p>`
                : ""
            }
            <p>${escapeHtml(greeting || "Hello,")}</p>
            <p>${escapeHtml(message || "We received your request.")}</p>
            <p><strong>Form:</strong> ${escapeHtml(formName)}<br/>
               <strong>Reference:</strong> ${escapeHtml(requestReference)}</p>
            ${
              responseRows
                ? `<table style="border-collapse:collapse;margin-top:12px;font-size:13px;">${responseRows}</table>`
                : ""
            }
            <p style="margin-top:16px;">${escapeHtml(closing || "Thank you,")}<br/>${escapeHtml(
              resolvedSender
            )}</p>
          </div>
        `,
      },
      (error, info) => {
        if (error) {
          console.error("Error sending request form thank-you email");
          console.log(error);
          reject(error);
        } else {
          resolve(info);
        }
      }
    );
  });
};

/* ---------------- Request Form approval/rejection email ---------------- */

const sendRequestFormReviewEmail = async ({
  to,
  formName,
  requestReference,
  submittedAt,
  projectName,
  status,
  rejectionReason,
  mentionedByName,
  senderName,
}) => {
  const resolvedSender = senderName?.trim() || formName;

  const submittedDateLabel = submittedAt
    ? new Date(submittedAt).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const isApproved = status === "approved";
  const statusLabel = isApproved ? "Approved" : "Rejected";

  const statusSentence = submittedDateLabel
    ? `Your request submitted on ${escapeHtml(submittedDateLabel)} has been ${escapeHtml(
        statusLabel.toLowerCase()
      )}.`
    : `Your request has been ${escapeHtml(statusLabel.toLowerCase())}.`;

  await new Promise((resolve, reject) => {
    transporter.sendMail(
      {
        from: process.env.SMTP_EMAIL,
        to,
        subject: `${escapeHtml(formName)}: Your request has been ${statusLabel.toLowerCase()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px;">
            ${
              mentionedByName
                ? `<p style="color:#64748b;font-size:13px;">You are receiving this email because you were mentioned in ${escapeHtml(
                    mentionedByName
                  )}'s request form.</p>`
                : ""
            }
            <p>Hello,</p>
            <p>${statusSentence}</p>
            <p>
              <strong>Form:</strong> ${escapeHtml(formName)}<br/>
              <strong>Reference:</strong> ${escapeHtml(requestReference)}<br/>
              ${
                projectName
                  ? `<strong>Project:</strong> ${escapeHtml(projectName)}<br/>`
                  : ""
              }
              <strong>Status:</strong> ${statusLabel}
            </p>
            ${
              !isApproved && rejectionReason
                ? `<p><strong>Rejection Reason:</strong> ${escapeHtml(rejectionReason)}</p>`
                : ""
            }
            <p style="margin-top:16px;">Thank you,<br/>${escapeHtml(resolvedSender)}</p>
          </div>
        `,
      },
      (error, info) => {
        if (error) {
          console.error("Error sending request form review email");
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
  sendRequestFormThankYouEmail,
  sendRequestFormReviewEmail,
};
