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
      console.log('Initializing Object Storage service...');
      this.client = new Client();

      const bucketId = process.env.REPLIT_OBJECT_STORE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('Object Storage bucket ID not configured');
      }

      this.bucketUrl = `https://${bucketId}.replit.dev`;
      console.log('Object Storage service initialized with bucket URL:', this.bucketUrl);
    } catch (error) {
      console.error('Failed to initialize Object Storage:', error);
      throw error;
    }
  }

  private generateUniqueFileName(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    const timestamp = Date.now();
    const uuid = randomUUID();
    const fileName = `${timestamp}-${uuid}${ext}`;
    console.log('Generated unique filename:', fileName, 'from original:', originalName);
    return fileName;
  }

  async uploadFile(buffer: Buffer, originalFilename: string): Promise<UploadResult> {
    try {
      console.log('Starting file upload process for:', originalFilename);
      console.log('File size:', buffer.length, 'bytes');

      const objectKey = this.generateUniqueFileName(originalFilename);
      console.log('Generated object key:', objectKey);

      console.log('Uploading to Object Storage...');
      const { ok, error } = await this.client.uploadFromBytes(objectKey, buffer);
      if (!ok) {
        console.error('Upload failed:', error);
        throw new Error(`Upload failed: ${error}`);
      }
      console.log('Upload successful');

      // Verify the uploaded file
      console.log('Verifying uploaded file...');
      const { ok: verifyOk, error: verifyError } = await this.client.downloadAsBytes(objectKey);
      if (!verifyOk) {
        console.error('Verification failed:', verifyError);
        throw new Error(`Failed to verify upload: ${verifyError}`);
      }
      console.log('File verification successful');

      const fileUrl = new URL(objectKey, this.bucketUrl).toString();
      console.log('Generated file URL:', fileUrl);

      return {
        url: fileUrl,
        objectKey
      };
    } catch (error) {
      console.error('Object Storage upload error:', error);
      throw error;
    }
  }

  async verifyFile(objectKey: string): Promise<boolean> {
    console.log('Verifying file:', objectKey);
    const { ok, error } = await this.client.downloadAsBytes(objectKey);
    if (!ok) {
      console.error(`File verification failed: ${error}`);
      return false;
    }
    console.log('File verification successful:', objectKey);
    return true;
  }

  async deleteFile(objectKey: string): Promise<boolean> {
    console.log('Attempting to delete file:', objectKey);
    const { ok, error } = await this.client.delete(objectKey);
    if (!ok) {
      console.error(`File deletion failed: ${error}`);
      return false;
    }
    console.log('File deletion successful:', objectKey);
    return true;
  }
}

export const objectStorage = new ObjectStorageService();