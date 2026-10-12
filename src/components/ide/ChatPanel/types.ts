// ─── Types partagés du ChatPanel ────────────────────────────────────────────────

/** Message en attente d'envoi (file d'attente quand l'assistant est occupé). */
export interface PendingChatMessage {
  text: string;
  displayText?: string;
}

/** Props publiques du ChatPanel — API stable consommée par IdeView. */
export interface ChatPanelProps {
  pendingMessage?: PendingChatMessage | null;
  onPendingMessageConsumed?: () => void;
  onDockedChange?: (docked: boolean) => void;
  onWidthChange?: (width: number) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  initialDocked?: boolean;
  onClose?: () => void;
}
