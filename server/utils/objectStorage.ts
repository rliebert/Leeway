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

      // Get the bucket ID from .replit config or environment variable
      const bucketId = process.env.REPLIT_OBJECT_STORE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('Object Storage bucket ID not configured');
      }

      // Construct the bucket URL using the provided format
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

  private validateUploadResult(result: UploadResult): void {
    if (!result.url || !result.objectKey) {
      throw new Error('Invalid upload result: missing URL or objectKey');
    }
    // Validate URL format
    try {
      new URL(result.url);
    } catch {
      throw new Error(`Invalid URL format: ${result.url}`);
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

      // Download the file to verify upload
      const { ok: verifyOk, error: verifyError } = await this.client.downloadAsBytes(objectKey);
      if (!verifyOk) {
        throw new Error(`Failed to verify upload: ${verifyError}`);
      }

      console.log(`File uploaded and verified successfully: ${objectKey}`);

      // Construct the URL with proper encoding
      const fileUrl = `${this.bucketUrl}/${encodeURIComponent(objectKey)}`;
      console.log('Generated file URL:', fileUrl);

      const result = { url: fileUrl, objectKey };
      this.validateUploadResult(result);

      return result;
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