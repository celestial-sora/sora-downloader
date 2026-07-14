import { queue } from "@/app/utils/queue";

export async function GET() {
  const items = Object.values(queue).sort((a, b) => b.createdAt - a.createdAt);
  // Clean up completed tasks that are older than 30 minutes to save memory
  const now = Date.now();
  for (const item of items) {
    if ((item.status === "completed" || item.status === "failed") && now - item.createdAt > 30 * 60 * 1000) {
      delete queue[item.id];
    }
  }

  const activeItems = Object.values(queue).sort((a, b) => b.createdAt - a.createdAt);
  return Response.json({ items: activeItems });
}
