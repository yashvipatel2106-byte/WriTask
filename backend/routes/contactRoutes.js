const express = require("express");
const { submitContactSupport } = require("../controllers/contactController");

const router = express.Router();

// Public — no auth. Landing-page Contact Support form.
router.post("/", submitContactSupport);

module.exports = router;
