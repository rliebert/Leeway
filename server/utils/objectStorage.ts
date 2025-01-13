import { randomUUID } from "crypto";
import path from "path";
import { Client } from '@replit/object-storage';

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private client: Client;
  private readonly bucketId: string;

  constructor() {
    try {
      // Initialize the client
      this.client = new Client();

      // Get the bucket ID from environment variable
      const bucketId = process.env.REPLIT_OBJECT_STORE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('Object Storage bucket ID not configured');
      }

      this.bucketId = bucketId;
      console.log('Object Storage service initialized with bucket ID:', this.bucketId);
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

      // Upload the file using uploadFromBytes
      const { ok, error } = await this.client.uploadFromBytes(objectKey, buffer);
      if (!ok) {
        throw new Error(`Upload failed: ${error}`);
      }

      // Always construct the URL with HTTPS and ensure it's a fully qualified URL
      const fileUrl = `https://${this.bucketId}.replit.dev/${objectKey}`;
      console.log('Generated absolute file URL:', fileUrl);

      return {
        url: fileUrl,
        objectKey,
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

  async verifyFile(objectKey: string): Promise<boolean> {
    const { ok } = await this.client.downloadAsBytes(objectKey);
    return ok;
  }

  async deleteFile(objectKey: string): Promise<boolean> {
    const { ok } = await this.client.delete(objectKey);
    return ok;
  }
}

export const objectStorage = new ObjectStorageService();