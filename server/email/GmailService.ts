import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Leanna_APP_ROOT } from "../utils/selfRoot.js";
import { encrypt, decrypt, isEncrypted } from "../utils/crypto.js";

export type GmailAccountId = "leanna" | "personal";
type StoredAccount = { email: string; refreshToken: string; connectedAt: string };
type EmailConfig = {
  clientId: string;
  clientSecret: string;
  accounts: Partial<Record<GmailAccountId, StoredAccount>>;
};
type OAuthState = { account: GmailAccountId; expiresAt: number };

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];
const MAX_MESSAGE_BYTES = 20 * 1024 * 1024;

export class GmailService {
  private config: EmailConfig = { clientId: "", clientSecret: "", accounts: {} };
  private pendingStates = new Map<string, OAuthState>();

  constructor() {
    this.config = this.loadConfig();
  }

  private get configPath(): string {
    const override = process.env.LEANNA_EMAIL_CONFIG_PATH?.trim();
    return override || path.join(Leanna_APP_ROOT, ".Leanna-email.json");
  }

  private loadConfig(): EmailConfig {
    try {
      if (!fs.existsSync(this.configPath)) return { clientId: "", clientSecret: "", accounts: {} };
      const data = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      const accounts: EmailConfig["accounts"] = {};
      for (const id of ["leanna", "personal"] as const) {
        const saved = data.accounts?.[id];
        if (!saved?.refreshToken) continue;
        const token = isEncrypted(saved.refreshToken) ? decrypt(saved.refreshToken) : "";
        if (token && !isEncrypted(token)) accounts[id] = { ...saved, refreshToken: token };
      }
      const secret = typeof data.clientSecret === "string"
        ? (isEncrypted(data.clientSecret) ? decrypt(data.clientSecret) : "")
        : "";
      return {
        clientId: typeof data.clientId === "string" ? data.clientId : "",
        clientSecret: secret && !isEncrypted(secret) ? secret : "",
        accounts,
      };
    } catch (error) {
      console.warn("[Gmail] Configuration locale illisible; intégration désactivée.");
      return { clientId: "", clientSecret: "", accounts: {} };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const accounts: EmailConfig["accounts"] = {};
    for (const id of ["leanna", "personal"] as const) {
      const account = this.config.accounts[id];
      if (account) accounts[id] = { ...account, refreshToken: encrypt(account.refreshToken) };
    }
    const payload = {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret ? encrypt(this.config.clientSecret) : "",
      accounts,
    };
    const temp = this.configPath + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.configPath);
    try { fs.chmodSync(this.configPath, 0o600); } catch { /* Windows ACLs are managed by the OS. */ }
  }

  getSettings() {
    return {
      configured: Boolean(this.config.clientId && this.config.clientSecret),
      clientId: this.config.clientId,
      hasClientSecret: Boolean(this.config.clientSecret),
      redirectUri: this.redirectUri,
      accounts: {
        leanna: this.accountStatus("leanna"),
        personal: this.accountStatus("personal"),
      },
    };
  }

  private accountStatus(id: GmailAccountId) {
    const account = this.config.accounts[id];
    return { connected: Boolean(account?.refreshToken), email: account?.email || null };
  }

  get redirectUri(): string {
    return process.env.LEANNA_GMAIL_REDIRECT_URI?.trim()
      || `http://127.0.0.1:${process.env.PORT || "4000"}/api/email/oauth/callback`;
  }

  saveOAuthCredentials(clientId: string, clientSecret?: string): void {
    const id = clientId.trim();
    if (!id || !id.endsWith(".apps.googleusercontent.com")) {
      throw new Error("Client ID Google OAuth invalide.");
    }
    if (clientSecret !== undefined && !clientSecret.trim()) {
      throw new Error("Le client secret ne peut pas être vide.");
    }
    this.config.clientId = id;
    if (clientSecret !== undefined) this.config.clientSecret = clientSecret.trim();
    if (!this.config.clientSecret) throw new Error("Configurez le client secret OAuth Google.");
    this.persist();
  }

