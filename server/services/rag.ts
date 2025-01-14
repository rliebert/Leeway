import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, message_embeddings, users } from "@db/schema";
import { eq, desc, sql, and, gt } from "drizzle-orm";

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-3-small"
});

let lastTrainingTimestamp: Date | null = null;
const RETRAINING_INTERVAL = 1000 * 60 * 60; // 1 hour

// Store message embedding in the database
export async function storeMessageEmbedding(messageId: string, userId: string, content: string) {
  try {
    const embeddingVector = await embeddings.embedQuery(content);
    await db.insert(message_embeddings).values({
      message_id: messageId,
      user_id: userId,
      embedding: JSON.stringify(embeddingVector)
    });
  } catch (error) {
    console.error('Error storing message embedding:', error);
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
  } catch (error) {
    console.error('Error training on user messages:', error);
    return { success: false, error: error.message };
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
      return await trainOnUserMessages(rliebert.id, lastTrainingTimestamp);
    }

    return { success: true, newMessagesProcessed: 0, message: 'Retraining not needed' };
  } catch (error) {
    console.error('Error in checkAndRetrain:', error);
    return { success: false, error: error.message };
  }
}

// Find similar messages using vector similarity search
export async function findSimilarMessages(query: string, limit = 5) {
  try {
    const queryEmbedding = await embeddings.embedQuery(query);

    const similarMessages = await db.execute(sql`
      SELECT m.*, 
             u.username,
             u.full_name,
             1 - (me.embedding <=> ${JSON.stringify(queryEmbedding)}) as similarity
      FROM message_embeddings me
      JOIN messages m ON me.message_id = m.id
      JOIN users u ON m.user_id = u.id
      WHERE u.username = 'rliebert'
      ORDER BY me.embedding <-> ${JSON.stringify(queryEmbedding)}
      LIMIT ${limit}
    `);

    return similarMessages.rows;
  } catch (error) {
    console.error('Error finding similar messages:', error);
    return [];
  }
}

// Generate AI response using retrieved context
export async function generateAIResponse(query: string, similarMessages: any[]) {
  try {
    const context = similarMessages
      .map(m => `Message: ${m.content}\nContext: This was posted by rliebert with similarity ${m.similarity}`)
      .join('\n\n');

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4",
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

    const response = await completion.json();
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "I apologize, I'm having trouble processing your request at the moment.";
  }
}

export function isQuestion(message: string): boolean {
  return message.trim().endsWith('?');
}

// Start periodic retraining
export function startPeriodicRetraining(interval = RETRAINING_INTERVAL) {
  setInterval(async () => {
    console.log('Running periodic retraining check...');
    await checkAndRetrain();
  }, interval);
}