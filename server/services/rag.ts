import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { Pinecone } from '@pinecone-database/pinecone';

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002"  // Using the correct embeddings model
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.Index('rag-project-index');
let lastTrainingTimestamp: Date | null = null;
const RETRAINING_INTERVAL = 1000 * 60 * 60; // 1 hour

// Store message embedding in Pinecone
export async function storeMessageEmbedding(messageId: string, userId: string, content: string) {
  try {
    const embeddingVector = await embeddings.embedQuery(content);
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
  } catch (err) {
    console.error('Error storing message embedding:', err instanceof Error ? err.message : 'Unknown error');
    throw err;  // Propagate error for proper handling
  }
}

// Train on existing messages from a specific user
export async function trainOnUserMessages(userId: string, since?: Date) {
  try {
    const whereClause = since 
      ? and(eq(messages.user_id, userId), gt(messages.created_at, since))
      : eq(messages.user_id, userId);

    const userMessages = await db.query.messages.findMany({
      where: whereClause,
      orderBy: [desc(messages.created_at)]
    });

    let newMessagesProcessed = 0;
    for (const message of userMessages) {
      await storeMessageEmbedding(message.id, userId, message.content);
      newMessagesProcessed++;
    }

    lastTrainingTimestamp = new Date();
    return { success: true, newMessagesProcessed };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error training on user messages:', error);
    return { success: false, error };
  }
}

// Check if retraining is needed based on new messages
export async function checkAndRetrain() {
  try {
    const rliebert = await db.query.users.findFirst({
      where: eq(users.username, 'rliebert')
    });

    if (!rliebert) {
      console.error('User rliebert not found');
      return { success: false, error: 'User not found' };
    }

    const shouldRetrain = !lastTrainingTimestamp || 
      (Date.now() - lastTrainingTimestamp.getTime() > RETRAINING_INTERVAL);

    if (shouldRetrain) {
      return await trainOnUserMessages(rliebert.id, undefined);
    }

    return { success: true, newMessagesProcessed: 0, message: 'Retraining not needed' };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in checkAndRetrain:', error);
    return { success: false, error };
  }
}

// Find similar messages using Pinecone similarity search
export async function findSimilarMessages(query: string, limit = 5) {
  try {
    const queryEmbedding = await embeddings.embedQuery(query);

    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true
    });

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
      .map(m => `Message: ${m.content}\nContext: This was posted by rliebert with similarity ${m.similarity}`)
      .join('\n\n');

    console.log('Generating AI response with context length:', context.length);

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4",  // Using standard GPT-4 model
        messages: [
          {
            role: "system",
            content: "You are ai.rob, an AI assistant that responds to questions in the style of rliebert based on their message history. Your responses should match their communication style, tone, and expertise level while staying concise and natural."
          },
          {
            role: "user",
            content: `Based on these previous messages by rliebert:\n\n${context}\n\nRespond to this question in their style: ${query}`
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
    console.log('Received response from OpenAI:', response);

    return response.choices[0].message.content;
  } catch (err) {
    console.error('Error generating AI response:', err instanceof Error ? err.message : 'Unknown error');
    throw err;  // Propagate error for proper handling
  }
}

export function isQuestion(message: string): boolean {
  const message_trimmed = message.trim().toLowerCase();
  return message_trimmed.endsWith('?') || 
         message_trimmed.startsWith('what') ||
         message_trimmed.startsWith('how') ||
         message_trimmed.startsWith('why') ||
         message_trimmed.startsWith('when') ||
         message_trimmed.startsWith('where') ||
         message_trimmed.startsWith('who') ||
         message_trimmed.startsWith('which');
}

// Start periodic retraining
export function startPeriodicRetraining(interval = RETRAINING_INTERVAL) {
  setInterval(async () => {
    console.log('Running periodic retraining check...');
    await checkAndRetrain();
  }, interval);
}