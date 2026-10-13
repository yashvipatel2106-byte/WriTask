const path = require("path");
const os = require("os");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

// See uploadMiddleware.js (Task attachments) for why /tmp is used on
// Vercel — same read-only-bundle constraint applies here.
const uploadsRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "request-forms")
  : path.resolve(__dirname, "../uploads/request-forms");

try {
  if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
  }
} catch (error) {
  console.error(
    "Could not create request-form uploads directory:",
    error.message
  );
}

/*
 * Images are uploaded to a form-scoped directory while the requester
 * is still filling out the form (a submission doesn't exist yet) —
 * the returned filename is stored as the answer's value and never
 * needs to move on submit.
 */
function resolveFormId(req) {
  return req.params?.formId ? String(req.params.formId) : null;
}

function formUploadDir(formId) {
  return path.join(uploadsRoot, String(formId));
}

function resolveAnswerImageFile(formId, filename) {
  if (!filename) return null;
  const full = path.join(formUploadDir(formId), filename);
  return fs.existsSync(full) ? full : null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const formId = resolveFormId(req);
    if (!formId) {
      return cb(new Error("Form ID missing for upload"));
    }
    const dir = formUploadDir(formId);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      return cb(error);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(8).toString("hex");
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${unique}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
});

module.exports = {
  upload,
  uploadsRoot,
  resolveFormId,
  formUploadDir,
  resolveAnswerImageFile,
};
