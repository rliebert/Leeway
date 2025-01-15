import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set');
}

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY environment variable is not set');
}

console.log('Initializing OpenAI embeddings...');
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-small" 
});

// Initialize Pinecone client with error handling
console.log('Initializing Pinecone client...');
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

// Export the handleAIResponse function
export async function handleAIResponse(question: string): Promise<string | null> {
  try {
    console.log('Finding similar messages for question:', question);
    const similarMessages = await findSimilarMessages(question, 5);

    if (similarMessages.length === 0) {
      console.log('No similar messages found, generating response without context');
      return generateAIResponse(question, []);
    }

    console.log(`Found ${similarMessages.length} similar messages`);
    return generateAIResponse(question, similarMessages);
  } catch (error) {
    console.error('Error handling AI response:', error);
    return null;
  }
}

export async function initializePinecone() {
  try {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!
    });
    console.log('Pinecone client initialized successfully');

    const indexName = 'leeway-chat-index';

    // List indexes with proper type checking
    const { indexes } = await pinecone.listIndexes();
    console.log('Available indexes:', JSON.stringify(indexes, null, 2));

    // Check if our index exists in the indexes array
    const indexExists = Array.isArray(indexes) &&
      indexes.some(idx => typeof idx === 'object' && idx.name === indexName);

    // Create index if it doesn't exist
    if (!indexExists) {
      console.log(`Creating new Pinecone index: ${indexName}`);
      try {
        await pinecone.createIndex({
          name: indexName,
          dimension: 1536, 
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'  
            }
          }
        });

        // Wait for index to be ready
        console.log('Waiting for index to initialize...');
        let isReady = false;
        let retries = 0;
        const maxRetries = 10;

        while (!isReady && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 5000)); 
          const description = await pinecone.describeIndex(indexName);
          isReady = description.status.ready;
          if (!isReady) {
            retries++;
            console.log(`Index not ready, attempt ${retries}/${maxRetries}`);
          }
        }

        if (!isReady) {
          throw new Error('Index failed to initialize within the timeout period');
        }
      } catch (createError) {
        console.error('Error creating Pinecone index:', createError);
        throw createError;
      }
    }

    // Connect to the index
    console.log(`Connecting to Pinecone index: ${indexName}`);
    index = pinecone.index(indexName);

    // Test the connection
    const stats = await index.describeIndexStats();
    console.log('Successfully connected to Pinecone index. Stats:', stats);

    return true;
  } catch (error) {
    console.error('Error initializing Pinecone:', error);
    throw error;
  }
}

let lastTrainingTimestamp: Date | null = null;
const RETRAINING_INTERVAL = 1000 * 60 * 60; 

// Store message embedding in Pinecone
export async function storeMessageEmbedding(messageId: string, userId: string, content: string) {
  try {
    console.log('Generating embedding for message:', messageId);
    const embeddingVector = await embeddings.embedQuery(content);

    console.log('Storing embedding in Pinecone, vector length:', embeddingVector.length);
    await index.upsert([{
      id: messageId,
      values: embeddingVector,
      metadata: {
        userId,
        content,
        timestamp: new Date().toISOString()
      }
    }]);

    console.log('Successfully stored embedding for message:', messageId);
    return true;
  } catch (err) {
    console.error('Error storing message embedding:', err instanceof Error ? err.message : 'Unknown error', err);
    return false;
  }
}

// Train on existing messages from a specific user
export async function trainOnUserMessages(userId: string, since?: Date) {
  try {
    console.log('Starting training on user messages for user:', userId);
    const whereClause = since
      ? and(eq(messages.user_id, userId), gt(messages.created_at, since))
      : eq(messages.user_id, userId);

    const userMessages = await db.query.messages.findMany({
      where: whereClause,
      orderBy: [desc(messages.created_at)]
    });

    console.log(`Found ${userMessages.length} messages to process`);
    let newMessagesProcessed = 0;

    for (const message of userMessages) {
      const success = await storeMessageEmbedding(message.id, userId, message.content);
      if (success) newMessagesProcessed++;
    }

    lastTrainingTimestamp = new Date();
    console.log(`Training completed. Processed ${newMessagesProcessed} messages`);
    return { success: true, newMessagesProcessed };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error training on user messages:', error);
    return { success: false, error };
  }
}

// Find similar messages using Pinecone similarity search
export async function findSimilarMessages(query: string, limit = 5) {
  try {
    console.log('Generating query embedding');
    const queryEmbedding = await embeddings.embedQuery(query);

    console.log('Searching for similar messages in Pinecone');
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true
    });

    console.log(`Found ${queryResponse.matches.length} similar messages`);
    return queryResponse.matches.map((match: PineconeMatch) => ({
      ...match.metadata,
      similarity: match.score
    }));
  } catch (err) {
    console.error('Error finding similar messages:', err instanceof Error ? err.message : 'Unknown error');
    return [];
  }
}

// Generate AI response using retrieved context
export async function generateAIResponse(query: string, similarMessages: any[]) {
  try {
    const context = similarMessages
      .map(m => `Message: ${m.content}\nContext: This was posted with similarity ${m.similarity}`)
      .join('\n\n');

    console.log('Generating AI response with context length:', context.length);
    console.log('Query:', query);
    console.log('Similar messages found:', similarMessages.length);

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: `You are ai.rob, a helpful AI assistant in the Leeway chat application. Your responses should be:
            1. Natural and conversational while maintaining professionalism
            2. Clear and concise
            3. Always relevant to the context provided
            4. Use the context provided to inform your responses, but you can also rely on your general knowledge

            When responding, consider both the direct question and any relevant context from previous messages.
            If no relevant context is found, simply answer based on your general knowledge.`
          },
          {
            role: "user",
            content: `Based on this context (if available):\n\n${context}\n\nRespond to this question: ${query}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!completion.ok) {
      const errorData = await completion.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const response = await completion.json();
    console.log('Received response from OpenAI');
    return response.choices[0].message.content || "I couldn't generate a proper response at this time.";

  } catch (err) {
    console.error('Error generating AI response:', err instanceof Error ? err.message : 'Unknown error');
    throw err; 
  }
}

export function isQuestion(message: string): boolean {
  const message_trimmed = message.trim().toLowerCase();

  // Enhanced question detection
  const questionPatterns = [
    /\?$/,  
    /^(what|how|why|when|where|who|which|could|can|will|should|may|might)/,  
    /^(is|are|was|were|do|does|did|have|has|had)\s/,  
    /tell me (about|how|why|when|where)/i  
  ];

  return questionPatterns.some(pattern => pattern.test(message_trimmed));
}

// Start periodic retraining
export function startPeriodicRetraining(interval = RETRAINING_INTERVAL) {
  console.log('Starting periodic retraining service');
  setInterval(async () => {
    console.log('Running periodic retraining check...');
    try {
      const aiRobUser = await db.query.users.findFirst({
        where: eq(users.username, 'ai.rob'),
      });

      if (!aiRobUser) {
        console.error('AI bot user not found during periodic retraining');
        return;
      }

      const result = await trainOnUserMessages(aiRobUser.id);
      console.log('Periodic retraining completed:', result);
    } catch (error) {
      console.error('Error during periodic retraining:', error);
    }
  }, interval);
}

// Initialize Pinecone when the module loads
initializePinecone().catch(error => {
  console.error('Failed to initialize Pinecone:', error);
  process.exit(1);
});