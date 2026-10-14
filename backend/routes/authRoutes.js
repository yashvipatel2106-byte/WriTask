const express = require("express");
const {
  signup,
  verifyOTP,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
  switchToPersonal,
} = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");

const {
  loginLimiter,
  accountRecoveryLimiter,
} = require("../middleware/rateLimiters");

const router = express.Router();

router.post("/register", accountRecoveryLimiter, signup);
router.post("/verify-otp", accountRecoveryLimiter, verifyOTP);
router.post("/login", loginLimiter, login);
router.post("/google", loginLimiter, googleLogin);
router.post("/forgot-password", accountRecoveryLimiter, forgotPassword);
router.post("/reset-password", accountRecoveryLimiter, resetPassword);
router.post("/switch-personal", auth, switchToPersonal);

module.exports = router;
