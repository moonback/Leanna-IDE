import { z } from "zod";
import type { Skill } from "./base.js";
import { gmailService, type GmailAccountId } from "../email/GmailService.js";
import { requestConfirmation } from "../utils/confirmationBridge.js";

const accountSchema = z.enum(["leanna", "personal"]).default("leanna");

export const emailSkill: Skill = {
  name: "email",
  permissions: ["network"],
  toolPermissions: {
    email_check_new: ["read", "network"],
    email_list_messages: ["read", "network"],
    email_read_message: ["read", "network"],
    email_search_messages: ["read", "network"],
    email_send_message: ["network"],
  },
  declarations: [
    {
      name: "email_check_new",
      description: "Vérifie les nouveaux e-mails non lus des deux comptes Gmail connectés (compte Leanna et compte personnel). À utiliser quand l'utilisateur demande s'il a reçu de nouveaux mails.",
      parameters: z.object({ maxResults: z.number().int().min(1).max(20).optional().default(10) }),
    },
    {
      name: "email_list_messages",
      description: "Liste les derniers e-mails d'un compte Gmail. Le compte peut être 'leanna' ou 'personal'.",
      parameters: z.object({ account: accountSchema, maxResults: z.number().int().min(1).max(50).optional().default(20) }),
    },
    {
      name: "email_read_message",
      description: "Lit le contenu d'un e-mail Gmail identifié par son ID. Il faut préciser le compte et l'identifiant de message.",
      parameters: z.object({ account: accountSchema, messageId: z.string().min(1) }),
    },
    {
      name: "email_search_messages",
      description: "Recherche dans Gmail avec la syntaxe native Gmail (from:, to:, subject:, after:, before:, has:attachment, is:unread, etc.).",
      parameters: z.object({ account: accountSchema, query: z.string().min(1), maxResults: z.number().int().min(1).max(50).optional().default(20) }),
    },
    {
      name: "email_send_message",
      description: "Prépare et envoie un e-mail depuis Gmail. Par défaut, envoie depuis le compte dédié de Leanna vers l'adresse du compte personnel connecté. Toute expédition exige une confirmation explicite de l'utilisateur. L'envoi depuis le compte personnel est désactivé par défaut.",
      parameters: z.object({
        account: accountSchema.optional().default("leanna"),
        to: z.string().email().optional(),
        cc: z.string().optional(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }),
    },
  ],
  handleToolCall: async (name, args, context) => {
    if (name === "email_check_new") {
      const maxResults = Number(args.maxResults) || 10;
      const results = await Promise.all((["leanna", "personal"] as GmailAccountId[]).map(async account => {
        try {
          return await gmailService.searchMessages(account, "is:unread", maxResults);
        } catch (error) {
          return { account, error: (error as Error).message, messages: [] };
        }
      }));
      return {
        success: true,
        accounts: results,
        unreadCount: results.reduce((sum: number, item: any) => sum + (item.messages?.length || 0), 0),
        note: "Les deux boîtes ont été vérifiées indépendamment. Les erreurs d'un compte n'empêchent pas la lecture de l'autre.",
      };
    }
    if (name === "email_list_messages") {
      return gmailService.listMessages(args.account as GmailAccountId, "", Number(args.maxResults) || 20);
    }
    if (name === "email_read_message") {
      return gmailService.readMessage(args.account as GmailAccountId, String(args.messageId));
    }
    if (name === "email_search_messages") {
      return gmailService.searchMessages(args.account as GmailAccountId, String(args.query), Number(args.maxResults) || 20);
    }
    if (name === "email_send_message") {
      const account = (args.account || "leanna") as GmailAccountId;
      const settings = gmailService.getSettings();
      const to = typeof args.to === "string" && args.to.trim()
        ? args.to.trim()
        : account === "leanna" ? settings.accounts.personal.email || "" : "";
      if (!to) {
        return { success: false, error: "Aucun destinataire fourni et aucune adresse personnelle Gmail n'est connectée." };
      }
      if (!context?.emitToClient) {
        return { success: false, error: "Confirmation interactive indisponible : l'envoi est refusé par sécurité." };
      }
      const preview = String(args.body).slice(0, 500);
      const approved = await requestConfirmation(
        `${to} — ${String(args.subject)}`,
        "send-email",
        context.emitToClient,
        `Envoyer depuis ${account === "leanna" ? "le compte Gmail de Leanna" : "votre compte Gmail personnel"} vers ${to} ?\nObjet : ${args.subject}\n\n${preview}`,
        "high",
      );
      if (!approved) return { success: false, error: "Envoi annulé ou refusé par l'utilisateur." };
      const sent = await gmailService.sendMessage(account, to, String(args.subject), String(args.body), String(args.cc || ""));
      return { success: true, sent: true, account, to, messageId: sent.id, threadId: sent.threadId };
    }
    throw new Error(`Outil e-mail inconnu : ${name}`);
  },
};
