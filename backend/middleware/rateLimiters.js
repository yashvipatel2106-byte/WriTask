const rateLimit = require("express-rate-limit");

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message },
  });

// Login: slow down password guessing.
const loginLimiter = make(
  15 * 60 * 1000,
  20,
  "Too many login attempts. Please try again in a few minutes."
);

// Signup, OTP verification, forgot/reset password.
const accountRecoveryLimiter = make(
  15 * 60 * 1000,
  10,
  "Too many requests. Please try again in a few minutes."
);

// Public contact form (sends email).
const contactLimiter = make(
  60 * 60 * 1000,
  5,
  "Too many messages sent. Please try again later."
);

module.exports = { loginLimiter, accountRecoveryLimiter, contactLimiter };
