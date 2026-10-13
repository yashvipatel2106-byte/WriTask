const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} = require("../controllers/folderController");

router.use(authMiddleware);

router.get("/", listFolders);
router.post("/", createFolder);
router.patch("/:folderId", updateFolder);
router.delete("/:folderId", deleteFolder);

module.exports = router;
