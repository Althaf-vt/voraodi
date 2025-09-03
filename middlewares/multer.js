const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure temp folder exists
const tempPath = path.join(__dirname, '../public/uploads/temp');
if (!fs.existsSync(tempPath)) {
  fs.mkdirSync(tempPath, { recursive: true });
}

// Define storage (upload to temp first)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempPath);  // save in temp folder
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const isValidExt = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const isValidMime = allowedTypes.test(file.mimetype);
  if (isValidExt && isValidMime) {
    cb(null, true);
  } else {
    cb(new Error("Only images are allowed"));
  }
};

// Export configured multer
const upload = multer({ storage: storage, fileFilter: fileFilter });
module.exports = upload;
