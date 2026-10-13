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

const router = express.Router();

router.post("/register", signup);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/google", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/switch-personal", auth, switchToPersonal);

module.exports = router;
