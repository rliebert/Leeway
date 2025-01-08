import { db } from "@/lib/db";
import { dmChannels } from "@db/schema";
import { eq, or, and } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const channels = await db.select()
    .from(dmChannels)
    .where(
      or(
        eq(dmChannels.user1Id, session.user.id),
        eq(dmChannels.user2Id, session.user.id)
      )
    );

  return Response.json(channels);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { userId } = await req.json();

  // Check if channel already exists
  const existingChannel = await db.select()
    .from(dmChannels)
    .where(
      or(
        and(
          eq(dmChannels.user1Id, session.user.id),
          eq(dmChannels.user2Id, userId)
        ),
        and(
          eq(dmChannels.user1Id, userId),
          eq(dmChannels.user2Id, session.user.id)
        )
      )
    ).limit(1);

  if (existingChannel.length > 0) {
    return Response.json(existingChannel[0]);
  }

  // Create new channel
  const [channel] = await db.insert(dmChannels)
    .values({
      user1Id: session.user.id,
      user2Id: userId,
    })
    .returning();

  return Response.json(channel);
} 