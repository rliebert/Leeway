import { type Express } from "express";
import multer from "multer";
import path from "path";
import express from "express";
import { db } from "@db";
import { file_attachments } from "@db/schema";

// Configure multer for file uploads
const storage = multer.memoryStorage();

const uploadToObjectStorage = async (buffer: Buffer, filename: string) => {
  try {
    const bucket = process.env.REPLIT_BUCKET_ID;
    if (!bucket) {
      console.error('Object Storage configuration error: Missing bucket ID');
      throw new Error('Object Storage bucket not configured');
    }

    // Generate a unique filename to prevent collisions
    const objectKey = `uploads/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(filename)}`;

    console.log(`Attempting to upload file to Object Storage: ${objectKey}`);

    const response = await fetch(`https://objectstorage.replit.com/v2/entries/${bucket}/${objectKey}`, {
      method: 'POST',
      body: buffer,
      headers: { 
        'Content-Type': 'application/octet-stream',
        'X-Replit-Bucket-ID': bucket
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', response.status, errorText);
      throw new Error(`Object Storage upload failed: ${response.status} - ${errorText}`);
    }

    const fileUrl = `https://objectstorage.replit.com/v2/entries/${bucket}/${objectKey}`;
    console.log(`File uploaded successfully: ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    console.error('Object Storage upload error:', error);
    throw error;
  }
};

// File size and type validation
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Documents
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    // Media
    'audio/mpeg', 'video/mp4',
    'application/zip', 'application/x-zip-compressed'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    console.log(`File type accepted: ${file.mimetype}`);
    cb(null, true);
  } else {
    console.log(`File type rejected: ${file.mimetype}`);
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files per upload
  },
  fileFilter
});

export function registerUploadRoutes(app: Express) {
  app.post('/api/upload', 
    (req, res, next) => {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      next();
    },
    (req, res, next) => {
      upload.array('files', 5)(req, res, (err) => {
        if (err) {
          console.error('Upload middleware error:', err);
          return res.status(400).json({ 
            error: 'File upload failed',
            details: err instanceof Error ? err.message : 'Unknown error'
          });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`Processing ${files.length} files for upload`);

        const fileUrls = await Promise.all(files.map(async file => {
          console.log(`Uploading file: ${file.originalname} (${file.size} bytes)`);
          const objectUrl = await uploadToObjectStorage(file.buffer, file.originalname);
          return objectUrl;
        }));

        // Return file info
        const fileInfo = fileUrls.map((url, index) => ({
          url: url,
          originalName: files[index].originalname,
          mimetype: files[index].mimetype,
          size: files[index].size,
        }));

        console.log('Upload completed successfully:', fileInfo);
        res.json(fileInfo);
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
          error: 'Upload failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}