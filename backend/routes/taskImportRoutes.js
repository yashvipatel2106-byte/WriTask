const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { requireProjectRole } = require("../middleware/rbacMiddleware");

const uploadExcel = require("../middleware/uploadExcel");

const {
    importTasks,
} = require("../controllers/taskImportController");

router.post(
    "/",
    authMiddleware,
    (req, res, next) => {
        uploadExcel.single("file")(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message || "Invalid upload file.",
                });
            }
            next();
        });
    },
    requireProjectRole("task:create"),
    importTasks
);

module.exports = router;
