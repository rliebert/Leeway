import { randomUUID } from "crypto";
import path from "path";
import { Client } from '@replit/object-storage';

interface UploadResult {
  url: string;
  objectKey: string;
}

export class ObjectStorageService {
  private client: Client;

  constructor() {
    try {
      // Initialize the client
      this.client = new Client();
      console.log('Object Storage service initialized');
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

      // Download the file to verify upload
      const { ok: verifyOk, error: verifyError } = await this.client.downloadAsBytes(objectKey);
      if (!verifyOk) {
        throw new Error(`Failed to verify upload: ${verifyError}`);
      }

      // Get a direct URL for the file
      const { ok: urlOk, value: url, error: urlError } = await this.client.createPresignedUrl(objectKey, {
        expires: 365 * 24 * 60 * 60 // 1 year expiry
      });

      if (!urlOk || !url) {
        throw new Error(`Failed to generate URL: ${urlError}`);
      }

      console.log(`File uploaded and verified successfully: ${objectKey}`);

      return {
        url,
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

  async getFileUrl(objectKey: string): Promise<string> {
    const { ok, value: url, error } = await this.client.createPresignedUrl(objectKey, {
      expires: 365 * 24 * 60 * 60 // 1 year expiry
    });

    if (!ok || !url) {
      throw new Error(`Failed to generate URL: ${error}`);
    }

    return url;
  }
}

export const objectStorage = new ObjectStorageService();