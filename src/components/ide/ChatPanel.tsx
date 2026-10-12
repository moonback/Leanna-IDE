// Le ChatPanel a été refactorisé en modules dans le dossier ./ChatPanel/.
// Ce fichier conserve le chemin d'import historique
// (`components/ide/ChatPanel.js`) en ré-exportant l'API publique.
export { ChatPanel, default } from './ChatPanel/index.js';
export type { ChatPanelProps, PendingChatMessage } from './ChatPanel/index.js';
