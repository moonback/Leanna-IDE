import { Router, type Request, type Response } from "express";
import { gmailService, type GmailAccountId } from "../email/GmailService.js";

const ACCOUNT_IDS = new Set<GmailAccountId>(["leanna", "personal"]);
const accountId = (value: unknown): GmailAccountId => {
  if (typeof value !== "string" || !ACCOUNT_IDS.has(value as GmailAccountId)) {
    throw new Error("Compte e-mail invalide (leanna ou personal attendu).");
  }
  return value as GmailAccountId;
};

export function handleGmailOAuthCallback(_req: Request, res: Response): void {
  const code = typeof _req.query.code === "string" ? _req.query.code : "";
  const state = typeof _req.query.state === "string" ? _req.query.state : "";
  const oauthError = typeof _req.query.error === "string" ? _req.query.error : "";
  if (oauthError) {
    res.status(400).type("html").send(callbackHtml(false, "Autorisation Google refusée ou annulée."));
    return;
  }
  if (!code || !state) {
    res.status(400).type("html").send(callbackHtml(false, "Réponse OAuth incomplète."));
    return;
  }
  void gmailService.completeAuthorization(code, state).then(({ account, email }) => {
    res.type("html").send(callbackHtml(true, `Compte ${account === "leanna" ? "Leanna" : "personnel"} connecté : ${escapeHtml(email)}`));
  }).catch((error: Error) => {
    console.warn("[Gmail] Échec du callback OAuth:", error.message);
    res.status(400).type("html").send(callbackHtml(false, escapeHtml(error.message)));
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function callbackHtml(success: boolean, message: string): string {
  const color = success ? "#16a34a" : "#dc2626";
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion Gmail — Leanna</title><body style="margin:0;background:#111827;color:#f9fafb;font:15px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:440px;padding:32px;text-align:center"><div style="font-size:32px;color:${color}">${success ? "✓" : "!"}</div><h1 style="font-size:20px">Connexion Gmail ${success ? "réussie" : "impossible"}</h1><p>${message}</p><p style="color:#9ca3af;font-size:13px">Vous pouvez fermer cette fenêtre et revenir dans Leanna.</p><button onclick="window.close()" style="padding:10px 18px;border:0;border-radius:8px;cursor:pointer">Fermer</button></main><script>setTimeout(()=>window.close(),1800)</script></body></html>`;
}

export function createGmailRouter(): Router {
  const router = Router();

  router.get("/settings", (_req, res) => {
    res.json({ status: "success", data: gmailService.getSettings() });
  });

  router.post("/oauth/credentials", (req, res) => {
    try {
      const { clientId, clientSecret } = req.body || {};
      if (typeof clientId !== "string") throw new Error("Client ID Google OAuth requis.");
      if (clientSecret !== undefined && typeof clientSecret !== "string") throw new Error("Client secret invalide.");
      gmailService.saveOAuthCredentials(clientId, clientSecret);
      res.json({ status: "success", data: gmailService.getSettings() });
    } catch (error) {
      res.status(400).json({ status: "error", error: (error as Error).message });
    }
  });

  router.post("/oauth/start", (req, res) => {
    try {
      const account = accountId(req.body?.account);
      res.json({ status: "success", url: gmailService.createAuthorizationUrl(account) });
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
