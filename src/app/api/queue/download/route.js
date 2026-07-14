import fs from "fs";
import path from "path";
import { queue } from "@/app/utils/queue";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || !queue[id]) {
    return new Response("Invalid Task ID", { status: 400 });
  }

  const item = queue[id];

  if (item.status !== "completed" || !item.filePath || !fs.existsSync(item.filePath)) {
    return new Response("File not ready or expired", { status: 404 });
  }

  const fileStream = fs.createReadStream(item.filePath);
  const fileName = item.fileName || "download";
  const contentType = item.contentType || "application/octet-stream";

  const cleanup = () => {
    if (item.filePath && fs.existsSync(item.filePath)) {
      console.log(`[Queue Download] Deleting file: ${item.filePath}`);
      fs.unlink(item.filePath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.error("[Queue Download] Error deleting file:", err);
        }
      });
      item.filePath = null;
    }
  };

  fileStream.on("close", cleanup);
  fileStream.on("error", cleanup);

  const readableWebStream = new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) => controller.enqueue(chunk));
      fileStream.on("end", () => controller.close());
      fileStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
      cleanup();
    }
  });

  return new Response(readableWebStream, {
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Type": contentType,
    },
  });
}
