import { randomUUID } from "crypto";
import path from "path";

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private bucketId: string;
  private baseUploadUrl: string;
  private baseAccessUrl: string;

  constructor() {
    const bucketId = process.env.REPLIT_BUCKET_ID;
    if (!bucketId) {
      throw new Error('Object Storage configuration error: Missing bucket ID');
    }
    this.bucketId = bucketId;
    this.baseUploadUrl = `https://cdn.replit.com/_next/static/storage/entries/${this.bucketId}`;
    this.baseAccessUrl = `https://objectstorage.replit.com/v2/entries/${this.bucketId}`;
  }

  private generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const uuid = randomUUID();
    return `uploads/${timestamp}-${uuid}${ext}`;
  }

  async uploadFile(buffer: Buffer, originalFilename: string): Promise<UploadResult> {
    try {
      const objectKey = this.generateUniqueFileName(originalFilename);
      const uploadUrl = `${this.baseUploadUrl}/${objectKey}`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: buffer,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Replit-Bucket': this.bucketId,
          'Cache-Control': 'max-age=3600'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      return {
        url: `${this.baseAccessUrl}/${objectKey}`,
        objectKey
      };
    } catch (error) {
      console.error('Object Storage upload error:', error);
      throw error;
    }
  }

  async uploadMultipleFiles(files: { buffer: Buffer; originalname: string }[]): Promise<UploadResult[]> {
    return Promise.all(files.map(file => this.uploadFile(file.buffer, file.originalname)));
  }

  getPublicUrl(objectKey: string): string {
    return `${this.baseAccessUrl}/${objectKey}`;
  }
}

export const objectStorage = new ObjectStorageService();
