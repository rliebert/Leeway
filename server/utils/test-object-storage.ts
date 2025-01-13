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

    // Test file verification
    const isVerified = await objectStorage.verifyFile(result.objectKey);
    console.log('File verification:', isVerified ? 'Successful' : 'Failed');

    if (!isVerified) {
      throw new Error('Failed to verify uploaded file');
    }

  } catch (error) {
    console.error('Object Storage test failed:', error);
    throw error;
  } finally {
    // Clean up test file
    if (uploadedObjectKey) {
      try {
        await objectStorage.deleteFile(uploadedObjectKey);
        console.log('Test file cleaned up successfully');
      } catch (error) {
        console.error('Failed to clean up test file:', error);
      }
    }
  }
}

// Run the test
testObjectStorage()
  .then(() => console.log('Test completed successfully'))
  .catch(console.error);