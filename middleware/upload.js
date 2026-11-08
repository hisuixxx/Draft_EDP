import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDirectory = path.join(__dirname, "..", "public", "uploads", "menu");

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, extension).replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "menu-item";
    callback(null, `${safeName}-${Date.now()}${extension}`);
  }
});

const imageFileFilter = (_req, file, callback) => {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
    callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "image"));
    return;
  }
  callback(null, true);
};

export const menuImageUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});
