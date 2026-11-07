import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { notebookManager, contentGenerator } from "../../notebooks/index.js";
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

  router.post("/:id/audio-overviews/:overviewId/tts", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id);
      if (!notebook) {
        res.status(404).json({ error: "Notebook introuvable." });
        return;
      }

      const overview = notebook.audioOverviews?.find((o: any) => o.id === req.params.overviewId);
      if (!overview || overview.status !== "ready") {
        res.status(404).json({ error: "Audio overview introuvable ou pas prêt." });
        return;
      }

      const { generateSpeech } = await import("../../utils/geminiTTS.js");

      const hostName = typeof overview.hostName === "string" && overview.hostName.trim() ? overview.hostName.trim() : "Alex";
      const coHostName = typeof overview.coHostName === "string" && overview.coHostName.trim() ? overview.coHostName.trim() : "Sam";
      const hostVoice = req.body.hostVoice || req.body.alexVoice || "ff_siwis";
      const coHostVoice = req.body.coHostVoice || req.body.samVoice || "Puck";
      const lines = overview.script.split("\n").filter((l: string) => l.trim());
      const dialogueLines: { speaker: string; text: string }[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const separator = trimmed.indexOf(":");
        const label = separator > 0 ? trimmed.slice(0, separator).trim().toLowerCase() : "";
        const body = separator > 0 ? trimmed.slice(separator + 1).trim() : trimmed;
        if (label === hostName.toLowerCase() || label === "alex") {
          dialogueLines.push({ speaker: "host", text: body });
        } else if (label === coHostName.toLowerCase() || label === "sam") {
          dialogueLines.push({ speaker: "cohost", text: body });
        } else if (trimmed) {
          dialogueLines.push({ speaker: "host", text: trimmed });
        }
      }

      if (dialogueLines.length === 0) {
        res.status(400).json({ error: "Le script ne contient aucune réplique." });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      res.write(`event: start\ndata: ${JSON.stringify({ total: dialogueLines.length })}\n\n`);

      let generatedCount = 0;
      let skippedCount = 0;
      for (let i = 0; i < dialogueLines.length; i++) {
        if (res.destroyed || res.writableEnded) return;
        const { speaker, text } = dialogueLines[i];
        const voice = speaker === "host" ? hostVoice : coHostVoice;

        try {
          const audioBase64 = await generateSpeech(text, { voiceName: voice });
          if (audioBase64) {
            generatedCount++;
            res.write(`event: chunk\ndata: ${JSON.stringify({
              index: i,
              speaker,
              text,
              audio: audioBase64,
            })}\n\n`);
          } else {
            skippedCount++;
            res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: "Le fournisseur TTS n'a retourné aucun audio." })}\n\n`);
          }
        } catch (ttsErr: any) {
          skippedCount++;
          res.write(`event: skip\ndata: ${JSON.stringify({ index: i, speaker, reason: ttsErr.message })}\n\n`);
        }
      }

      if (generatedCount === 0) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: `Aucun audio n'a été généré (${skippedCount} répliques ignorées). Vérifiez les clés API et la disponibilité du fournisseur TTS.` })}\n\n`);
      } else {
        res.write(`event: done\ndata: ${JSON.stringify({ totalGenerated: generatedCount, totalSkipped: skippedCount })}\n\n`);
      }
      res.end();
    } catch (e: any) {
      if (res.headersSent) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // Nouvelle voie de production : un épisode WAV unique avec deux voix.
  router.post("/:id/audio-overviews/:overviewId/audio-track", async (req: Request, res: Response): Promise<void> => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id, SELF_ROOT || undefined);
      const overview = notebook?.audioOverviews?.find((item: any) => item.id === req.params.overviewId);
      if (!overview || overview.status !== "ready") {
        res.status(404).json({ error: "Podcast introuvable ou script non prêt." });
        return;
      }
      const cachedTrack = path.join(getSandboxRoot(), "podcasts", `${overview.id}.wav`);
      if (fs.existsSync(cachedTrack)) {
        const stat = fs.statSync(cachedTrack);
        res.json({
          status: "ready",
          audioUrl: `/api/notebooks/${encodeURIComponent(req.params.id)}/audio-overviews/${encodeURIComponent(overview.id)}/audio-track`,
          format: "wav",
          sizeBytes: stat.size,
          cached: true,
        });
        return;
      }
      const { renderPodcastAudio } = await import("../../notebooks/PodcastAudioRenderer.js");
      const hostName = typeof overview.hostName === "string" && overview.hostName.trim() ? overview.hostName.trim() : "Leanna";
      const coHostName = typeof overview.coHostName === "string" && overview.coHostName.trim() ? overview.coHostName.trim() : "Noah";
      const result = await renderPodcastAudio(overview.script, overview.id, {
        hostName,
        coHostName,
        hostVoice: typeof req.body?.hostVoice === "string" ? req.body.hostVoice : "ff_siwis",
        coHostVoice: typeof req.body?.coHostVoice === "string" ? req.body.coHostVoice : "am_adam",
      });
      res.json({
        status: "ready",
        audioUrl: `/api/notebooks/${encodeURIComponent(req.params.id)}/audio-overviews/${encodeURIComponent(overview.id)}/audio-track`,
        format: "wav",
        durationSeconds: result.durationSeconds,
        sizeBytes: result.sizeBytes,
        segmentCount: result.segmentCount,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Échec du rendu audio." });
    }
  });

  router.get("/:id/audio-overviews/:overviewId/audio-track", (req: Request, res: Response): void => {
    try {
      const notebook = notebookManager.getNotebook(req.params.id, SELF_ROOT || undefined);
      const overview = notebook?.audioOverviews?.find((item: any) => item.id === req.params.overviewId);
      if (!overview) {
        res.status(404).json({ error: "Podcast introuvable." });
        return;
      }
      const audioPath = path.join(getSandboxRoot(), "podcasts", `${overview.id}.wav`);
      if (!fs.existsSync(audioPath)) {
        res.status(404).json({ error: "La piste audio n'a pas encore été générée." });
        return;
      }
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (req.query.download === "1") {
        res.setHeader("Content-Disposition", `attachment; filename="podcast-${overview.id}.wav"`);
      }
      res.sendFile(audioPath);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Lecture audio impossible." });
    }
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
