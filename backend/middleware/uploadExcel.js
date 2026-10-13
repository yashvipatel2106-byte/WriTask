const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = process.env.VERCEL
    ? path.join(require("os").tmpdir(), "temp", "imports")
    : path.join(__dirname, "../temp/imports");

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (error) {
    console.error("Could not create imports temp directory:", error.message);
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },

    filename(req, file, cb) {
        cb(
            null,
            `${Date.now()}-${file.originalname}`
        );
    },
});

const fileFilter = (req, file, cb) => {

    const allowed = [".xlsx", ".xls", ".csv"];

    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
        return cb(new Error("Only Excel files are allowed."));
    }

    cb(null, true);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
});
