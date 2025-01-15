import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { Pinecone } from '@pinecone-database/pinecone';

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002"
});

// Initialize Pinecone client with the correct configuration
const pinecone = new Pinecone();

// Get the index using the full service URL
const index = pinecone.index('rag-project-index');

let lastTrainingTimestamp: Date | null = null;
const RETRAINING_INTERVAL = 1000 * 60 * 60; // 1 hour

// Store message embedding in Pinecone
export async function storeMessageEmbedding(messageId: string, userId: string, content: string) {
  try {
    console.log('Generating embedding for message:', messageId);
    const embeddingVector = await embeddings.embedQuery(content);

    console.log('Storing embedding in Pinecone');
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
    console.error('Error storing message embedding:', err instanceof Error ? err.message : 'Unknown error');
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
    return queryResponse.matches.map(match => ({
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

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are ai.rob, an AI assistant that helps users by providing informative and helpful responses. Your responses should be clear, concise, and natural while maintaining a helpful and professional tone."
          },
          {
            role: "user",
            content: `Based on this context:\n\n${context}\n\nRespond to this question: ${query}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    if (!completion.ok) {
      const errorData = await completion.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const response = await completion.json();
    console.log('Received response from OpenAI');

    // Parse the JSON response and extract the message content
    const jsonResponse = JSON.parse(response.choices[0].message.content);
    return jsonResponse.response || jsonResponse.message || "I couldn't generate a proper response at this time.";
  } catch (err) {
    console.error('Error generating AI response:', err instanceof Error ? err.message : 'Unknown error');
    return "I apologize, but I encountered an error while processing your request.";
  }
}

export function isQuestion(message: string): boolean {
  const message_trimmed = message.trim().toLowerCase();

  // Enhanced question detection
  const questionPatterns = [
    /\?$/,  // Ends with question mark
    /^(what|how|why|when|where|who|which|could|can|will|should|may|might)/,  // Starts with question words
    /^(is|are|was|were|do|does|did|have|has|had)\s/,  // Starts with auxiliary verbs
    /tell me (about|how|why|when|where)/i  // Indirect questions
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