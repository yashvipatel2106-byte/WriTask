const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  listFiles,
  createFile,
  updateFile,
  deleteFile,
} = require("../controllers/workspaceFileController");

router.use(authMiddleware);

router.get("/", listFiles);
router.post("/", createFile);
router.patch("/:fileId", updateFile);
router.delete("/:fileId", deleteFile);

module.exports = router;
