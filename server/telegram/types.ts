export interface TelegramConfig {
  botToken?: string;
  allowedUsers: string[];
  autoStart: boolean;
  notificationsEnabled: boolean;
  defaultChatId?: string;
}

export interface TelegramBotInfo {
  id: number;
  username: string;
  firstName: string;
}

export interface TelegramStatus {
  isRunning: boolean;
  isConfigured: boolean;
  botInfo: TelegramBotInfo | null;
  allowedUsersCount: number;
  autoStart: boolean;
  notificationsEnabled: boolean;
  defaultChatId?: string;
  lastError: string | null;
}
