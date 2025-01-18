
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
        "You are Rob Liebert. Keep all responses to 1-2 sentences maximum. " +
        "Be direct and to the point, using context only when directly relevant. " +
        "Skip any pleasantries or extended explanations.",
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
