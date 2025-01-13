import { randomUUID } from "crypto";
import path from "path";
import { ObjectStorage } from '@replit/object-storage';

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private storage: ObjectStorage;
  private bucketId: string;

  constructor() {
    const bucketId = process.env.defaultBucketID;
    if (!bucketId) {
      throw new Error('Object Storage configuration error: Missing defaultBucketID environment variable');
    }
    this.bucketId = bucketId;
    this.storage = new ObjectStorage();
  }

  private generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const uuid = randomUUID();
    return `${timestamp}-${uuid}${ext}`;
  }

  async uploadFile(buffer: Buffer, originalFilename: string): Promise<UploadResult> {
    try {
      const objectKey = this.generateUniqueFileName(originalFilename);

      await this.storage.put(
        objectKey,
        buffer,
        {
          'Content-Type': this.getContentType(originalFilename)
        }
      );

      const resultUrl = this.getPublicUrl(objectKey);
      console.log(`File uploaded successfully: ${resultUrl}`);

      return {
        url: resultUrl,
        objectKey
      };
    } catch (error) {
      console.error('Object Storage upload error:', error);
      throw error;
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.zip': 'application/zip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async uploadMultipleFiles(files: { buffer: Buffer; originalname: string }[]): Promise<UploadResult[]> {
    return Promise.all(files.map(file => this.uploadFile(file.buffer, file.originalname)));
  }

  getPublicUrl(objectKey: string): string {
    return this.storage.getPublicUrl(objectKey);
  }
}

export const objectStorage = new ObjectStorageService();