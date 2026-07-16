import { queue } from "@/app/utils/queue";
import fs from "fs";

export async function POST() {
  try {
    const items = Object.values(queue);
    let clearedCount = 0;

    for (const item of items) {
      if (item.status === "completed" || item.status === "failed") {
        // Silently remove the downloaded temp file to save space on disk
        if (item.filePath && fs.existsSync(item.filePath)) {
          try {
            fs.unlinkSync(item.filePath);
          } catch (err) {
            console.error(`[Queue Clear] Failed to delete temp file ${item.filePath}:`, err);
          }
        }
        delete queue[item.id];
        clearedCount++;
      }
    }

    return Response.json({ success: true, clearedCount });
  } catch (error) {
    console.error("[Queue Clear] Error clearing completed tasks:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
