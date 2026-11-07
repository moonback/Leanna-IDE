import { useCallback, useEffect, useState } from "react";
import { Mail, Unlink, Save, ShieldCheck, RefreshCw } from "lucide-react";
import { Section, Field, TextInput, SecretInput, SectionDivider } from "./SettingsPrimitives.js";

type Account = { connected: boolean; email: string | null };
type GmailSettings = {
  configured: boolean;
  protocol: string;
  personalSendEnabled: boolean;
  accounts: { leanna: Account; personal: Account };
};

export function EmailSection() {
  const [settings, setSettings] = useState<GmailSettings | null>(null);
  const [credentials, setCredentials] = useState({
    leanna: { email: "", appPassword: "" },
    personal: { email: "", appPassword: "" },
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/email/settings");
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Impossible de lire la configuration e-mail.");
      setSettings(data.data);
      setCredentials(current => ({
        leanna: { ...current.leanna, email: data.data.accounts.leanna.email || current.leanna.email },
        personal: { ...current.personal, email: data.data.accounts.personal.email || current.personal.email },
      }));
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connect = async (id: "leanna" | "personal") => {
    const values = credentials[id];
    setBusy(id);
    setFeedback(null);
    try {
      const response = await fetch("/api/email/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: id, email: values.email, appPassword: values.appPassword }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Connexion Gmail impossible.");
      setSettings(data.data);
      setCredentials(current => ({ ...current, [id]: { ...current[id], appPassword: "" } }));
      setFeedback({ type: "success", message: `Compte ${id === "leanna" ? "Leanna" : "personnel"} connecté. Les identifiants sont chiffrés localement.` });
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async (id: "leanna" | "personal") => {
    if (!window.confirm(`Déconnecter le compte Gmail ${id === "leanna" ? "de Leanna" : "personnel"} ?`)) return;
    setBusy(id);
    try {
      const response = await fetch("/api/email/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: id }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Déconnexion impossible.");
      setSettings(data.data);
      setFeedback({ type: "success", message: "Compte Gmail déconnecté et identifiants locaux supprimés." });
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const togglePersonalSend = async (enabled: boolean) => {
    setBusy("permission");
    try {
      const response = await fetch("/api/email/permissions/personal-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Modification de permission impossible.");
      setSettings(data.data);
      setFeedback({ type: "success", message: enabled ? "L'envoi depuis le compte personnel est autorisé." : "L'envoi depuis le compte personnel est désactivé." });
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const accountCard = (id: "leanna" | "personal", title: string, description: string) => {
    const account = settings?.accounts[id];
    const values = credentials[id];
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-base)", background: "var(--bg-elevated)" }}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <Mail size={16} /> {title}
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
        {account?.connected && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="break-all text-xs font-mono" style={{ color: "var(--color-success, #16a34a)" }}>{account.email}</span>
            <button type="button" disabled={!!busy} onClick={() => void disconnect(id)} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
              <Unlink size={14} /> Déconnecter
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Adresse Gmail">
            <TextInput value={values.email} onChange={value => setCredentials(current => ({ ...current, [id]: { ...current[id], email: value } }))} placeholder="adresse@gmail.com" />
          </Field>
          <Field label="Mot de passe d'application" hint="Saisissez le mot de passe d'application Google (16 caractères), pas le mot de passe habituel du compte.">
            <SecretInput value={values.appPassword} onChange={value => setCredentials(current => ({ ...current, [id]: { ...current[id], appPassword: value } }))} placeholder="xxxx xxxx xxxx xxxx" />
          </Field>
          <button type="button" disabled={!!busy || !values.email.trim() || !values.appPassword.trim()} onClick={() => void connect(id)} className="inline-flex items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent-primary)", color: "white" }}>
            <Save size={14} /> {busy === id ? "Vérification IMAP/SMTP…" : account?.connected ? "Mettre à jour les identifiants" : "Connecter le compte"}
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Chargement des paramètres e-mail…</div>;

  return (
    <div className="flex flex-col gap-5">
      <Section id="gmail-imap-smtp" icon={Mail} title="Comptes Gmail" description="Connexion directe aux serveurs Gmail, sans OAuth ni fenêtre de connexion Google.">
        <div className="rounded-xl border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
          <ShieldCheck size={15} className="mr-2 inline" />
          IMAP/SMTP avec chiffrement TLS. Les mots de passe d'application sont chiffrés localement et ne sont jamais renvoyés à l'interface ni transmis aux agents. La connexion vérifie les deux protocoles avant d'enregistrer le compte.
        </div>
        <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
          Activez la validation en deux étapes dans votre compte Google, puis créez un mot de passe d'application. Cette option peut être indisponible pour certains comptes Google Workspace ou comptes protégés par des règles de sécurité avancées.
          {" "}<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>Créer un mot de passe d'application</a>
        </div>
        {accountCard("leanna", "Compte dédié de Leanna", "Boîte utilisée par défaut pour consulter et envoyer les e-mails. Chaque envoi exige une confirmation explicite.")}
        <SectionDivider label="Compte personnel" />
        {accountCard("personal", "Votre compte Gmail personnel", "Leanna peut consulter cette boîte. L'envoi depuis cette adresse reste désactivé par défaut.")}
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-base)" }}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={settings?.personalSendEnabled || false} disabled={busy === "permission" || !settings?.accounts.personal.connected} onChange={e => void togglePersonalSend(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Autoriser l'envoi depuis mon compte personnel</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>Même activée, cette autorisation ne remplace jamais la confirmation demandée pour chaque message.</span>
            </span>
          </label>
        </div>
      </Section>
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{settings?.configured ? "Au moins un compte est connecté — IMAP/SMTP" : "Aucun compte connecté"}</span>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-base)" }}><RefreshCw size={13} /> Actualiser</button>
      </div>
      {feedback && <div role="status" className="rounded-lg border p-3 text-xs" style={{ borderColor: feedback.type === "error" ? "var(--color-error, #dc2626)" : "var(--border-base)", color: feedback.type === "error" ? "var(--color-error, #dc2626)" : "var(--text-secondary)" }}>{feedback.message}</div>}
    </div>
  );
}
