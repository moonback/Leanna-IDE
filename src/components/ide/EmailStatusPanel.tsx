import { Mail, X } from "lucide-react";
import { EmailSection } from "../settings/EmailSection.js";

/** Panneau de configuration e-mail intégré au dock droit, sur le modèle Telegram. */
export function EmailStatusPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-base)" }}>
        <div className="flex min-w-0 items-center gap-2">
          <Mail size={16} style={{ color: "var(--accent-primary)" }} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Connexion e-mail</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Comptes et paramètres IMAP/SMTP</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)]" style={{ color: "var(--text-muted)" }} aria-label="Fermer le panneau e-mail">
          <X size={15} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <EmailSection />
      </div>
    </section>
  );
}
