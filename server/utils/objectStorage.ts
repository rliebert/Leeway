import { randomUUID } from "crypto";
import path from "path";
import { Client } from '@replit/object-storage';

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private client: Client;
  private readonly bucketUrl: string;

  constructor() {
    try {
      // Initialize the client
      this.client = new Client();

      // Get the bucket ID from environment variable
      const bucketId = process.env.REPLIT_OBJECT_STORE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('Object Storage bucket ID not configured');
      }

      // Use the replit.dev domain format for the bucket URL
      this.bucketUrl = `https://${bucketId}.replit.dev`;
      console.log('Object Storage service initialized with bucket URL:', this.bucketUrl);
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

  private validateUrl(url: string): void {
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL format: ${url}`);
    }
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

      // Verify the upload by attempting to download
      const { ok: verifyOk, error: verifyError } = await this.client.downloadAsBytes(objectKey);
      if (!verifyOk) {
        throw new Error(`Failed to verify upload: ${verifyError}`);
      }

      // Construct and validate the URL
      const fileUrl = new URL(objectKey, this.bucketUrl).toString();
      console.log('Generated file URL:', fileUrl);

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
    const { ok, error } = await this.client.downloadAsBytes(objectKey);
    if (!ok) {
      console.error(`File verification failed: ${error}`);
      return false;
    }
    return true;
  }

  async deleteFile(objectKey: string): Promise<boolean> {
    const { ok, error } = await this.client.delete(objectKey);
    if (!ok) {
      console.error(`File deletion failed: ${error}`);
      return false;
    }
    return true;
  }
}

export const objectStorage = new ObjectStorageService();