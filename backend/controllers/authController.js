const User = require("../models/user");
const Organization = require("../models/Organization");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const workerManager = require("../workers/workerManager");
const { resolveFrontendUrl, normalizeEmail } = require("../utils/frontendUrl");
const {
  listUserOrganizations,
  findMembership,
  resolvePasswordResetOrganization,
  resolveLoginOrganization,
  setOrgMembershipPassword,
  hashOrgPassword,
} = require("../utils/orgMembershipAuth");

require("dotenv").config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const {
    loginRequests,
    failedLogins,
    otpFailures,
    activeSessions,
} = require("../metrics/authMetrics");

const { passwordPolicyError } = require("../utils/passwordPolicy");

const INVALID_CREDENTIALS = "Invalid user ID or password";
const MAX_OTP_ATTEMPTS = 5;

// 6-digit OTP from a CSPRNG; only its SHA-256 hash is stored.
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "hex");
  const bufB = Buffer.from(String(b), "hex");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function signAuthToken(userId, organizationId = null) {
  const payload = { id: userId };
  if (organizationId) payload.organizationId = organizationId.toString();
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapOrgChoices(organizations, userId) {
  return organizations.map((org) => ({
    organizationId: org._id.toString(),
    name: org.name,
    slug: org.slug,
    role: org.getMemberRole(userId),
  }));
}

/**
 * Shared success shape for password, Google, and workspace-switch responses.
 * By default does NOT auto-select an organization — login/signup land in
 * Personal Workspace. Pass organizationId explicitly when switching into an org.
 */
async function buildAuthResponse(user, organizationId = null) {
  const orgs = await listUserOrganizations(user._id);
  let activeOrgId = organizationId ? organizationId.toString() : null;

  if (activeOrgId) {
    const belongs = orgs.some((o) => o._id.toString() === activeOrgId);
    if (!belongs) activeOrgId = null;
  }

  try {
    const {
      ensurePersonalWorkspace,
      ensureOrgBuiltinWorkspaces,
    } = require("../utils/workspaces");
    await ensurePersonalWorkspace(user._id);
    if (activeOrgId) {
      await ensureOrgBuiltinWorkspaces(activeOrgId, user._id);
    }
  } catch (wsErr) {
    console.error("Workspace ensure on auth failed:", wsErr.message);
  }

  const token = signAuthToken(user._id, activeOrgId);

  return {
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      systemRole: user.systemRole || "user",
      avatarColor: user.avatarColor || "",
      hasPassword: Boolean(user.password),
      colorTheme: user.settings?.colorTheme || null,
    },
    organizationId: activeOrgId,
    workspaceType: activeOrgId ? "organization" : "personal",
    organizations: mapOrgChoices(orgs, user._id),
    // Personal workspace is always available; org onboarding is optional in-app.
    needsOnboarding: false,
  };
}

async function findUserByLoginId(raw) {
  const identifier = String(raw || "").trim();
  if (!identifier) return null;

  const email = normalizeEmail(identifier);
  if (email && identifier.includes("@")) {
    return User.findOne({ email });
  }

  const byUsername = await User.findOne({
    username: new RegExp(`^${escapeRegex(identifier)}$`, "i"),
  });
  if (byUsername) return byUsername;

  if (email) {
    return User.findOne({ email });
  }
  return null;
}


// SIGNUP

