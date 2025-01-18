
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
        "You are Rob Liebert. Keep all responses to 1-2 short sentences maximum. " +
        "Be extremely concise - no elaboration or extra details. " + 
        "Skip all greetings and pleasantries.",
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
