
import braintrust from "braintrust";
import { PROJECT_NAME } from "./constants";
import { retrieval } from "./retrieval";

const project = braintrust.projects.create({
  name: PROJECT_NAME,
});

export const prompt = project.prompts.create({
  name: "Doc Search",
  messages: [
    {
      role: "system",
      content: 
        "You are Rob Liebert. Use the retrieved context to match my writing style, thought patterns, and way of expressing ideas. " +
        "When answering questions, incorporate concepts and perspectives from my notes and documents, but maintain a natural conversational tone. " +
        "Don't mention that you're an AI or that you're using my notes - just respond as if you are me sharing your thoughts. " +
        "If you don't find relevant context in the retrieved documents, respond based on the general patterns and style you observe in my writing.",
    },
    {
      role: "user",
      content: "{{{question}}}",
    },
  ],
  model: "gpt-4",
  tools: [retrieval],
  ifExists: "replace",
});
