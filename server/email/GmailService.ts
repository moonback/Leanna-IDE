import fs from "node:fs";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { Leanna_APP_ROOT } from "../utils/selfRoot.js";
import { encrypt, decrypt, isEncrypted } from "../utils/crypto.js";

export type GmailAccountId = "leanna" | "personal";
export type EmailProvider = "gmail" | "custom";
export type MailServerSettings = {
  imapHost: string; imapPort: number; imapSecure: true;
  smtpHost: string; smtpPort: number; smtpSecurity: "ssl" | "starttls";
};
type StoredAccount = { email: string; appPassword: string; provider: EmailProvider; servers: MailServerSettings; connectedAt: string };
type EmailConfig = {
  accounts: Partial<Record<GmailAccountId, StoredAccount>>;
  personalSendEnabled: boolean;
};

const MAX_RESULTS = 50;
const MAX_BODY_CHARS = 100_000;
const GMAIL_SERVERS: MailServerSettings = {
  imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true,
  smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecurity: "ssl",
};
const INFOMANIAK_SERVERS: MailServerSettings = {
  imapHost: "mail.infomaniak.com", imapPort: 993, imapSecure: true,
  smtpHost: "mail.infomaniak.com", smtpPort: 587, smtpSecurity: "starttls",
};
const DEFAULT_CUSTOM_SERVERS = INFOMANIAK_SERVERS;
export function validateServerSettings(value: unknown): MailServerSettings {
  if (!value || typeof value !== "object") throw new Error("Paramètres IMAP/SMTP manquants.");
  const v = value as Record<string, unknown>;
  const host = (input: unknown, label: string) => {
    if (typeof input !== "string" || input.length > 253 || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(input) || input.includes("..")) throw new Error(`Nom d'hôte ${label} invalide.`);
    const normalized = input.toLowerCase();
    if (isIP(normalized) !== 0 || ["localhost", "localhost.localdomain"].includes(normalized) || /\.(local|internal|localhost|test|invalid)$/.test(normalized)) throw new Error("Les adresses IP littérales et les hôtes locaux ou réservés ne sont pas autorisés.");
    return normalized;
  };
  const port = (input: unknown, label: string) => {
    if (!Number.isInteger(input) || Number(input) < 1 || Number(input) > 65535) throw new Error(`Port ${label} invalide.`);
    return Number(input);
  };
  if (v.imapSecure !== true) throw new Error("IMAP doit obligatoirement utiliser SSL/TLS.");
  if (v.smtpSecurity !== "ssl" && v.smtpSecurity !== "starttls") throw new Error("SMTP doit utiliser SSL/TLS ou STARTTLS.");
  return {
    imapHost: host(v.imapHost, "IMAP"), imapPort: port(v.imapPort, "IMAP"), imapSecure: true,
    smtpHost: host(v.smtpHost, "SMTP"), smtpPort: port(v.smtpPort, "SMTP"), smtpSecurity: v.smtpSecurity,
  };
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, d] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && d === 0) || (b === 0 && d === 2) || (b === 88 && d === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && d === 100))) return false;
    if (a === 203 && b === 0 && d === 113) return false;
    return true;
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) return isPublicAddress(value.slice(7));
    return /^[23]/.test(value) && !value.startsWith("2001:db8:");
  }
  return false;
}

async function assertPublicMailHost(host: string): Promise<void> {
  let addresses: Array<{ address: string; family: number }>;
  try { addresses = await lookup(host, { all: true, verbatim: true }); }
  catch { throw new Error(`Impossible de résoudre le serveur e-mail ${host}.`); }
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
    throw new Error("Le serveur e-mail doit résoudre uniquement vers des adresses IP publiques.");
  }
}

function createImapClient(account: StoredAccount): ImapFlow {
  return new ImapFlow({
    host: account.servers.imapHost,
    port: account.servers.imapPort,
    secure: true,
    auth: { user: account.email, pass: account.appPassword },
    logger: false,
    socketTimeout: 20_000,
    greetingTimeout: 10_000,
    tls: { minVersion: "TLSv1.2" },
  });
}

