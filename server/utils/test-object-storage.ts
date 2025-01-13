import { objectStorage } from './objectStorage';

async function testObjectStorage() {
  let uploadedObjectKey: string | undefined;

  try {
    console.log('Testing Object Storage connection...');

    // Create a small test buffer
    const testBuffer = Buffer.from('Hello, Object Storage!');
    const testFileName = 'test.txt';

    // Test file upload
    console.log('Attempting to upload test file...');
    const result = await objectStorage.uploadFile(testBuffer, testFileName);
    uploadedObjectKey = result.objectKey;

    console.log('Upload successful!');
    console.log('File URL:', result.url);
    console.log('Object Key:', result.objectKey);

    // Verify file download
    const { ok, value: downloadedData, error } = await objectStorage.client.downloadAsBytes(uploadedObjectKey);
    if (!ok) {
      throw new Error(`Failed to download test file: ${error}`);
    }

    console.log('Successfully verified file download');
    console.log('Downloaded content:', downloadedData.toString());

    // Clean up test object
    const { ok: deleteOk, error: deleteError } = await objectStorage.client.delete(uploadedObjectKey);
    if (!deleteOk) {
      throw new Error(`Failed to delete test file: ${deleteError}`);
    }
    console.log('Test file cleaned up successfully');

  } catch (error) {
    console.error('Object Storage test failed:', error);
    throw error;
  }
}

// Run the test
testObjectStorage().catch(console.error);