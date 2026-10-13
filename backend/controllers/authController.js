const User = require("../models/user");
const Organization = require("../models/Organization");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const workerManager = require("../workers/workerManager");
const { resolveFrontendUrl, normalizeEmail } = require("../utils/frontendUrl");

require("dotenv").config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const {
    loginRequests,
    failedLogins,
    otpFailures,
    activeSessions,
} = require("../metrics/authMetrics");
// Shared success shape for both password and Google login, so the frontend
// handles either the same way.
async function buildAuthResponse(user) {
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  const org = await Organization.findOne({
    $or: [{ owner: user._id }, { "members.user": user._id }],
  });

  return {
    token,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      systemRole: user.systemRole || "user",
      avatarColor: user.avatarColor || "",
      hasPassword: Boolean(user.password),
    },
    organizationId: org ? org._id.toString() : null,
    needsOnboarding: !org,
  };
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

    const existingUser =
      await User.findOne({ email });

    if (existingUser) {
      if (existingUser.verified) {
        return res.status(409).json({
          message:
            "User already exists. Please login.",
        });
      }

      const otp = Math.floor(
        100000 +
          Math.random() * 900000
      ).toString();

      existingUser.otp = otp;
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

    const otp = Math.floor(
      100000 +
        Math.random() * 900000
    ).toString();

    const otpExpiry = new Date(
      Date.now() +
        5 * 60 * 1000
    );

    await User.create({
      username,
      email,
      password: hashedPassword,
      otp,
      otpExpiry,
      verified: false,
    });

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

    if (!user) {
      return res.status(404).json({
        message:
          "User not found.",
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
      user.otp !==
      otp.toString()
    ) {
      otpFailures.inc();
      return res.status(400).json({
        message:
          "Invalid OTP.",
      });
    }

    user.verified = true;
    user.otp = null;
    user.otpExpiry = null;

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


// LOGIN

exports.login = async (
  req,
  res
) => {
  loginRequests.inc();
  try {
    const { email: rawEmail, password } =
      req.body;
    const email = normalizeEmail(rawEmail);

    const user =
      await User.findOne({
        email,
      });

    if (!user) {
      failedLogins.inc();
      return res.status(404).json({
        message:
          "User not found.",
      });
    }

    if (!user.verified) {
      return res.status(403).json({
        message:
          "Please verify your email first.",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message:
          "This account uses Google Sign-In. Please continue with Google.",
      });
    }

    const isMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isMatch) {
      failedLogins.inc();
      return res.status(400).json({
        message:
          "Invalid Password",
      });
    }

    const auth = await buildAuthResponse(user);
    activeSessions.inc();
    return res.json({ ...auth, message: "Login successful" });

  } catch (error) {
    console.error(
      "Login Error:",
      error
    );

    return res.status(500).json({
      message:
        "Internal Server Error",
    });
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
      const tempPassword = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
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

    const auth = await buildAuthResponse(user);
    return res.json({ ...auth, message: "Login successful" });
  } catch (error) {
    console.error("Google Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// FORGOT PASSWORD

exports.forgotPassword =
  async (req, res) => {
    try {
      const { email: rawEmail } =
        req.body;
      const email = normalizeEmail(rawEmail);

      const user =
        await User.findOne({
          email,
        });

      if (!user) {
        return res
          .status(404)
          .json({
            message:
              "User not found",
          });
      }

      const token =
        crypto
          .randomBytes(32)
          .toString(
            "hex"
          );

      user.resetToken =
        token;

      user.resetTokenExpiry =
        Date.now() +
        3600000;

      await user.save();

      const frontendUrl = resolveFrontendUrl(req);
      const resetLink = `${frontendUrl}/reset-password/${token}`;

      workerManager.run("emailWorker.js", {
    type: "FORGOT_PASSWORD",
    data: {
        email,
        resetLink,
    },
}).catch((err) => {
    console.error("Forgot Password Worker Error:", err);
});

      return res.json({
        message:
          "Password reset email sent",
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

exports.resetPassword =
  async (req, res) => {
    try {
      const {
        token,
        password,
      } = req.body;

      const user =
        await User.findOne({
          resetToken:
            token,
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

      user.password =
        await bcrypt.hash(
          password,
          10
        );

      user.resetToken =
        undefined;

      user.resetTokenExpiry =
        undefined;

      await user.save();

      return res.json({
        message:
          "Password Updated",
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