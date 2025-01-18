
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { INDEX_NAME } from "../ai/rag/constants";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testEmbeddings() {
  console.log("Initializing test...");
  
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.Index(INDEX_NAME);
  
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-3-small",
  });

  // Test query about music (since we know Rob has many music-related notes)
  const testQuery = "What are your thoughts on music theory?";
  console.log("Testing query:", testQuery);

  const queryEmbedding = await embeddings.embedQuery(testQuery);
  
  const results = await index.query({
    vector: queryEmbedding,
    topK: 3,
    includeMetadata: true,
  });

  console.log("\nFound matches:");
  results.matches.forEach((match, i) => {
    console.log(`\n${i + 1}. Score: ${match.score?.toFixed(3)}`);
    console.log(`Content preview: ${match.metadata?.content?.substring(0, 200)}...`);
  });
}

testEmbeddings().catch(console.error);
