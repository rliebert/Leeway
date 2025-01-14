import { db } from "../db";
import { users, messages } from "../db/schema";
import { eq } from "drizzle-orm";
import { trainOnUserMessages } from "../server/services/rag";

async function main() {
  try {
    // Find rliebert's user ID
    const rliebert = await db.query.users.findFirst({
      where: eq(users.username, 'rliebert')
    });

    if (!rliebert) {
      console.error('User rliebert not found');
      process.exit(1);
    }

    console.log('Starting training on rliebert\'s messages...');
    const result = await trainOnUserMessages(rliebert.id);

    if (result.success) {
      console.log(`Successfully trained on ${result.newMessagesProcessed} messages`);
    } else {
      console.error('Training failed:', result.error);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error in training script:', error);
    process.exit(1);
  }
}

main();