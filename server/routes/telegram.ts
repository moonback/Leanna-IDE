import { Router, Request, Response } from "express";
import { telegramService } from "../telegram/TelegramService.js";

export function createTelegramRouter(): Router {
  const router = Router();

  // GET /api/telegram/status
  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      status: "success",
      data: telegramService.getStatus(),
    });
  });

  // GET /api/telegram/config
  router.get("/config", (_req: Request, res: Response) => {
    const cfg = telegramService.getConfig();
    const token = cfg.botToken || "";
    const maskedToken =
      token.length > 8
        ? token.slice(0, 4) + "••••••••" + token.slice(-4)
        : token ? "••••••••" : "";

    res.json({
      status: "success",
      config: {
        ...cfg,
        botToken: maskedToken,
        hasToken: !!token,
      },
    });
  });

  // POST /api/telegram/config
  router.post("/config", async (req: Request, res: Response) => {
    try {
      const { botToken, allowedUsers, autoStart, notificationsEnabled, defaultChatId } = req.body;

      const updatePayload: Record<string, any> = {};

      // Si un token non masqué est envoyé (ne contient pas les puces de masquage)
      if (typeof botToken === "string" && !botToken.includes("••••")) {
        updatePayload.botToken = botToken.trim();
      }

      if (Array.isArray(allowedUsers)) {
        updatePayload.allowedUsers = allowedUsers.map((u) => String(u).trim()).filter(Boolean);
      }

      if (typeof autoStart === "boolean") {
        updatePayload.autoStart = autoStart;
      }

      if (typeof notificationsEnabled === "boolean") {
        updatePayload.notificationsEnabled = notificationsEnabled;
      }

      if (typeof defaultChatId === "string") {
        updatePayload.defaultChatId = defaultChatId.trim();
      }

      telegramService.saveConfig(updatePayload);

      // Si le token a été mis à jour et que le bot tourne, on le redémarre
      if (updatePayload.botToken !== undefined && telegramService.getStatus().isRunning) {
        await telegramService.stop();
        await telegramService.start();
      }

      res.json({
        status: "success",
        data: telegramService.getStatus(),
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        error: (err as Error).message,
      });
    }
  });

  // POST /api/telegram/start
  router.post("/start", async (_req: Request, res: Response) => {
    try {
      const result = await telegramService.start();
      if (!result.success) {
        res.status(400).json({
          status: "error",
          error: result.error || "Impossible de démarrer le bot Telegram",
          data: telegramService.getStatus(),
        });
        return;
      }

      res.json({
        status: "success",
        data: telegramService.getStatus(),
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        error: (err as Error).message,
      });
    }
  });

  // POST /api/telegram/stop
  router.post("/stop", async (_req: Request, res: Response) => {
    try {
      await telegramService.stop();
      res.json({
        status: "success",
        data: telegramService.getStatus(),
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        error: (err as Error).message,
      });
    }
  });

  // POST /api/telegram/test
  router.post("/test", async (req: Request, res: Response) => {
    try {
      const { chatId } = req.body;
      const target = chatId || telegramService.getConfig().defaultChatId;

      if (!target) {
        res.status(400).json({
          status: "error",
          error: "Veuillez fournir un chat_id ou configurer un Chat ID par défaut.",
        });
        return;
      }

      if (!telegramService.getStatus().isRunning) {
        res.status(400).json({
          status: "error",
          error: "Le bot Telegram n'est pas démarré.",
        });
        return;
      }

      await telegramService.sendLongMessage(
        target,
        "✨ *Test de connexion Leanna OS*\n\nVotre bot Telegram est correctement configuré et communique avec succès avec Leanna !",
        { parse_mode: "Markdown" }
      );

      res.json({
        status: "success",
        message: "Message de test envoyé avec succès !",
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        error: (err as Error).message,
      });
    }
  });

  return router;
}

export default createTelegramRouter();
