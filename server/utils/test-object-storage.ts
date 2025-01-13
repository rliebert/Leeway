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
    const { ok, value: downloadedData, error } = await objectStorage.client.downloadAsBytes(result.objectKey);
    if (!ok) {
      throw new Error(`Failed to download test file: ${error}`);
    }

    console.log('Successfully verified file download');
    console.log('Downloaded content:', downloadedData.toString());

    // Test URL generation
    const fileUrl = await objectStorage.getFileUrl(result.objectKey);
    console.log('Generated URL:', fileUrl);

    console.log('All tests passed successfully!');
  } catch (error) {
    console.error('Object Storage test failed:', error);
    throw error;
  } finally {
    // Cleanup: Delete test file if it was uploaded
    if (uploadedObjectKey) {
      try {
        const { ok, error } = await objectStorage.client.delete(uploadedObjectKey);
        if (!ok) {
          console.error('Failed to cleanup test file:', error);
        } else {
          console.log('Test file cleaned up successfully');
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
    }
  }
}

// Run the test
testObjectStorage().catch(console.error);