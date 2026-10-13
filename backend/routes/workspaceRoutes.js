const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  listWorkspaces,
  createWorkspace,
  ensureWorkspaces,
} = require("../controllers/workspaceController");

router.use(authMiddleware);

router.get("/", listWorkspaces);
router.post("/", createWorkspace);
router.post("/ensure", ensureWorkspaces);

module.exports = router;
