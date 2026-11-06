import { Router } from "express";
import multer from "multer";
import { MAX_NOTEBOOK_SOURCE_BYTES } from "../../utils/notebookSourceUploadValidation.js";

import { createNotebookPromptsRouter } from "./promptsRouter.js";
import { createNotebooksCrudRouter } from "./notebooksCrudRouter.js";
import { createSourcesRouter } from "./sourcesRouter.js";
import { createChatRouter } from "./chatRouter.js";
import { createNotesRouter } from "./notesRouter.js";
import { createContentRouter } from "./contentRouter.js";
import { createAudioRouter } from "./audioRouter.js";
import { createEmbeddingsRouter } from "./embeddingsRouter.js";
import { createQueueRouter } from "./queueRouter.js";
import { createCacheRouter } from "./cacheRouter.js";
import { createBackupRouter } from "./backupRouter.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_NOTEBOOK_SOURCE_BYTES, files: 10, fields: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|txt|md|markdown|html|htm|png|jpg|jpeg|webp)$/i;
    if (!allowed.test(file.originalname)) {
      cb(new Error("Format non pris en charge. Utilisez PDF, TXT, Markdown, HTML, PNG, JPEG ou WebP."));
      return;
    }
    cb(null, true);
  },
});

export function createNotebooksRouter(): Router {
  const router = Router();

  // Monté EN PREMIER : les routes littérales /prompts doivent précéder le
  // routeur CRUD qui capture /:id (sinon « prompts » = id de notebook).
  router.use(createNotebookPromptsRouter());
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

export { createNotebookPromptsRouter } from "./promptsRouter.js";
export { createNotebooksCrudRouter } from "./notebooksCrudRouter.js";
export { createSourcesRouter } from "./sourcesRouter.js";
export { createChatRouter } from "./chatRouter.js";
export { createNotesRouter } from "./notesRouter.js";
export { createContentRouter } from "./contentRouter.js";
export { createAudioRouter } from "./audioRouter.js";
export { createEmbeddingsRouter } from "./embeddingsRouter.js";
export { createQueueRouter } from "./queueRouter.js";
export { createCacheRouter } from "./cacheRouter.js";
export { createBackupRouter } from "./backupRouter.js";
export { buildRevealPresentation, countSlides } from "./slidesTheme.js";
