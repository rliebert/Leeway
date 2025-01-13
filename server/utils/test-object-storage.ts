import { objectStorage } from './objectStorage';

async function testObjectStorage() {
  try {
    console.log('Testing Object Storage connection...');
    
    // Create a small test buffer
    const testBuffer = Buffer.from('Hello, Object Storage!');
    const testFileName = 'test.txt';

    // Attempt to upload
    console.log('Attempting to upload test file...');
    const result = await objectStorage.uploadFile(testBuffer, testFileName);
    
    console.log('Upload successful!');
    console.log('File URL:', result.url);
    console.log('Object Key:', result.objectKey);
    
  } catch (error) {
    console.error('Object Storage test failed:', error);
    throw error;
  }
}

// Run the test
testObjectStorage().catch(console.error);
