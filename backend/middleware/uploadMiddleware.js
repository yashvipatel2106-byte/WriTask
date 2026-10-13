const path = require("path");
const os = require("os");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

// The deployed bundle (/var/task on Vercel) is read-only — only os.tmpdir()
// (/tmp) is writable there. Note /tmp is ephemeral and not shared across
// instances, so uploaded attachments won't durably persist on Vercel; this
// only keeps the app from crashing on every cold start (it used to try to
// mkdir into the read-only bundle at import time) until attachments move to
// real blob storage (S3/Cloudinary/etc).
const uploadsRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "tasks")
  : path.resolve(__dirname, "../uploads/tasks");

try {
  if (!fs.existsSync(uploadsRoot)) {
    fs.mkdirSync(uploadsRoot, { recursive: true });
  }
} catch (error) {
  console.error("Could not create uploads directory:", error.message);
}

function resolveTaskId(req) {
  if (req.task?._id) return req.task._id.toString();
  if (req.params?.taskId) return String(req.params.taskId);
  return null;
}

function taskUploadDir(taskId) {
  return path.join(uploadsRoot, String(taskId));
}

function absoluteAttachmentPath(taskId, filename) {
  return path.join(taskUploadDir(taskId), filename);
}

/**
 * Find a file on disk for an attachment record.
 * Prefers exact filename; falls back to unique prefix or original name match.
 */
function resolveAttachmentFile(taskId, attachment) {
  const dir = taskUploadDir(taskId);
  const filename = attachment?.filename;

  if (filename) {
    const exact = path.join(dir, filename);
    if (fs.existsSync(exact)) {
      return exact;
    }
  }

  if (!fs.existsSync(dir)) {
    return null;
  }

  const files = fs.readdirSync(dir);
  if (!files.length) return null;

  // Multer names: "{16 hex chars}-{safeOriginal}"
  if (filename && /^[a-f0-9]{16}-/i.test(filename)) {
    const prefix = filename.slice(0, 16);
    const byPrefix = files.find((f) => f.startsWith(prefix));
    if (byPrefix) return path.join(dir, byPrefix);
  }

  const original = attachment?.originalName;
  if (original) {
    const safe = original.replace(/[^a-zA-Z0-9._-]/g, "_");
    const byOriginal = files.find(
      (f) => f === original || f.endsWith(`-${safe}`) || f.includes(safe)
    );
    if (byOriginal) return path.join(dir, byOriginal);
  }

  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const taskId = resolveTaskId(req);
    if (!taskId) {
      return cb(new Error("Task ID missing for upload"));
    }
    const taskDir = taskUploadDir(taskId);
    try {
      if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { recursive: true });
      }
    } catch (error) {
      return cb(error);
    }
    cb(null, taskDir);
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
    cb(null, true);
  },
});

module.exports = {
  upload,
  uploadsRoot,
  resolveTaskId,
  taskUploadDir,
  absoluteAttachmentPath,
  resolveAttachmentFile,
};
