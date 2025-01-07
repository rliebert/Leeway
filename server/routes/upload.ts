import { type Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { db } from "@db";
import { messages } from "@db/schema";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Upload: Processing file in destination:', file.originalname);
    const uploadDir = path.join(process.cwd(), 'uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      console.log('Upload: Creating upload directory:', uploadDir);
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('Upload: Generated filename:', filename, 'for file:', file.originalname);
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('Upload: Filtering file:', file.originalname, 'type:', file.mimetype);
    // Allow only specific file types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'audio/mpeg',
      'video/mp4'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log('Upload: Rejected file type:', file.mimetype);
      cb(new Error('Invalid file type'));
    }
  }
});

export function registerUploadRoutes(app: Express) {
  console.log('Upload: Registering upload routes');
  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Handle file uploads for channels
  app.post('/api/channels/:channelId/upload', 
    (req, res, next) => {
      console.log('Upload: Received upload request for channel:', req.params.channelId);
      if (!req.isAuthenticated()) {
        console.log('Upload: Unauthorized upload attempt');
        return res.status(401).send('Not authenticated');
      }
      next();
    },
    upload.array('files', 10),
    async (req, res) => {
      try {
        console.log('Upload: Processing uploaded files');
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
          console.log('Upload: No files received');
          return res.status(400).send('No files uploaded');
        }

        console.log('Upload: Successfully received files:', files.map(f => f.originalname));

        // Process uploaded files
        const attachments = files.map(file => ({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/${file.filename}`
        }));

        console.log('Upload: Processed attachments:', attachments);
        res.json(attachments);
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Upload failed');
      }
    }
  );
}