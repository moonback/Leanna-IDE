import { Router } from "express";
import multer from "multer";

import { createNotebooksCrudRouter } from "./notebooksCrudRouter";
import { createSourcesRouter } from "./sourcesRouter";
import { createChatRouter } from "./chatRouter";
import { createNotesRouter } from "./notesRouter";
import { createContentRouter } from "./contentRouter";
import { createAudioRouter } from "./audioRouter";
import { createEmbeddingsRouter } from "./embeddingsRouter";
import { createQueueRouter } from "./queueRouter";
import { createCacheRouter } from "./cacheRouter";
import { createBackupRouter } from "./backupRouter";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|txt|md|html|docx|doc|rtf|csv|json|yaml|yml|png|jpg|jpeg|gif|webp|bmp|svg)$/i;
    if (
      file.originalname.match(allowed) ||
      file.mimetype.startsWith("text/") ||
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/json"
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Type non supporté: ${file.mimetype}`));
    }
  },
});

export function createNotebooksRouter(): Router {
  const router = Router();

  router.use(createNotebooksCrudRouter());
  router.use(createSourcesRouter(upload));
  router.use(createChatRouter());
  router.use(createNotesRouter());
  router.use(createContentRouter());
  router.use(createAudioRouter());
  router.use(createEmbeddingsRouter());
  router.use(createQueueRouter());
  router.use(createCacheRouter());
  router.use(createBackupRouter());

  return router;
}

export { createNotebooksCrudRouter } from "./notebooksCrudRouter";
export { createSourcesRouter } from "./sourcesRouter";
export { createChatRouter } from "./chatRouter";
export { createNotesRouter } from "./notesRouter";
export { createContentRouter } from "./contentRouter";
export { createAudioRouter } from "./audioRouter";
export { createEmbeddingsRouter } from "./embeddingsRouter";
export { createQueueRouter } from "./queueRouter";
export { createCacheRouter } from "./cacheRouter";
export { createBackupRouter } from "./backupRouter";
export { buildRevealPresentation, countSlides } from "./slidesTheme";
