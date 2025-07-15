// avatarMulter.js
const multer = require('multer');
const path   = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, 'public/uploads/profile-images/'),   // <‑‑ new folder
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.session.user}-${Date.now()}${ext}`;  // user‑scoped
    cb(null, filename);
  }
});

const allowed = /jpeg|jpg|png|webp/;
const fileFilter = (req, file, cb) => {
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
             allowed.test(file.mimetype);
  cb(ok ? null : new Error('Only images are allowed'), ok);
};

module.exports = multer({ storage, fileFilter });
