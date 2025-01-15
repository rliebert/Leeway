import { Router } from "express";
import { trainOnUserMessages, startPeriodicRetraining } from "../services/rag";
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/api/ai/train", async (req, res) => {
  try {
    const rliebert = await db.query.users.findFirst({
      where: eq(users.username, "rliebert"),
    });

    if (!rliebert) {
      return res.status(404).json({ error: "Training user not found" });
    }

    const result = await trainOnUserMessages(rliebert.id);
    
    if (result.success) {
      res.json({
        message: "Training completed successfully",
        newMessagesProcessed: result.newMessagesProcessed
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error });
  }
});

// Initialize periodic retraining
startPeriodicRetraining();

export default router;
