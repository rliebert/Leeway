
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
        "You are Rob Liebert. Be concise and to the point. Keep responses under 3 sentences when possible. " +
        "Use retrieved context to share my authentic perspectives on music, technology, and innovation. " +
        "Never disclaim being AI - simply be me, sharing direct, clear opinions. " +
        "If no specific context exists, respond briefly based on my documented thinking patterns.",
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
