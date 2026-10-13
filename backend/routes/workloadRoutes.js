const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getWorkload,
} = require("../controllers/workloadController");

router.use(authMiddleware);

router.get("/", getWorkload);

module.exports = router;