exports.signup = async (req, res) => {
  try {
    const { username, email: rawEmail, password } =
      req.body;
    const email = normalizeEmail(rawEmail);

    if (
      !username ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message:
          "Username, email and password are required.",
      });
    }

    const weakSignupPassword = passwordPolicyError(password);
    if (weakSignupPassword) {
      return res.status(400).json({ message: weakSignupPassword });
    }

    const existingUser =
      await User.findOne({ email });

    if (existingUser) {
      if (existingUser.verified) {
        return res.status(409).json({
          message:
            "User already exists. Please login.",
        });
      }

      const otp = generateOtp();

      existingUser.otp = sha256(otp);
      existingUser.otpAttempts = 0;
      existingUser.otpExpiry =
        new Date(
          Date.now() +
            5 * 60 * 1000
        );

      await existingUser.save();

      workerManager.run("emailWorker.js", {
      type: "OTP",
      data: {
        email,
        otp,
    },
}).catch((err) => {
    console.error("OTP Worker Error:", err);
});
      return res.status(200).json({
        message:
          "OTP resent to your email.",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    const otp = generateOtp();

    const otpExpiry = new Date(
      Date.now() +
        5 * 60 * 1000
    );

    await User.create({
      username,
      email,
      password: hashedPassword,
      otp: sha256(otp),
      otpExpiry,
      verified: false,
    });

    // Personal workspace is created on first authenticated ensure/list;
    // avoid tying it to unverified signup records.

    workerManager.run("emailWorker.js", {
    type: "OTP",
    data: {
        email,
        otp,
     },
    }).catch((err) => {
    console.error("OTP Worker Error:", err);
  });
    return res.status(201).json({
      message:
        "OTP sent to your email.",
    });
  } catch (error) {
    console.error(
      "Signup Error:",
      error
    );

    return res.status(500).json({
      message:
        "Internal Server Error",
    });
  }
};


// VERIFY OTP

exports.verifyOTP = async (
  req,
  res
) => {
  try {
    const { email: rawEmail, otp } =
      req.body;
    const email = normalizeEmail(rawEmail);

    const user =
      await User.findOne({
        email,
      });

    if (!user || typeof otp === "undefined" || otp === null) {
      // Same answer as a wrong code so accounts cannot be enumerated.
      return res.status(400).json({
        message:
          "Invalid OTP.",
      });
    }

    if (user.verified) {
      return res.status(400).json({
        message:
          "Email already verified.",
      });
    }

    if (
      !user.otpExpiry ||
      new Date() >
        user.otpExpiry
    ) {
      return res.status(400).json({
        message:
          "OTP expired.",
      });
    }

    if (
      !user.otp ||
      !safeEqualHex(user.otp, sha256(otp))
    ) {
      otpFailures.inc();
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
        // Too many wrong guesses: invalidate the code, a new one must be requested.
        user.otp = null;
        user.otpExpiry = null;
        user.otpAttempts = 0;
        await user.save();
        return res.status(429).json({
          message:
            "Too many incorrect attempts. Please request a new OTP.",
        });
      }
      await user.save();
      return res.status(400).json({
        message:
          "Invalid OTP.",
      });
    }

    user.verified = true;
    user.otp = null;
    user.otpExpiry = null;
    user.otpAttempts = 0;

    await user.save();

    return res.status(200).json({
      message:
        "Email verified successfully.",
    });
  } catch (error) {
    console.error(
      "Verify OTP Error:",
      error
    );

    return res.status(500).json({
      message:
        "Internal Server Error",
    });
  }
};


// LOGIN — organization password only
//
// Body: { userId|username|email, password }
// Opens the organization whose membership password matches (earliest joinedAt
// wins when multiple orgs share a password). Personal account passwords are
// not used for sign-in.

