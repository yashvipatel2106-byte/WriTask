const multer = require("multer");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

const orgLogosRoot = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "orgs")
  : path.resolve(__dirname, "../uploads/orgs");

try {
  if (!fs.existsSync(orgLogosRoot)) {
    fs.mkdirSync(orgLogosRoot, { recursive: true });
  }
} catch (error) {
  console.error("Could not create org logos directory:", error.message);
}

function orgLogoDir(orgId) {
  return path.join(orgLogosRoot, String(orgId));
}

function orgLogoPath(orgId, filename) {
  return path.join(orgLogoDir(orgId), filename);
}

function deleteOrgLogoFiles(orgId) {
  const dir = orgLogoDir(orgId);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    fs.unlinkSync(path.join(dir, file));
  }
}

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]);
const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/svg",
]);

function fileExt(file) {
  return path.extname(file.originalname || "").toLowerCase();
}

function isAllowedLogo(file) {
  const ext = fileExt(file);
  if (ALLOWED_EXT.has(ext)) return true;
  return ALLOWED_MIME.has((file.mimetype || "").toLowerCase());
}

function mimeFromUpload(file) {
  const ext = fileExt(file);
  const mime = (file.mimetype || "").toLowerCase();
  if (ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") {
    return mime === "image/jpg" || mime === "image/svg" ? MIME_BY_EXT[ext] || mime : mime;
  }
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const orgId = req.params?.orgId;
    if (!orgId) return cb(new Error("Organization ID missing for logo upload"));
    const dir = orgLogoDir(orgId);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      return cb(error);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(8).toString("hex");
    const ext = ALLOWED_EXT.has(fileExt(file)) ? fileExt(file) : ".png";
    cb(null, `${unique}${ext}`);
  },
});

const uploadOrgLogo = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!isAllowedLogo(file)) {
      return cb(new Error("Logo must be a PNG, JPG, JPEG, or SVG image."));
    }
    cb(null, true);
  },
});

module.exports = {
  uploadOrgLogo,
  orgLogosRoot,
  orgLogoDir,
  orgLogoPath,
  deleteOrgLogoFiles,
  mimeFromUpload,
};
