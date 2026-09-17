import { Bot, type Context } from "grammy";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { Leanna_APP_ROOT, SELF_ROOT, hasProject } from "../utils/selfRoot.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { generateText, getActiveProvider } from "../utils/textGeneration.js";
import { buildSystemInstruction } from "../prompts/systemInstruction.js";
import { agentOrchestrator } from "../agents/index.js";
import type { TelegramConfig, TelegramStatus, TelegramBotInfo } from "./types.js";

const execAsync = promisify(exec);

interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export class TelegramService {
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private lastError: string | null = null;
  private botInfo: TelegramBotInfo | null = null;
  private config: TelegramConfig;
  private conversationHistory: Map<number, ChatMessage[]> = new Map();

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Chemin du fichier de persistance de la config Telegram
   */
  private getConfigPath(): string {
    return path.join(Leanna_APP_ROOT, ".Leanna-telegram.json");
  }

  /**
   * Charge la configuration depuis le fichier local et l'environnement
   */
  private loadConfig(): TelegramConfig {
    const defaultConfig: TelegramConfig = {
      botToken: process.env.TELEGRAM_BOT_TOKEN ? decrypt(process.env.TELEGRAM_BOT_TOKEN) : "",
      allowedUsers: [],
      autoStart: false,
      notificationsEnabled: true,
      defaultChatId: "",
    };

    try {
      const p = this.getConfigPath();
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        return {
          ...defaultConfig,
          ...data,
          botToken: data.botToken ? decrypt(data.botToken) : (defaultConfig.botToken || ""),
          allowedUsers: Array.isArray(data.allowedUsers) ? data.allowedUsers : [],
        };
      }
    } catch (e) {
      console.warn("[Telegram] Erreur lors du chargement de la config :", (e as Error).message);
    }

    return defaultConfig;
  }

  /**
   * Sauvegarde la configuration avec token chiffré
   */
  public saveConfig(newConfig: Partial<TelegramConfig>): void {
    const merged: TelegramConfig = {
      ...this.config,
      ...newConfig,
    };

    this.config = merged;

    try {
      const p = this.getConfigPath();
      const payloadToSave = {
        ...merged,
        botToken: merged.botToken ? encrypt(merged.botToken) : "",
      };
      fs.writeFileSync(p, JSON.stringify(payloadToSave, null, 2), "utf-8");
      console.log("[Telegram] Configuration sauvegardée.");
    } catch (e) {
      console.error("[Telegram] Erreur lors de la sauvegarde de la config :", e);
      throw e;
    }
  }

  public getConfig(): TelegramConfig {
    return { ...this.config };
  }

  public getStatus(): TelegramStatus {
    return {
      isRunning: this.isRunning,
      isConfigured: !!this.config.botToken && this.config.botToken.trim().length > 0,
      botInfo: this.botInfo,
      allowedUsersCount: this.config.allowedUsers.length,
      autoStart: this.config.autoStart,
      notificationsEnabled: this.config.notificationsEnabled,
      defaultChatId: this.config.defaultChatId,
      lastError: this.lastError,
    };
  }

  /**
   * Démarre le bot Telegram en mode polling
   */
  public async start(): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      return { success: true };
    }

    const token = this.config.botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.lastError = "Aucun token API Telegram configuré.";
      return { success: false, error: this.lastError };
    }

    try {
      this.bot = new Bot(token);

      // Récupérer les infos officielles du bot
      const me = await this.bot.api.getMe();
      this.botInfo = {
        id: me.id,
        username: me.username || "",
        firstName: me.first_name,
      };

      // Gestionnaire d'erreurs
      this.bot.catch((err) => {
        const errorMsg = err.error instanceof Error ? err.error.message : String(err.error);
        console.error(`[Telegram] Erreur de session :`, errorMsg);
        this.lastError = errorMsg;
      });

      // ─── Middleware de Sécurité : Whitelist ───────────────────────────────
      this.bot.use(async (ctx, next) => {
        const senderId = ctx.from?.id ? String(ctx.from.id) : "";
        const senderUsername = ctx.from?.username ? ctx.from.username.toLowerCase() : "";

        // Enregistrer automatiquement le defaultChatId si aucun n'est défini et qu'un message arrive
        if (!this.config.defaultChatId && senderId) {
          this.config.defaultChatId = senderId;
        }

        const allowedList = this.config.allowedUsers.map((u) => u.trim().toLowerCase().replace(/^@/, ""));

        // Cas 1 : Aucune liste blanche définie
        if (allowedList.length === 0) {
          await ctx.reply(
            `🔒 *Leanna OS — Configuration de Sécurité Requise*\n\n` +
            `Votre identifiant Telegram est : \`${senderId}\` ${senderUsername ? `(@${senderUsername})` : ""}\n\n` +
            `Pour sécuriser votre machine contre tout accès non autorisé, ` +
            `veuillez ajouter cet ID dans les **Paramètres Telegram** de l'application Leanna.`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        // Cas 2 : Vérifier si l'utilisateur est autorisé
        const isAuthorized =
          (senderId && allowedList.includes(senderId)) ||
          (senderUsername && allowedList.includes(senderUsername));

        if (!isAuthorized) {
          await ctx.reply(
            `⛔ *Accès Refusé*\n\n` +
            `Votre identifiant (\`${senderId}\`) n'est pas autorisé à interagir avec cette instance de Leanna.\n` +
            `Contactez l'administrateur ou ajoutez cet ID dans les paramètres.`,
            { parse_mode: "Markdown" }
          );
          return;
        }

        return next();
      });

      // ─── Commandes ─────────────────────────────────────────────────────────

      // /start
      this.bot.command("start", async (ctx) => {
        await ctx.reply(
          `👋 *Bonjour ${ctx.from?.first_name || ""} !*\n` +
          `Je suis connectée à votre instance de **Leanna OS**.\n\n` +
          `📌 *Commandes rapides :*\n` +
          `• \`/help\` — Guide et liste des commandes\n` +
          `• \`/status\` — État du système et projet actif\n` +
          `• \`/agent <mission>\` — Lancer une mission autonome\n` +
          `• \`/cmd <commande>\` — Exécuter dans le terminal\n` +
          `• \`/clear\` — Réinitialiser la mémoire du chat\n\n` +
          `💬 Vous pouvez aussi m'envoyer un message directement pour échanger !`,
          { parse_mode: "Markdown" }
        );
      });

      // /help
      this.bot.command("help", async (ctx) => {
        await ctx.reply(
          `📖 *Guide d'utilisation Leanna OS via Telegram*\n\n` +
          `*1. Chat IA*\n` +
          `Envoyez simplement vos questions, idées ou instructions. Je réponds avec le contexte de votre projet actif.\n\n` +
          `*2. Agents Autonomes*\n` +
          `Tapez \`/agent Développer une fonction de calcul de TVA\` pour déléguer la mission à la flotte d'agents.\n\n` +
          `*3. Commandes Système*\n` +
          `Tapez \`/cmd npm test\` ou \`/cmd git status\` pour exécuter une commande dans la racine du projet.\n\n` +
          `*4. Statut & Mémoire*\n` +
          `• \`/status\` pour voir le projet actif et la santé du système.\n` +
          `• \`/clear\` pour effacer l'historique du chat Telegram.`,
          { parse_mode: "Markdown" }
        );
      });

      // /status
      this.bot.command("status", async (ctx) => {
        const project = hasProject() ? SELF_ROOT : "Aucun projet actif";
        const provider = getActiveProvider();
        const mem = process.memoryUsage();
        const memMb = Math.round(mem.rss / 1024 / 1024);

        await ctx.reply(
          `🖥️ *État de Leanna OS*\n\n` +
          `📁 *Projet actif :* \`${project}\`\n` +
          `🧠 *Moteur IA :* \`${provider}\`\n` +
          `💾 *Mémoire RSS :* \`${memMb} Mo\`\n` +
          `🤖 *Bot connecté :* \`@${this.botInfo?.username}\`\n` +
          `🔔 *Notifications :* \`${this.config.notificationsEnabled ? "Activées" : "Désactivées"}\`\n` +
          `⏱️ *Uptime :* \`${Math.round(process.uptime() / 60)} minutes\``,
          { parse_mode: "Markdown" }
        );
      });

      // /clear
      this.bot.command("clear", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (chatId) {
          this.conversationHistory.delete(chatId);
        }
        await ctx.reply("🧹 Historique de conversation Telegram effacé.");
      });

      // /cmd
      this.bot.command("cmd", async (ctx) => {
        const commandText = ctx.match?.trim();
        if (!commandText) {
          await ctx.reply("Usage : `/cmd <votre commande>`\nExemple : `/cmd git status`", { parse_mode: "Markdown" });
          return;
        }

        // Filtre de sécurité basique
        const forbiddenPatterns = [
          /\brm\s+-rf\s+[\/\\]/i,
          /\bformat\s+[a-z]:/i,
          /\bdel\s+\/s\s+\/q/i,
          /\bshutdown\b/i,
        ];

        if (forbiddenPatterns.some((pattern) => pattern.test(commandText))) {
          await ctx.reply("⚠️ Commande rejetée par mesure de sécurité.");
          return;
        }

        const cwd = hasProject() ? SELF_ROOT : process.cwd();
        await ctx.reply(`⚡ Exécution de : \`${commandText}\`...`, { parse_mode: "Markdown" });

        try {
          const { stdout, stderr } = await execAsync(commandText, {
            cwd,
            timeout: 30000,
            maxBuffer: 1024 * 512,
          });

          const output = (stdout || stderr || "Commande terminée sans sortie.").trim();
          await this.sendLongMessage(ctx.chat.id, `📋 *Résultat :*\n\`\`\`\n${output}\n\`\`\``, { parse_mode: "Markdown" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await ctx.reply(`❌ *Erreur d'exécution :*\n\`\`\`\n${message}\n\`\`\``, { parse_mode: "Markdown" });
        }
      });

      // /agent
      this.bot.command("agent", async (ctx) => {
        const taskDescription = ctx.match?.trim();
        if (!taskDescription) {
          await ctx.reply("Usage : `/agent <description de la tâche>`\nExemple : `/agent analyse les dépendances`", { parse_mode: "Markdown" });
          return;
        }

        await ctx.reply(`🚀 *Mission agent acceptée !*\nMission : _"${taskDescription}"_\nJe vous notifie dès que l'exécution avance.`, { parse_mode: "Markdown" });

        try {
          // Créer une orchestration ou tâche
          const task = await agentOrchestrator.dispatchTask({
            title: `[Telegram] ${taskDescription.slice(0, 50)}`,
            description: taskDescription,
            assignedTo: "coder",
            priority: "medium",
          });

          await ctx.reply(`✅ Tâche initialisée (ID: \`${task.id}\`). L'agent travaille dessus...`, { parse_mode: "Markdown" });
        } catch (e) {
          await ctx.reply(`❌ Erreur lors du lancement de l'agent : ${(e as Error).message}`);
        }
      });

      // Messages vocaux
      this.bot.on("message:voice", async (ctx) => {
        await ctx.reply(
          `🎙️ *Message vocal reçu*\n` +
          `Durée : ${ctx.message.voice.duration}s.\n` +
          `_Note : La transcription vocale directe Telegram est prête pour vos échanges._`,
          { parse_mode: "Markdown" }
        );
      });

      // Gestion des messages texte généraux (Chat avec Leanna)
      this.bot.on("message:text", async (ctx) => {
        const userText = ctx.message.text.trim();
        if (userText.startsWith("/")) return; // Ne pas traiter les commandes ici

        const chatId = ctx.chat.id;
        let history = this.conversationHistory.get(chatId) || [];

        // Maintenir un historique de 12 tours max
        if (history.length > 12) {
          history = history.slice(history.length - 12);
        }

        // Afficher l'action de frappe (typing)
        await ctx.replyWithChatAction("typing");

        try {
          const sysPrompt = buildSystemInstruction({
            language: "fr",
            responseStyle: "concis",
            workspace: hasProject() ? SELF_ROOT : undefined,
          });

          // Formater l'historique conversationnel pour le prompt
          let contextHistory = "";
          if (history.length > 0) {
            contextHistory = "\n\n[Historique de la conversation Telegram]\n" +
              history.map((m) => `${m.role === "user" ? "Utilisateur" : "Leanna"}: ${m.text}`).join("\n");
          }

          const fullPrompt = `${contextHistory}\n\nUtilisateur: ${userText}\n\nRéponds de façon utile, claire et concise.`;

          const result = await generateText({
            prompt: fullPrompt,
            systemPrompt: sysPrompt,
            temperature: 0.7,
            maxTokens: 2048,
          });

          const replyText = result.text.trim() || "Je n'ai pas pu formuler de réponse.";

          // Enregistrer dans l'historique
          history.push({ role: "user", text: userText });
          history.push({ role: "model", text: replyText });
          this.conversationHistory.set(chatId, history);

          await this.sendLongMessage(chatId, replyText);
        } catch (err) {
          console.error("[Telegram] Erreur lors de la réponse IA :", err);
          await ctx.reply(`⚠️ Désolé, une erreur est survenue lors de la génération de ma réponse : ${(err as Error).message}`);
        }
      });

      // Démarrage effectif du long polling
      this.bot.start({
        onStart: (botInfo) => {
          this.isRunning = true;
          this.lastError = null;
          console.log(`[Telegram] ✅ Bot @${botInfo.username} démarré avec succès (mode Polling).`);
        },
      }).catch((err) => {
        this.isRunning = false;
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = msg;
        console.error("[Telegram] ❌ Échec du démarrage du polling :", msg);
      });

      this.isRunning = true;
      this.lastError = null;
      return { success: true };
    } catch (e) {
      this.isRunning = false;
      const msg = e instanceof Error ? e.message : String(e);
      this.lastError = msg;
      console.error("[Telegram] Erreur start() :", msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Arrête proprement le bot
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) return;

    try {
      await this.bot.stop();
      this.isRunning = false;
      console.log("[Telegram] 🛑 Bot arrêté proprement.");
    } catch (e) {
      console.warn("[Telegram] Erreur lors de l'arrêt :", (e as Error).message);
    } finally {
      this.bot = null;
      this.isRunning = false;
    }
  }

  /**
   * Découpe et envoie les messages trop longs (> 4000 caractères)
   */
  public async sendLongMessage(
    chatId: number | string,
    text: string,
    options?: { parse_mode?: "Markdown" | "HTML" }
  ): Promise<void> {
    if (!this.bot) {
      throw new Error("Bot Telegram non initialisé.");
    }

    const MAX_CHUNK = 3900;
    if (text.length <= MAX_CHUNK) {
      try {
        await this.bot.api.sendMessage(chatId, text, options);
      } catch (err) {
        // En cas d'erreur de parsing Markdown, envoyer en texte brut
        await this.bot.api.sendMessage(chatId, text);
      }
      return;
    }

    // Découpage propre par paragraphes ou lignes
    let remaining = text;
    while (remaining.length > 0) {
      let chunkSize = Math.min(MAX_CHUNK, remaining.length);
      if (chunkSize < remaining.length) {
        const lastNewline = remaining.lastIndexOf("\n", chunkSize);
        if (lastNewline > MAX_CHUNK * 0.7) {
          chunkSize = lastNewline + 1;
        }
      }
      const chunk = remaining.slice(0, chunkSize);
      remaining = remaining.slice(chunkSize);

      try {
        await this.bot.api.sendMessage(chatId, chunk, options);
      } catch {
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }

  /**
   * Envoie une notification vers le(s) utilisateur(s) configuré(s)
   */
  public async notify(message: string): Promise<boolean> {
    if (!this.isRunning || !this.bot) return false;
    if (!this.config.notificationsEnabled) return false;

    let targetChatId = this.config.defaultChatId;

    // Si pas de defaultChatId, chercher dans les allowedUsers un ID numérique
    if (!targetChatId) {
      targetChatId = this.config.allowedUsers.find((u) => /^\d+$/.test(u.trim()));
    }

    if (!targetChatId) {
      return false;
    }

    try {
      await this.sendLongMessage(targetChatId, `🔔 *Notification Leanna OS*\n\n${message}`, {
        parse_mode: "Markdown",
      });
      return true;
    } catch (e) {
      console.warn("[Telegram] Notification non délivrée :", (e as Error).message);
      return false;
    }
  }
}

export const telegramService = new TelegramService();
