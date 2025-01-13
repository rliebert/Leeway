import { type Express } from "express";
import multer from "multer";
import { objectStorage } from "../utils/objectStorage";
import { db } from "@db";
import { file_attachments } from "@db/schema";

// Configure multer for file uploads
const storage = multer.memoryStorage();

// File size and type validation
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  console.log('Validating file:', file.originalname, 'type:', file.mimetype);

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
    console.error(`File type rejected: ${file.mimetype}`);
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
        console.error('Upload attempt without authentication');
        return res.status(401).json({ error: 'Authentication required' });
      }
      console.log('User authenticated, proceeding with upload');
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
          console.error('No files in upload request');
          return res.status(400).json({ error: 'No files uploaded' });
        }

        console.log(`Processing ${files.length} files for upload...`);
        console.log('Files received:', files.map(f => ({ name: f.originalname, size: f.size, type: f.mimetype })));

        // Upload files to object storage and create standardized response
        const fileAttachments = await Promise.all(
          files.map(async (file) => {
            console.log(`Starting upload process for ${file.originalname} (${file.size} bytes)`);

            // Upload to object storage
            const uploadResult = await objectStorage.uploadFile(file.buffer, file.originalname);

            console.log('Upload success for file:', {
              originalName: file.originalname,
              size: file.size,
              mimeType: file.mimetype,
              uploadedUrl: uploadResult.url,
              objectKey: uploadResult.objectKey
            });

            // Return standardized file information
            return {
              url: uploadResult.url,
              objectKey: uploadResult.objectKey,
              name: file.originalname,
              type: file.mimetype,
              size: file.size
            };
          })
        );

        // If message_id is provided, create attachment records
        const messageId = req.body.message_id;
        if (messageId) {
          console.log('Creating database records for attachments with message_id:', messageId);

          await db.insert(file_attachments)
            .values(fileAttachments.map(file => ({
              message_id: messageId,
              file_url: file.url,
              file_name: file.name,
              file_type: file.type,
              file_size: file.size
            })))
            .returning();
        }

        // Return the file information to the client
        console.log('Sending successful response with file attachments:', fileAttachments);
        res.json(fileAttachments);

      } catch (error) {
        console.error('Upload process error:', error);
        res.status(500).json({
          error: 'Upload failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );
}