import { z } from "zod";
import { Skill } from "./base.js";
import { telegramService } from "../telegram/TelegramService.js";

export const telegramSkill: Skill = {
  name: "telegram",
  declarations: [
    {
      name: "telegram_notify",
      description: "Envoyer une notification, une alerte ou un message direct sur le compte Telegram de l'utilisateur.",
      parameters: z.object({
        message: z.string().describe("Le contenu du message à envoyer sur Telegram"),
        chatId: z.string().optional().describe("Optionnel : un identifiant de chat spécifique. Si non fourni, envoie au chat configuré par défaut."),
      }),
    },
    {
      name: "telegram_get_status",
      description: "Obtenir l'état du bot Telegram (en cours d'exécution, configuré, username, etc.)",
      parameters: z.object({}),
    },
  ],
  handleToolCall: async (name, args) => {
    if (name === "telegram_notify") {
      const { message, chatId } = args as { message: string; chatId?: string };
      if (!message || message.trim().length === 0) {
        return { success: false, error: "Le message ne peut pas être vide." };
      }

      if (chatId) {
        try {
          await telegramService.sendLongMessage(chatId, message);
          return { success: true, delivered: true, detail: `Message envoyé au chat ${chatId}` };
        } catch (e) {
          return { success: false, delivered: false, error: (e as Error).message };
        }
      }

      const delivered = await telegramService.notify(message);
      return {
        success: delivered,
        delivered,
        detail: delivered
          ? "Notification envoyée avec succès sur Telegram."
          : "Le bot Telegram n'est pas actif ou aucun destinataire par défaut n'est configuré.",
      };
    }

    if (name === "telegram_get_status") {
      return telegramService.getStatus();
    }

    throw new Error(`Outil inconnu dans telegramSkill: ${name}`);
  },
};
