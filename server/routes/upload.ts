import { type Express } from "express";
import multer from "multer";
import { objectStorage } from "../utils/objectStorage";
import { db } from "@db";
import { file_attachments } from "@db/schema";

// Configure multer for file uploads
const storage = multer.memoryStorage();

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
    // Archives
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

        // Map original file info before upload
        const fileInfo = files.map(file => ({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer
        }));

        // Upload files to object storage
        const uploadedFiles = await objectStorage.uploadMultipleFiles(
          fileInfo.map(file => ({
            buffer: file.buffer,
            originalname: file.originalname
          }))
        );

        // Combine uploaded files with original file info and validate URLs
        const combinedFiles = uploadedFiles.map((uploaded, index) => {
          if (!uploaded.url || !uploaded.objectKey) {
            throw new Error(`Invalid upload result for file ${fileInfo[index].originalname}`);
          }

          // Verify URL format
          try {
            new URL(uploaded.url);
          } catch {
            throw new Error(`Invalid URL format: ${uploaded.url}`);
          }

          return {
            url: uploaded.url,
            objectKey: uploaded.objectKey,
            mimetype: fileInfo[index].mimetype,
            size: fileInfo[index].size,
            originalName: fileInfo[index].originalname
          };
        });

        // Store file attachments in database if message_id is provided
        if (req.body.message_id) {
          const attachments = await db.insert(file_attachments).values(
            combinedFiles.map(file => ({
              message_id: req.body.message_id,
              file_url: file.url,
              file_name: file.originalName,
              file_type: file.mimetype,
              file_size: file.size
            }))
          ).returning();

          console.log('Created attachment records:', attachments);
        }

        console.log('Upload completed successfully:', combinedFiles);
        res.json(combinedFiles);
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