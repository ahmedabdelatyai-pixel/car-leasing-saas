import multer from 'multer';
import path from 'path';

// Use memory storage to be compatible with serverless functions on Vercel
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit to support videos/images
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf|mp4|mov|avi/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Error: Only images (JPG, PNG, GIF), PDFs, and videos (MP4, MOV) are allowed!'));
    }
  }
});

export default upload;
