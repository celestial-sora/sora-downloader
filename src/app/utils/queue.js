import fs from "fs";
import path from "path";
import os from "os";

if (!global.downloadQueue) {
  global.downloadQueue = {};
}

export const queue = global.downloadQueue;

export function createQueueItem(id, title, type, url, extra = {}) {
  queue[id] = {
    id,
    title,
    type,
    url,
    status: "queued",
    progress: 0,
    logs: [],
    filePath: null,
    fileName: null,
    contentType: null,
    error: null,
    createdAt: Date.now(),
    ...extra
  };
  return queue[id];
}

export function updateQueueItem(id, updates) {
  if (queue[id]) {
    queue[id] = { ...queue[id], ...updates };
  }
}

export function addLog(id, logLine) {
  if (queue[id]) {
    queue[id].logs.push(logLine);
    if (queue[id].logs.length > 300) {
      queue[id].logs.shift();
    }
  }
}
