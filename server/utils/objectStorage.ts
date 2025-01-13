import { randomUUID } from "crypto";
import path from "path";
import { Client } from '@replit/object-storage';

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private storage: Client;
  private bucketId: string;

  constructor() {
    try {
      this.storage = new Client();

      // Hard-code the bucket ID from .replit file for testing
      const bucketId = "replit-objstore-b3c162de-10d0-4ad8-ae54-c8dd3886f1b9";
      if (!bucketId) {
        throw new Error('Object Storage configuration error: Missing bucket ID. Please make sure Object Storage is enabled in your Repl.');
      }

      this.bucketId = bucketId;
      console.log('Object Storage initialized with bucket ID:', this.bucketId);
    } catch (error) {
      console.error('Failed to initialize Object Storage:', error);
      throw error;
    }
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
      console.log('Attempting to upload file:', objectKey);

      await this.storage.createObject(
        objectKey,
        buffer
      );

      const publicUrl = this.storage.getPublicUrl(objectKey);
      console.log(`File uploaded successfully: ${publicUrl}`);

      return {
        url: publicUrl,
        objectKey
      };
    } catch (error) {
      console.error('Object Storage upload error:', error);
      throw error;
    }
  }

  async uploadMultipleFiles(files: { buffer: Buffer; originalname: string }[]): Promise<UploadResult[]> {
    console.log(`Attempting to upload ${files.length} files`);
    return Promise.all(files.map(file => this.uploadFile(file.buffer, file.originalname)));
  }

  getPublicUrl(objectKey: string): string {
    return this.storage.getPublicUrl(objectKey);
  }
}

export const objectStorage = new ObjectStorageService();