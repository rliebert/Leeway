
import { initializePinecone } from "../server/services/rag";

async function checkPineconeConnection() {
  try {
    console.log("Testing Pinecone connection...");
    const success = await initializePinecone();
    
    if (success) {
      console.log("✅ Pinecone connection successful!");
      console.log("Index is ready and operational");
    }
  } catch (error) {
    console.error("❌ Pinecone connection failed:");
    console.error(error);
    process.exit(1);
  }
}

checkPineconeConnection().catch(console.error);
