const express = require("express");
const { submitContactSupport } = require("../controllers/contactController");

const { contactLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

// Public — no auth. Landing-page Contact Support form.
router.post("/", contactLimiter, submitContactSupport);

module.exports = router;
