const express = require("express");
const {
  signup,
  verifyOTP,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", signup);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
