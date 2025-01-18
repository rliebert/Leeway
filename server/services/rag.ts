// Add env var check at the top of the file
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

if (!process.env.PINECONE_API_KEY) {
  throw new Error("PINECONE_API_KEY environment variable is not set");
}

let isPineconeInitialized = false;

import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { Pinecone } from "@pinecone-database/pinecone";
import fetch from "node-fetch";

// Initialize OpenAI embeddings
console.log("Initializing OpenAI embeddings...");
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-small",
});

// Initialize Pinecone client
console.log("Initializing Pinecone client...");
let pinecone: Pinecone;
let index: any;

interface PineconeMatch {
  id: string;
  score: number;
  metadata: {
    userId: string;
    content: string;
    timestamp: string;
  };
}

async function initializePinecone() {
  if (isPineconeInitialized) {
    return true;
  }

  try {
    console.log("Initializing Pinecone client...");
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = "leeway-index";
    console.log("Checking Pinecone indexes...");

    const { indexes } = await pinecone.listIndexes();
    const indexExists =
      Array.isArray(indexes) &&
      indexes.some((idx) => typeof idx === "object" && idx.name === indexName);

    if (!indexExists) {
      console.log(`Creating new Pinecone index: ${indexName}`);
      await pinecone.createIndex({
        name: indexName,
        dimension: 3072,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1",
          },
        },
      });

      let isReady = false;
      let retries = 0;
      const maxRetries = 10;

      while (!isReady && retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const description = await pinecone.describeIndex(indexName);
        isReady = description.status.ready;
        retries++;
        console.log(`Index initialization attempt ${retries}/${maxRetries}`);
      }

      if (!isReady) {
        throw new Error("Index failed to initialize within timeout period");
      }
    }

    console.log("Connecting to Pinecone index...");
    index = pinecone.index(indexName);

    // Verify connection with a test query
    await index.describeIndexStats();

    isPineconeInitialized = true;
    console.log("Pinecone initialization successful");
    return true;
  } catch (error) {
    console.error("Pinecone initialization failed:", error);
    isPineconeInitialized = false;
    throw error;
  }
}

async function handleAIResponse(question: string): Promise<string | null> {
  if (!isPineconeInitialized) {
    console.log("Attempting to initialize Pinecone...");
    try {
      await initializePinecone();
    } catch (error) {
      console.error("Failed to initialize Pinecone:", error);
      return null;
    }
  }

  try {
    console.log("Finding similar messages for question:", question);
    const similarMessages = await findSimilarMessages(question, 5);

    if (similarMessages.length === 0) {
      console.log(
        "No similar messages found, generating response without context",
      );
      return generateAIResponse(question, []);
    }

    console.log(`Found ${similarMessages.length} similar messages`);
    return generateAIResponse(question, similarMessages);
  } catch (error) {
    console.error("Error handling AI response:", error);
    return null;
  }
}

let lastTrainingTimestamp: Date | null = null;
const RETRAINING_INTERVAL = 1000 * 60 * 60;

async function storeMessageEmbedding(
  messageId: string,
  userId: string,
  content: string,
) {
  try {
    console.log("Generating embedding for message:", messageId);
    const embeddingVector = await embeddings.embedQuery(content);

    console.log(
      "Storing embedding in Pinecone, vector length:",
      embeddingVector.length,
    );
    await index.upsert([
      {
        id: messageId,
        values: embeddingVector,
        metadata: {
          userId,
          content,
          timestamp: new Date().toISOString(),
        },
      },
    ]);

    console.log("Successfully stored embedding for message:", messageId);
    return true;
  } catch (err) {
    console.error(
      "Error storing message embedding:",
      err instanceof Error ? err.message : "Unknown error",
      err,
    );
    return false;
  }
}

