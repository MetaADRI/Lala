const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authMiddleware } = require('../middleware/auth');

// Configured from the CLOUDINARY_URL environment variable (never hardcoded,
// never exposed to the browser). secure: true returns https:// URLs.
cloudinary.config({ secure: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
  }
});

router.post('/', authMiddleware, upload.array('photos', 10), async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const urls = [];
    for (const file of req.files) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'lala/properties',
            resource_type: 'image',
            transformation: [{ width: 1600, crop: 'limit' }]
          },
          (err, res) => (err ? reject(err) : resolve(res))
        );
        stream.end(file.buffer);
      });
      urls.push(result.secure_url);
    }
    res.json({ message: 'Upload successful', urls });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