function createSmtpTransport(account: StoredAccount) {
  return nodemailer.createTransport({
    host: account.servers.smtpHost,
    port: account.servers.smtpPort,
    secure: account.servers.smtpSecurity === "ssl",
    requireTLS: account.servers.smtpSecurity === "starttls",
    auth: { user: account.email, pass: account.appPassword },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

function formatAddress(addresses: Array<{ name?: string; address?: string }> | undefined): string {
  return (addresses || []).map(item => item.name
    ? `"${item.name.replace(/["\\]/g, "")}" <${item.address || ""}>`
    : item.address || "").filter(Boolean).join(", ");
}

function buildSearchCriteria(query: string): Record<string, unknown> {
  const criteria: Record<string, unknown> = {};
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (const raw of tokens) {
    const token = raw.replace(/^"|"$/g, "");
    if (/^is:unread$/i.test(token)) criteria.seen = false;
    else if (/^is:read$/i.test(token)) criteria.seen = true;
    else if (/^from:/i.test(token)) criteria.from = token.slice(5);
    else if (/^to:/i.test(token)) criteria.to = token.slice(3);
    else if (/^subject:/i.test(token)) criteria.subject = token.slice(8);
    else if (/^after:/i.test(token)) {
      const date = new Date(token.slice(6).replace(/\//g, "-"));
      if (!Number.isNaN(date.getTime())) criteria.since = date;
    } else if (/^before:/i.test(token)) {
      const date = new Date(token.slice(7).replace(/\//g, "-"));
      if (!Number.isNaN(date.getTime())) criteria.before = date;
    } else {
      throw new Error(`Critère de recherche non pris en charge par IMAP : ${token}. Utilisez from:, to:, subject:, after:, before:, is:unread ou is:read.`);
    }
  }
  return criteria;
}

export class GmailService {
  private config: EmailConfig = { accounts: {}, personalSendEnabled: false };

  constructor() {
    this.config = this.loadConfig();
    // Purge legacy OAuth client secrets and refresh tokens from the previous draft format.
    try {
      const legacy = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      const hasLegacyOAuth = Boolean(legacy.clientId || legacy.clientSecret)
        || Object.values(legacy.accounts || {}).some((account: any) => Boolean(account?.refreshToken));
      if (hasLegacyOAuth) this.persist();
    } catch { /* no existing configuration to migrate */ }
  }

  private get configPath(): string {
    const override = process.env.LEANNA_EMAIL_CONFIG_PATH?.trim();
    const configBase = process.env.Leanna_CONFIG_PATH?.trim()
      || process.env.ELECTRON_APP_PATH?.trim()
      || Leanna_APP_ROOT;
    return override || path.join(configBase, ".Leanna-email.json");
  }

  private loadConfig(): EmailConfig {
    try {
      if (!fs.existsSync(this.configPath)) return { accounts: {}, personalSendEnabled: false };
      const data = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      const accounts: EmailConfig["accounts"] = {};
      for (const id of ["leanna", "personal"] as const) {
        const saved = data.accounts?.[id];
        if (typeof saved?.email !== "string" || typeof saved?.appPassword !== "string") continue;
        const password = isEncrypted(saved.appPassword) ? decrypt(saved.appPassword) : "";
        const provider: EmailProvider = id === "leanna" && saved.provider !== "gmail" ? "custom" : "gmail";
        const legacyServers = saved.provider === "infomaniak" ? INFOMANIAK_SERVERS : GMAIL_SERVERS;
        let servers: MailServerSettings;
        try { servers = provider === "custom" && saved.servers ? validateServerSettings(saved.servers) : legacyServers; }
        catch { continue; }
        if (password && !isEncrypted(password)) {
          accounts[id] = { email: saved.email, appPassword: password, provider, servers, connectedAt: saved.connectedAt || "" };
        }
      }
      return { accounts, personalSendEnabled: data.personalSendEnabled === true && Boolean(accounts.personal) };
    } catch {
      console.warn("[Email] Configuration locale illisible; intégration désactivée.");
      return { accounts: {}, personalSendEnabled: false };
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const accounts: EmailConfig["accounts"] = {};
    for (const id of ["leanna", "personal"] as const) {
      const account = this.config.accounts[id];
      if (account) accounts[id] = { ...account, appPassword: encrypt(account.appPassword) };
    }
    const temp = this.configPath + ".tmp";
    fs.writeFileSync(temp, JSON.stringify({
      accounts,
      personalSendEnabled: this.config.personalSendEnabled,
    }, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, this.configPath);
    try { fs.chmodSync(this.configPath, 0o600); } catch { /* Windows ACLs are managed by the OS. */ }
  }

  getSettings() {
    return {
      configured: Boolean(this.config.accounts.leanna || this.config.accounts.personal),
      personalSendEnabled: this.config.personalSendEnabled,
      protocol: "IMAP/SMTP",
      accounts: {
        leanna: this.accountStatus("leanna"),
        personal: this.accountStatus("personal"),
      },
    };
  }

  private accountStatus(id: GmailAccountId) {
    const account = this.config.accounts[id];
    return { connected: Boolean(account?.appPassword), email: account?.email || null, provider: account?.provider || null, servers: id === "leanna" ? account?.servers || null : undefined };
  }

  private requireAccount(id: GmailAccountId): StoredAccount {
    const account = this.config.accounts[id];
    if (!account) throw new Error(`Le compte e-mail ${id} n'est pas connecté. Configurez son adresse et son mot de passe dans Paramètres > E-mail.`);
    return account;
  }

  async connectAccount(id: GmailAccountId, email: string, appPassword: string, provider: EmailProvider = "gmail", serverInput?: unknown): Promise<void> {
    if (id === "personal" && provider !== "gmail") throw new Error("Le compte personnel conserve Gmail dans cette configuration.");
    if (id === "leanna" && provider !== "custom") throw new Error("Le compte dédié de Leanna doit utiliser la configuration IMAP/SMTP générique.");
    const servers = id === "personal" ? GMAIL_SERVERS : validateServerSettings(serverInput || DEFAULT_CUSTOM_SERVERS);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = provider === "gmail" ? appPassword.replace(/\s+/g, "") : appPassword.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Adresse e-mail invalide.");
    }
    if (normalizedPassword.length < 1 || normalizedPassword.length > 256) throw new Error("Le mot de passe de messagerie est invalide.");
    if (provider === "gmail" && normalizedPassword.length < 16) throw new Error("Le mot de passe d'application Gmail doit contenir au moins 16 caractères.");

    const candidate: StoredAccount = {
      email: normalizedEmail,
      appPassword: normalizedPassword,
      provider,
      servers,
      connectedAt: new Date().toISOString(),
    };

    await Promise.all([assertPublicMailHost(servers.imapHost), assertPublicMailHost(servers.smtpHost)]);

    const imap = createImapClient(candidate);
    try {
      await imap.connect();
      const lock = await imap.getMailboxLock("INBOX");
      lock.release();
    } catch {
      throw new Error("Connexion IMAP refusée. Vérifiez l'adresse, le mot de passe et l'activation de l'accès IMAP chez votre fournisseur.");
    } finally {
      try { await imap.logout(); } catch { /* connection may not have completed */ }
    }

    const smtp = createSmtpTransport(candidate);
    try {
      await smtp.verify();
    } catch {
      throw new Error("Connexion SMTP refusée. Vérifiez le mot de passe et les paramètres de sécurité de votre fournisseur.");
    } finally {
      smtp.close();
    }

    this.config.accounts[id] = candidate;
    if (id === "personal" && !this.config.personalSendEnabled) this.config.personalSendEnabled = false;
    this.persist();
  }

  setPersonalSendEnabled(enabled: boolean): void {
    if (enabled && !this.config.accounts.personal) {
      throw new Error("Connectez d'abord votre compte e-mail personnel.");
    }
    this.config.personalSendEnabled = enabled;
    this.persist();
  }

  async disconnect(id: GmailAccountId): Promise<void> {
    delete this.config.accounts[id];
    if (id === "personal") this.config.personalSendEnabled = false;
    this.persist();
  }

  async listMessages(id: GmailAccountId, query = "", maxResults = 20) {
    const account = this.requireAccount(id);
    await assertPublicMailHost(account.servers.imapHost);
    const client = createImapClient(account);
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const criteria = buildSearchCriteria(query);
        const found = await client.search(criteria as any, { uid: true });
        const uids = Array.isArray(found) ? found.slice(-Math.min(Math.max(maxResults, 1), MAX_RESULTS)).reverse() : [];
        const messages = uids.length
          ? await client.fetchAll(uids, { uid: true, envelope: true, internalDate: true, flags: true }, { uid: true })
          : [];
        return {
          account: id,
          email: account.email,
          totalEstimate: Array.isArray(found) ? found.length : 0,
          messages: messages.map(message => ({
            id: String(message.uid),
            threadId: String(message.uid),
            from: formatAddress(message.envelope?.from),
            to: formatAddress(message.envelope?.to),
            subject: message.envelope?.subject || "(sans objet)",
            date: message.internalDate?.toISOString() || message.envelope?.date?.toISOString() || "",
            snippet: "",
            unread: !message.flags?.has("\\Seen"),
          })),
        };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore disconnect errors */ }
    }
  }

  async readMessage(id: GmailAccountId, messageId: string) {
    if (!/^\d+$/.test(messageId)) throw new Error("Identifiant IMAP invalide.");
    const account = this.requireAccount(id);
    await assertPublicMailHost(account.servers.imapHost);
    const client = createImapClient(account);
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const message = await client.fetchOne(Number(messageId), {
          uid: true, envelope: true, internalDate: true, flags: true, source: true,
        }, { uid: true });
        if (!message?.source) throw new Error("E-mail introuvable dans la boîte de réception.");
        if (message.source.length > 25 * 1024 * 1024) throw new Error("E-mail trop volumineux pour être lu dans Leanna (limite : 25 Mo).");
        const parsed = await simpleParser(message.source);
        return {
          id: String(message.uid),
          threadId: String(message.uid),
          from: parsed.from?.text || formatAddress(message.envelope?.from),
          to: (parsed.to as any)?.text || formatAddress(message.envelope?.to),
          cc: (parsed.cc as any)?.text || "",
          subject: parsed.subject || "(sans objet)",
          date: parsed.date?.toISOString() || message.internalDate?.toISOString() || "",
          snippet: parsed.text?.slice(0, 240) || "",
          body: (parsed.text || parsed.html || "").slice(0, MAX_BODY_CHARS),
          attachments: parsed.attachments.map(item => ({
            filename: item.filename || "piece-jointe",
            mimeType: item.contentType,
            size: item.size,
          })),
        };
      } finally {
        lock.release();
      }
    } finally {
      try { await client.logout(); } catch { /* ignore disconnect errors */ }
    }
  }

  async sendMessage(id: GmailAccountId, to: string, subject: string, body: string, cc = "") {
    if (id === "personal" && !this.config.personalSendEnabled) {
      throw new Error("Envoi depuis le compte personnel désactivé. Activez cette autorisation dans Paramètres > E-mail.");
    }
    const account = this.requireAccount(id);
    await assertPublicMailHost(account.servers.smtpHost);
    const recipient = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error("Adresse destinataire invalide.");
    if (!subject.trim() || !body.trim()) throw new Error("L'objet et le corps du message sont obligatoires.");
    const ccValue = cc.trim();
    if (ccValue && (/[\r\n]/.test(ccValue) || !ccValue.split(",").every(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())))) {
      throw new Error("Adresse Cc invalide.");
    }
    if (Buffer.byteLength(body, "utf8") > 20 * 1024 * 1024) throw new Error("Message trop volumineux.");

    const transport = createSmtpTransport(account);
    try {
      const info = await transport.sendMail({
        from: account.email,
        to: recipient,
        ...(ccValue ? { cc: ccValue } : {}),
        subject,
        text: body,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      return { id: info.messageId, threadId: info.messageId };
    } finally {
      transport.close();
    }
  }

  async searchMessages(id: GmailAccountId, query: string, maxResults = 20) {
    if (!query.trim()) throw new Error("La recherche e-mail ne peut pas être vide.");
    return this.listMessages(id, query, maxResults);
  }
}

export const gmailService = new GmailService();