exports.login = async (req, res) => {
  loginRequests.inc();
  try {
    const loginId =
      req.body.userId ||
      req.body.username ||
      req.body.email ||
      "";
    const password = req.body.password;

    if (!String(loginId).trim()) {
      failedLogins.inc();
      return res.status(400).json({ message: INVALID_CREDENTIALS });
    }

    const user = await findUserByLoginId(loginId);

    if (!user) {
      failedLogins.inc();
      return res.status(401).json({ message: INVALID_CREDENTIALS });
    }

    if (!user.verified) {
      return res.status(403).json({
        message: "Please verify your email first.",
      });
    }

    const orgs = await listUserOrganizations(user._id);

    if (!password) {
      return res.json({
        needsPassword: true,
        email: user.email,
        username: user.username,
        organizationId: null,
        workspaceType: orgs.length ? "organization" : "personal",
        message: orgs.length
          ? "Enter your organization password to continue."
          : "Enter your password to continue.",
      });
    }

    const plainPassword = String(password).trim();

    if (orgs.length) {
      const loginOrg = await resolveLoginOrganization(user, plainPassword);
      if (loginOrg) {
        const auth = await buildAuthResponse(user, loginOrg._id);
        activeSessions.inc();
        return res.json({
          ...auth,
          organizationName: loginOrg.name,
          message: "Login successful",
        });
      }
    }

    // No organization membership password matched (or the user isn't a
    // member of any organization yet, e.g. a plain signup that hasn't been
    // invited anywhere) — fall back to the personal account password so
    // they can still sign in to their Personal Workspace.
    if (user.password && (await bcrypt.compare(plainPassword, user.password))) {
      const auth = await buildAuthResponse(user, null);
      activeSessions.inc();
      return res.json({
        ...auth,
        message: "Login successful",
      });
    }

    failedLogins.inc();
    return res.status(401).json({ message: INVALID_CREDENTIALS });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// GOOGLE SIGN-IN
// Accepts the ID token Google Identity Services returns on the frontend,
// verifies it server-side, and finds-or-creates the matching user.

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Google credential is required." });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired Google credential." });
    }

    if (!payload?.email) {
      return res.status(401).json({ message: "Google account has no email." });
    }

    if (!payload.email_verified) {
      return res.status(403).json({ message: "Google email is not verified." });
    }

    let user = await User.findOne({ email: payload.email });

    if (!user) {
      // Google Sign-In needs no password, but we still give the account a
      // real one so the same person can also log in the normal email/password
      // way later — mailed to them once, hashed before it ever touches the DB.
      const tempPassword = generateOtp();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      user = await User.create({
        username: payload.name || payload.email.split("@")[0],
        email: payload.email,
        password: hashedPassword,
        googleId: payload.sub,
        verified: true,
        avatarColor: "",
      });

      workerManager
        .run("emailWorker.js", {
          type: "GOOGLE_SIGNUP_PASSWORD",
          data: { email: payload.email, tempPassword },
        })
        .catch((err) => {
          console.error("Google Signup Password Email Worker Error:", err);
        });
    } else if (!user.googleId) {
      // Existing password-based account signing in with Google for the
      // first time — link it instead of creating a duplicate user.
      user.googleId = payload.sub;
      if (!user.verified) user.verified = true;
      await user.save();
    }

    const auth = await buildAuthResponse(user, null);
    return res.json({ ...auth, message: "Login successful" });
  } catch (error) {
    console.error("Google Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// FORGOT PASSWORD
// Keeps the existing email + reset-link flow. The token is bound server-side to
// a specific organization membership when one can be resolved (optional
// organizationId in the body is only accepted after membership validation).

exports.forgotPassword =
  async (req, res) => {
    try {
      const { email: rawEmail, organizationId: requestedOrgId } =
        req.body;
      const email = normalizeEmail(rawEmail);

      const user =
        await User.findOne({
          email,
        });

      if (!user) {
        // Same shape as the success response so accounts cannot be enumerated.
        return res.json({
          message: "Password reset email sent",
          organizationId: null,
          organizationName: null,
        });
      }

      const targetOrg = await resolvePasswordResetOrganization(
        user._id,
        requestedOrgId || null
      );

      const token =
        crypto
          .randomBytes(32)
          .toString(
            "hex"
          );

      // Only the hash is stored; the raw token is only in the emailed link.
      user.resetToken =
        sha256(token);

      user.resetTokenExpiry =
        Date.now() +
        3600000;

      user.resetOrganizationId = targetOrg ? targetOrg._id : null;

      await user.save();

      const frontendUrl = resolveFrontendUrl(req);
      const resetLink = `${frontendUrl}/reset-password/${token}`;

      workerManager.run("emailWorker.js", {
    type: "FORGOT_PASSWORD",
    data: {
        email,
        resetLink,
        organizationName: targetOrg ? targetOrg.name : null,
    },
}).catch((err) => {
    console.error("Forgot Password Worker Error:", err);
});

      return res.json({
        message: targetOrg
          ? `Password reset email sent for ${targetOrg.name}`
          : "Password reset email sent",
        organizationId: targetOrg ? targetOrg._id.toString() : null,
        organizationName: targetOrg ? targetOrg.name : null,
      });
    } catch (error) {
      console.error(
        "Forgot Password Error:",
        error
      );

      return res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
  };


// RESET PASSWORD
// Uses the organization bound to the token at forgot-password time — never an
// organizationId from the reset request body.

exports.resetPassword =
  async (req, res) => {
    try {
      const {
        token,
        password,
      } = req.body;

      const weakPassword = passwordPolicyError(password);
      if (weakPassword) {
        return res.status(400).json({ message: weakPassword });
      }

      const user =
        await User.findOne({
          resetToken:
            sha256(token || ""),
          resetTokenExpiry:
            {
              $gt:
                Date.now(),
            },
        });

      if (!user) {
        return res
          .status(400)
          .json({
            message:
              "Invalid or expired token",
          });
      }

      const boundOrgId = user.resetOrganizationId
        ? user.resetOrganizationId.toString()
        : null;

      let organizationName = null;

      if (boundOrgId) {
        const organization = await Organization.findOne({
          _id: boundOrgId,
          isDeleted: { $ne: true },
        });
        if (!organization || !findMembership(organization, user._id)) {
          user.resetToken = undefined;
          user.resetTokenExpiry = undefined;
          user.resetOrganizationId = undefined;
          await user.save();
          return res.status(400).json({
            message: "Invalid or expired token",
          });
        }

        organizationName = organization.name;
        await setOrgMembershipPassword(
          organization,
          user._id,
          String(password).trim()
        );
      } else {
        // No organization was bound to this token (personal workspace, or
        // multi-org forgot without a membership-validated organizationId).
        user.password = await hashOrgPassword(String(password).trim());
      }

      user.resetToken =
        undefined;

      user.resetTokenExpiry =
        undefined;

      user.resetOrganizationId = undefined;

      await user.save();

      return res.json({
        message: organizationName
          ? `Password updated for ${organizationName}`
          : "Password Updated",
        organizationName,
      });
    } catch (error) {
      console.error(
        "Reset Password Error:",
        error
      );

      return res.status(500).json({
        message:
          "Internal Server Error",
      });
    }
  };

// Switch active session back to Personal Workspace (clears JWT organizationId).
exports.switchToPersonal = async (req, res) => {
  try {
    const auth = await buildAuthResponse(req.user, null);
    return res.json({
      ...auth,
      message: "Switched to Personal Workspace",
    });
  } catch (error) {
    console.error("Switch Personal Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