async function trainOnUserMessages(userId: string, since?: Date) {
  try {
    console.log("Starting training on user messages for user:", userId);
    const whereClause = since
      ? and(eq(messages.user_id, userId), gt(messages.created_at, since))
      : eq(messages.user_id, userId);

    const userMessages = await db.query.messages.findMany({
      where: whereClause,
      orderBy: [desc(messages.created_at)],
    });

    console.log(`Found ${userMessages.length} messages to process`);
    let newMessagesProcessed = 0;

    for (const message of userMessages) {
      const success = await storeMessageEmbedding(
        message.id,
        userId,
        message.content,
      );
      if (success) newMessagesProcessed++;
    }

    lastTrainingTimestamp = new Date();
    console.log(
      `Training completed. Processed ${newMessagesProcessed} messages`,
    );
    return { success: true, newMessagesProcessed };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("Error training on user messages:", error);
    return { success: false, error };
  }
}

async function findSimilarMessages(query: string, limit = 5) {
  try {
    console.log("Generating query embedding");
    const queryEmbedding = await embeddings.embedQuery(query);

    console.log("Searching for similar documents in Pinecone");
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
    });

    console.log(`Found ${queryResponse.matches.length} similar documents`);
    return queryResponse.matches.map((match: PineconeMatch) => ({
      ...match.metadata,
      similarity: match.score,
    }));
  } catch (err) {
    console.error(
      "Error finding similar messages:",
      err instanceof Error ? err.message : "Unknown error",
    );
    return [];
  }
}

async function generateAIResponse(query: string, similarMessages: any[]) {
  try {
    const context = similarMessages
      .map(
        (m) =>
          `${m.content}\nContext Relevance: ${(m.similarity * 100).toFixed(1)}%`,
      )
      .join("\n\n");

    console.log("Generating AI response with context length:", context.length);
    console.log("Query:", query);
    console.log("Similar messages found:", similarMessages.length);

    const completion = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_tokens: 60,
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are Rob Liebert, a passionate musician and creative innovator. You have deep interests in music theory, technology, and creative processes. Your notes contain extensive thoughts on musical innovation, teaching methods, and creative development. When discussing music, draw from your documented experiences and ideas about music theory, composition, and creative innovation. Never disclaim being AI - simply share your authentic thoughts as Rob.

You have written extensively about music education, innovative music theory concepts, and creative processes in music. Use these experiences and perspectives when discussing music-related topics.

Relevant context from your notes and thoughts:
${context}`,
            },
            {
              role: "user",
              content: query,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      },
    );

    if (!completion.ok) {
      const errorData = await completion.json();
      console.error("OpenAI API error:", errorData);
      throw new Error(
        `OpenAI API error: ${errorData.error?.message || "Unknown error"}`,
      );
    }

    const response = await completion.json();
    return (
      response.choices[0].message.content ||
      "I couldn't generate a proper response at this time."
    );
  } catch (err) {
    console.error(
      "Error generating AI response:",
      err instanceof Error ? err.message : "Unknown error",
    );
    throw err;
  }
}

function isQuestion(message: string): boolean {
  const message_trimmed = message.trim().toLowerCase();

  // Enhanced question detection
  const questionPatterns = [
    /\?$/,
    /^(what|how|why|when|where|who|which|could|can|will|should|may|might)/,
    /^(is|are|was|were|do|does|did|have|has|had)\s/,
    /tell me (about|how|why|when|where)/i,
  ];

  return questionPatterns.some((pattern) => pattern.test(message_trimmed));
}

function startPeriodicRetraining(interval = RETRAINING_INTERVAL) {
  console.log("Starting periodic retraining service");
  setInterval(async () => {
    console.log("Running periodic retraining check...");
    try {
      const aiRobUser = await db.query.users.findFirst({
        where: eq(users.username, "ai.rob"),
      });

      if (!aiRobUser) {
        console.error("AI bot user not found during periodic retraining");
        return;
      }

      const result = await trainOnUserMessages(aiRobUser.id);
      console.log("Periodic retraining completed:", result);
    } catch (error) {
      console.error("Error during periodic retraining:", error);
    }
  }, interval);
}

// Export functions alphabetically for better organization
export {
  generateAIResponse,
  handleAIResponse,
  initializePinecone, 
  isQuestion,
  startPeriodicRetraining,
  trainOnUserMessages,
};

// Initialize Pinecone when the module loads
initializePinecone().catch((error) => {
  console.error("Failed to initialize Pinecone:", error);
  process.exit(1);
});