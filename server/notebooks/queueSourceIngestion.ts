import { randomUUID } from "crypto";
import { sourceProcessingQueue } from "./ProcessingQueue.js";

export interface QueuedSourceIngestionPayload {
  notebookId: string;
  kind: "buffer" | "url";
  fileName?: string;
  mimeType?: string;
  buffer?: Buffer;
  url?: string;
}

export interface QueuedSourceIngestionResult {
  sourceId: string;
  title: string;
  type: string;
  summary: string;
  keywords: string[];
  language: string;
  chunksCount: number;
  wordCount: number;
}

/**
 * Enqueue une ingestion puis attend sa fin pour préserver le contrat HTTP
 * synchrone des routes existantes. Le travail lui-même reste durable/reprenable.
 */
export async function enqueueSourceIngestion(
  payload: QueuedSourceIngestionPayload,
): Promise<QueuedSourceIngestionResult> {
  const task = sourceProcessingQueue.enqueue(
    `src-${randomUUID()}`,
    "source-ingest",
    payload,
  );

  if (!task) {
    const error = new Error("La file d'ingestion est pleine. Réessayez dans quelques instants.") as Error & { statusCode: number };
    error.statusCode = 503;
    throw error;
  }

  const completed = await sourceProcessingQueue.waitForTask(task.id);
  return completed.result as QueuedSourceIngestionResult;
}
