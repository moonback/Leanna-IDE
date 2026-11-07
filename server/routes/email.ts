import { Router } from "express";
import { gmailService, type EmailProvider, type GmailAccountId } from "../email/GmailService.js";

const ACCOUNT_IDS = new Set<GmailAccountId>(["leanna", "personal"]);
const accountId = (value: unknown): GmailAccountId => {
  if (typeof value !== "string" || !ACCOUNT_IDS.has(value as GmailAccountId)) {
    throw new Error("Compte e-mail invalide (leanna ou personal attendu).");
  }
  return value as GmailAccountId;
};

export function createGmailRouter(): Router {
  const router = Router();

  router.get("/settings", (_req, res) => {
    res.json({ status: "success", data: gmailService.getSettings() });
  });

  router.post("/connect", async (req, res) => {
    try {
      const account = accountId(req.body?.account);
      const { email, appPassword } = req.body || {};
      const provider: EmailProvider = req.body?.provider === "infomaniak" ? "infomaniak" : "gmail";
      if (typeof email !== "string" || typeof appPassword !== "string") {
        throw new Error("Adresse e-mail et mot de passe d'application requis.");
      }
      await gmailService.connectAccount(account, email, appPassword, provider);
      res.json({ status: "success", data: gmailService.getSettings() });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  router.post("/permissions/personal-send", (req, res) => {
    try {
      if (typeof req.body?.enabled !== "boolean") throw new Error("Valeur enabled booléenne requise.");
      gmailService.setPersonalSendEnabled(req.body.enabled);
      res.json({ status: "success", data: gmailService.getSettings() });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  router.post("/disconnect", async (req, res) => {
    try {
      await gmailService.disconnect(accountId(req.body?.account));
      res.json({ status: "success", data: gmailService.getSettings() });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  router.get("/messages", async (req, res) => {
    try {
      const account = accountId(req.query.account);
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const max = Number(req.query.maxResults) || 20;
      const data = await gmailService.listMessages(account, query, max);
      res.json({ status: "success", data });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  router.get("/messages/:id", async (req, res) => {
    try {
      const account = accountId(req.query.account);
      const data = await gmailService.readMessage(account, req.params.id);
      res.json({ status: "success", data });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  return router;
}
