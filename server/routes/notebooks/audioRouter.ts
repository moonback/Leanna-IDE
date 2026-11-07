import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { notebookManager, contentGenerator } from "../../notebooks/index.js";
import { podcastAudioPath } from "../../notebooks/NotebookManager.js";
import { buildWav, parseDialogue, BYTES_PER_SECOND } from "../../notebooks/podcastAudio.js";
import { getSandboxRoot } from "../../utils/sandbox.js";
import { getProjectRoot } from "../../utils/pathUtils.js";
import { SELF_ROOT } from "../../utils/selfRoot.js";

export function createAudioRouter(): Router {
  const router = Router();

  // Refuser les identifiants appartenant à un autre workspace avant toute
  // lecture, mutation, génération, export ou réindexation.
  router.use("/:id", (req: Request, res: Response, next) => {
    if (!notebookManager.getNotebook(req.params.id, SELF_ROOT || undefined)) {
      res.status(404).json({ error: "Notebook introuvable dans le workspace actif." });
      return;
    }
    next();
  });

  router.post("/:id/audio-overview", async (req: Request, res: Response): Promise<void> => {
    try {
      const { language, duration, sourceIds, tone, customInstructions, hostName, coHostName, coHostPersonality } = req.body;
      const overview = await contentGenerator.generateAudioOverview(req.params.id, {
        language, duration, sourceIds, tone, customInstructions, hostName, coHostName, coHostPersonality,
      });
      res.json({ status: "success", overview });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rendu unique du fichier WAV à deux voix (Leanna = ff_siwis, co-animateur = Puck).
  // SSE pour la progression : le rendu d'un épisode long prend plusieurs minutes.
  router.post("/:id/audio-overviews/:overviewId/audio", async (req: Request, res: Response): Promise<void> => {
    const notebook = notebookManager.getNotebook(req.params.id);
    const overview = notebook?.audioOverviews?.find(o => o.id === req.params.overviewId);
    if (!overview || overview.status !== "ready") {
      res.status(404).json({ error: "Audio overview introuvable ou pas prêt." });
      return;
    }
    const lines = parseDialogue(overview.script, overview.hostName?.trim() || "Alex", overview.coHostName?.trim() || "Sam");
    if (lines.length === 0) {
      res.status(400).json({ error: "Le script ne contient aucune réplique." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { generateSpeech } = await import("../../utils/geminiTTS.js");
      send("start", { total: lines.length });
      let done = 0;
      // ttsQueue limite déjà la concurrence ; Promise.all conserve l'ordre des répliques.
      const segments = await Promise.all(lines.map(async ({ speaker, text }) => {
        const audio = await generateSpeech(text, { voiceName: speaker === "host" ? "ff_siwis" : "Puck" }).catch(() => null);
        send("progress", { done: ++done, total: lines.length });
        return audio ? Buffer.from(audio, "base64") : null;
      }));
      const failed = segments.filter(s => !s).length;
      if (failed > 0) {
        send("error", { error: `${failed}/${lines.length} répliques n'ont pas pu être synthétisées. Vérifiez les clés TTS puis relancez (les répliques réussies sont en cache).` });
        return;
      }
      const wav = buildWav(segments as Buffer[]);
      const filePath = podcastAudioPath(overview.id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, wav);
      overview.audioReady = true;
      overview.estimatedDuration = Math.round((wav.length - 44) / BYTES_PER_SECOND);
      notebookManager.persistNotebook(req.params.id);
      send("done", { overview });
    } catch (e: any) {
      send("error", { error: e.message });
    } finally {
      res.end();
    }
  });

  router.get("/:id/audio-overviews/:overviewId/audio", (req: Request, res: Response): void => {
    const overview = notebookManager.getNotebook(req.params.id)?.audioOverviews?.find(o => o.id === req.params.overviewId);
    const filePath = overview?.audioReady ? podcastAudioPath(overview.id) : null;
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: "Audio non généré." });
      return;
    }
    res.sendFile(filePath); // gère les requêtes Range (avance rapide dans le lecteur)
  });

  router.get("/:id/audio-overviews", (req: Request, res: Response): void => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }
      res.json({ status: "success", overviews: notebook.audioOverviews });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete("/:id/audio-overviews/:overviewId", (req: Request, res: Response): void => {
    try {
      const success = notebookManager.deleteAudioOverview(req.params.id, req.params.overviewId);
      if (!success) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }
      res.json({ status: "success", message: "Audio overview supprimé." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/:id/audio-overviews/:overviewId/export", (req: Request, res: Response): void => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview) {
        res.status(404).json({ error: "Audio overview introuvable." });
        return;
      }

      const lines: string[] = [];
      lines.push(`# 🎙️ ${overview.title}`);
      lines.push("");
      lines.push(`> Exporté le ${new Date().toLocaleString("fr-FR")}`);
      lines.push(`> Durée estimée : ${Math.floor(overview.estimatedDuration / 60)}:${(overview.estimatedDuration % 60).toString().padStart(2, "0")}`);
      lines.push("");
      lines.push("---");
      lines.push("");

      const scriptLines = overview.script.split("\n");
      for (const line of scriptLines) {
        const trimmed = line.trim();
        if (!trimmed) {
          lines.push("");
          continue;
        }

        const hostName = overview.hostName || "Alex";
        const coHostName = overview.coHostName || "Sam";
        const separator = trimmed.indexOf(":");
        const label = separator > 0 ? trimmed.slice(0, separator).trim().toLowerCase() : "";
        const body = separator > 0 ? trimmed.slice(separator + 1).trim() : trimmed;
        if (label === hostName.toLowerCase() || label === "alex") {
          lines.push(`**🎙️ ${hostName} :** ${body}`);
          lines.push("");
        } else if (label === coHostName.toLowerCase() || label === "sam") {
          lines.push(`**🤖 ${coHostName} :** ${body}`);
          lines.push("");
        } else {
          lines.push(`*${trimmed}*`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
      lines.push(`*Script généré le ${new Date(overview.createdAt).toLocaleString("fr-FR")}*`);

      const markdown = lines.join("\n");

      const saveToWorkspace = req.query.save === "true" || req.query.save === "sandbox";
      const saveToSandbox = req.query.save === "sandbox";

      if (saveToWorkspace) {
        const targetRoot = saveToSandbox ? getSandboxRoot() : getProjectRoot();

        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ ]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 50)}.md`;
        const filePath = path.join(targetRoot, filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, markdown, "utf-8");

        res.json({
          status: "success",
          message: saveToSandbox ? `Script audio sauvegardé dans la sandbox` : `Script sauvegardé dans le workspace`,
          filePath: filename,
          destination: saveToSandbox ? "sandbox" : "workspace",
          markdown,
        });
      } else {
        const filename = `audio-script-${overview.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}-${Date.now()}.md`;
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(markdown);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