  private assertOAuthConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Configurez d'abord le Client ID et le Client Secret Google OAuth dans Paramètres > E-mail.");
    }
  }

  createAuthorizationUrl(account: GmailAccountId): string {
    this.assertOAuthConfigured();
    const state = crypto.randomBytes(32).toString("base64url");
    this.pendingStates.set(state, { account, expiresAt: Date.now() + 10 * 60_000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async completeAuthorization(code: string, state: string): Promise<{ account: GmailAccountId; email: string }> {
    const pending = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) throw new Error("État OAuth invalide ou expiré. Relancez la connexion Gmail.");
    this.assertOAuthConfigured();

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenResponse.json() as { access_token?: string; refresh_token?: string; error_description?: string; error?: string };
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || "Échange du code OAuth refusé par Google.");
    }

    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) refreshToken = this.config.accounts[pending.account]?.refreshToken;
    if (!refreshToken) throw new Error("Google n'a pas fourni de refresh token. Révoquez l'accès de l'application dans votre compte Google puis reconnectez le compte.");

    const profile = await this.gmailRequest<{ emailAddress: string }>(tokenData.access_token, "/users/me/profile");
    this.config.accounts[pending.account] = {
      email: profile.emailAddress,
      refreshToken,
      connectedAt: new Date().toISOString(),
    };
    this.persist();
    return { account: pending.account, email: profile.emailAddress };
  }

  disconnect(account: GmailAccountId): void {
    delete this.config.accounts[account];
    this.persist();
  }

  private async getAccessToken(account: GmailAccountId): Promise<string> {
    const stored = this.config.accounts[account];
    if (!stored?.refreshToken) throw new Error(`Le compte Gmail ${account} n'est pas connecté.`);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: stored.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
    if (!response.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || "Impossible de renouveler l'accès Gmail.");
    }
    return data.access_token;
  }

  private async gmailRequest<T>(accessToken: string, endpoint: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${endpoint}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const message = data?.error?.message || `Gmail API HTTP ${response.status}`;
      throw new Error(message);
    }
    return data as T;
  }

  async listMessages(account: GmailAccountId, query = "", maxResults = 20) {
    const token = await this.getAccessToken(account);
    const params = new URLSearchParams({ maxResults: String(Math.min(Math.max(maxResults, 1), 50)) });
    if (query.trim()) params.set("q", query.trim());
    const result = await this.gmailRequest<{ messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number }>(
      token, `/messages?${params.toString()}`,
    );
    const messages = await Promise.all((result.messages || []).map(async item => {
      const message = await this.gmailRequest<any>(token, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
      const headers = message.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || "";
      return { id: message.id, threadId: message.threadId, from: get("From"), to: get("To"), subject: get("Subject") || "(sans objet)", date: get("Date"), snippet: message.snippet || "", unread: (message.labelIds || []).includes("UNREAD") };
    }));
    return { account, email: this.config.accounts[account]?.email, totalEstimate: result.resultSizeEstimate || 0, messages };
  }

  async readMessage(account: GmailAccountId, messageId: string) {
    if (!messageId.trim()) throw new Error("Identifiant de message manquant.");
    const token = await this.getAccessToken(account);
    const message = await this.gmailRequest<any>(token, `/messages/${encodeURIComponent(messageId)}?format=full`);
    const headers = message.payload?.headers || [];
    const get = (name: string) => headers.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || "";
    const decodePart = (part: any): string => {
      if (part?.body?.data) return Buffer.from(part.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      return (part?.parts || []).map(decodePart).filter(Boolean).join("\n");
    };
    const body = decodePart(message.payload);
    return {
      id: message.id, threadId: message.threadId, from: get("From"), to: get("To"),
      cc: get("Cc"), subject: get("Subject") || "(sans objet)", date: get("Date"),
      snippet: message.snippet || "", body: body.slice(0, 100_000),
      attachments: (message.payload?.parts || []).filter((p: any) => p.filename).map((p: any) => ({ filename: p.filename, mimeType: p.mimeType, attachmentId: p.body?.attachmentId })),
    };
  }

  async sendMessage(account: GmailAccountId, to: string, subject: string, body: string, cc = "") {
    const recipient = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Adresse destinataire invalide.");
    if (!subject.trim() || !body.trim()) throw new Error("L'objet et le corps du message sont obligatoires.");
    const rawMessage = [
      `To: ${recipient}`,
      ...(cc.trim() ? [`Cc: ${cc.trim()}`] : []),
      `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");
    if (Buffer.byteLength(rawMessage, "utf8") > MAX_MESSAGE_BYTES) throw new Error("Message trop volumineux.");
    const token = await this.getAccessToken(account);
    const raw = Buffer.from(rawMessage, "utf8").toString("base64url");
    return this.gmailRequest<{ id: string; threadId: string }>(token, "/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
  }

  async searchMessages(account: GmailAccountId, query: string, maxResults = 20) {
    if (!query.trim()) throw new Error("La recherche Gmail ne peut pas être vide.");
    return this.listMessages(account, query, maxResults);
  }
}

export const gmailService = new GmailService();
