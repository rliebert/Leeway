
import { OpenAIEmbeddings } from "@langchain/openai";
import { db } from "@db";
import { messages, message_embeddings, users } from "@db/schema";
import { eq } from "drizzle-orm";

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export async function generateEmbedding(text: string) {
  const result = await embeddings.embedQuery(text);
  return JSON.stringify(result);
}

export async function findSimilarMessages(query: string, limit = 5) {
  const queryEmbedding = await generateEmbedding(query);
  
  // Implement vector similarity search using PostgreSQL
  const similarMessages = await db.query.message_embeddings.findMany({
    with: {
      message: true,
    },
    limit,
    orderBy: (messages, { sql }) => sql`embedding <-> ${queryEmbedding}`,
  });

  return similarMessages;
}

export async function generateAIResponse(query: string, similarMessages: any[]) {
  const context = similarMessages.map(m => m.message.content).join('\n');
  
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
          content: "You are ai.rob, responding to questions in the style of rliebert based on their message history. Keep responses concise and natural."
        },
        {
          role: "user",
          content: `Based on these previous messages by rliebert:\n${context}\n\nRespond to this question in their style: ${query}`
        }
      ]
    })
  });

  const response = await completion.json();
  return response.choices[0].message.content;
}

export function isQuestion(message: string): boolean {
  return message.trim().endsWith('?');
}
