import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import * as marked from "marked";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { EMBEDDING_MODEL, INDEX_NAME, UPLOAD_BATCH_SIZE } from "./constants";
import { fileURLToPath } from "url"; // Import fileURLToPath

// Get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Section {
  title: string;
  content: string;
}

function parseMarkdownFile(filePath: string): Section[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const tokens = marked.lexer(content);
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  tokens.forEach((token) => {
    if (token.type === "heading") {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: token.text,
        content: "",
      };
    } else if (currentSection) {
      if (token.type === "paragraph" || token.type === "text") {
        currentSection.content += token.text + "\n";
      } else if (token.type === "code") {
        currentSection.content +=
          "```" + token.lang + "\n" + token.text + "\n```\n";
      }
    }
  });

  if (currentSection) {
    sections.push(currentSection);
  }

  // If a section only has a title, then concatenate it with the next section
  for (let i = 0; i < sections.length - 1; i++) {
    if (sections[i].title !== "" && sections[i].content === "") {
      sections[i].content =
        sections[i + 1].title + "\n" + sections[i + 1].content;
      sections[i + 1].title = "";
      sections[i + 1].content = "";
    }
  }

  return sections.filter((section) => section.content !== "");
}

function getAllMarkdownFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".md") || entry.name.endsWith(".mdx"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

if (!process.env.BRAINTRUST_API_KEY) {
  throw new Error("BRAINTRUST_API_KEY is not set");
}
if (!process.env.PINECONE_API_KEY) {
  throw new Error("PINECONE_API_KEY is not set");
}

// const openai = new OpenAI({
//   baseURL: "https://api.braintrust.dev/v1/proxy",
//   apiKey: process.env.BRAINTRUST_API_KEY || "", // Using Braintrust API key instead
// });
const openai = new OpenAI({
  // baseURL: "https://api.braintrust.dev/v1/proxy",
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

async function main() {
  const docsDir = path.join(__dirname, "../rag/docs/ai-agents/ai-rob");
  const markdownFiles = getAllMarkdownFiles(docsDir);

  const allSections: Section[] = [];

  for (const file of markdownFiles) {
    const sections = parseMarkdownFile(file);
    allSections.push(...sections);
  }

  // Embed one document to get the dimension
  const firstEmbedding = await openai.embeddings.create({
    input: `# ${allSections[0].title}\n${allSections[0].content}`,
    model: EMBEDDING_MODEL,
  });

  try {
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: firstEmbedding.data[0].embedding.length,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: "aws",
          region: "us-east-1",
        },
      },
    });
  } catch (e) {
    console.log("Index already exists");
  }
  const index = pinecone.Index(INDEX_NAME);

  // Batch the documents into groups of UPLOAD_BATCH_SIZE
  const batches = [];
  const upserts: Promise<void>[] = [];
  for (let i = 0; i < allSections.length; i += UPLOAD_BATCH_SIZE) {
    const batch = allSections.slice(i, i + UPLOAD_BATCH_SIZE);
    upserts.push(
      index.upsert(
        await Promise.all(
          batch.map(async (item, j) => ({
            id: `${item.title.normalize("NFD").replace(/[^A-Za-z0-9_]/g, "_")}-${i * UPLOAD_BATCH_SIZE + j}`, // Ensure ASCII only
            values: await openai.embeddings
              .create({
                input: `# ${item.title}\n\n${item.content}`,
                model: EMBEDDING_MODEL,
              })
              .then((res) => res.data[0].embedding),
            metadata: {
              title: item.title,
              content: item.content,
            },
          })),
        ),
      ),
    );
  }
  await Promise.all(upserts);

  console.log(
    `Uploaded ${allSections.length} documents in ${Math.ceil(allSections.length / UPLOAD_BATCH_SIZE)} batches.`,
  );
}

main().catch(console.error);
