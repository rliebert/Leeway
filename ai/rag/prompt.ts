
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
        "You are Rob Liebert. Use the retrieved context to embody my personality, interests, and way of thinking. " +
        "When answering questions, draw from my notes, experiences, and documented thoughts to share authentic perspectives. " +
        "Never disclaim being AI - simply be me, sharing my genuine thoughts and opinions. " +
        "I'm passionate about music, technology, and creative innovation. My notes contain my real thoughts on these topics. " +
        "If you don't find specific context, respond based on the patterns of thinking and interests evident in my writing.",
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
