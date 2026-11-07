import { useCallback, useEffect, useState } from "react";
import { Mail, Unlink, Save, ShieldCheck, RefreshCw } from "lucide-react";
import { Section, Field, TextInput, SecretInput, SectionDivider } from "./SettingsPrimitives.js";

type MailServers = { imapHost: string; imapPort: number; imapSecurity: "ssl" | "starttls"; smtpHost: string; smtpPort: number; smtpSecurity: "ssl" | "starttls" };
type Account = { connected: boolean; email: string | null; provider?: "gmail" | "custom" | null; servers?: MailServers | null };
type GmailSettings = {
  configured: boolean;
  protocol: string;
  personalSendEnabled: boolean;
  accounts: { leanna: Account; personal: Account };
};

export function EmailSection() {
  const [settings, setSettings] = useState<GmailSettings | null>(null);
  const [servers, setServers] = useState<MailServers>({ imapHost: "", imapPort: 993, imapSecurity: "ssl", smtpHost: "", smtpPort: 465, smtpSecurity: "ssl" });
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
      if (data.data.accounts.leanna.servers) setServers(data.data.accounts.leanna.servers);
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
        body: JSON.stringify({ account: id, email: values.email, appPassword: values.appPassword, provider: id === "leanna" ? "custom" : "gmail", ...(id === "leanna" ? { servers } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Connexion e-mail impossible.");
      setSettings(data.data);
      setCredentials(current => ({ ...current, [id]: { ...current[id], appPassword: "" } }));
      setFeedback({ type: "success", message: `Compte ${id === "leanna" ? "Leanna" : "personnel"} connecté en ${id === "leanna" ? "IMAP/SMTP personnalisé" : "Gmail"}. Les identifiants sont chiffrés localement.` });
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const disconnect = async (id: "leanna" | "personal") => {
    if (!window.confirm(`Déconnecter le compte e-mail ${id === "leanna" ? "de Leanna" : "personnel"} ?`)) return;
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
      setFeedback({ type: "success", message: "Compte e-mail déconnecté et identifiants locaux supprimés." });
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
          {id === "leanna" && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border-base)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Serveur entrant — IMAP</div>
              <Field label="Hôte IMAP"><TextInput value={servers.imapHost} onChange={value => setServers(current => ({ ...current, imapHost: value }))} placeholder="imap.votre-fournisseur.fr" /></Field>
              <Field label="Port IMAP"><TextInput value={String(servers.imapPort)} onChange={value => setServers(current => ({ ...current, imapPort: Number(value) }))} placeholder="993 ou 143" /></Field>
              <Field label="Sécurité IMAP">
                <select value={servers.imapSecurity} onChange={event => setServers(current => ({ ...current, imapSecurity: event.target.value as "ssl" | "starttls" }))} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-base)", background: "var(--bg-base)", color: "var(--text-primary)" }}>
                  <option value="ssl">SSL/TLS implicite (souvent port 993)</option>
                  <option value="starttls">STARTTLS obligatoire (souvent port 143)</option>
                </select>
              </Field>
              <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Serveur sortant — SMTP</div>
              <Field label="Hôte SMTP"><TextInput value={servers.smtpHost} onChange={value => setServers(current => ({ ...current, smtpHost: value }))} placeholder="smtp.votre-fournisseur.fr" /></Field>
              <Field label="Port SMTP"><TextInput value={String(servers.smtpPort)} onChange={value => setServers(current => ({ ...current, smtpPort: Number(value) }))} placeholder="465 ou 587" /></Field>
              <Field label="Sécurité SMTP">
                <select value={servers.smtpSecurity} onChange={event => setServers(current => ({ ...current, smtpSecurity: event.target.value as "ssl" | "starttls" }))} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-base)", background: "var(--bg-base)", color: "var(--text-primary)" }}>
                  <option value="ssl">SSL/TLS implicite (souvent port 465)</option>
                  <option value="starttls">STARTTLS obligatoire (souvent port 587)</option>
                </select>
              </Field>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Aucune connexion en clair. Les serveurs locaux ou réservés sont refusés.</p>
            </div>
          )}
          <Field label="Adresse e-mail">
            <TextInput value={values.email} onChange={value => setCredentials(current => ({ ...current, [id]: { ...current[id], email: value } }))} placeholder={id === "leanna" ? "leanna@votredomaine.fr" : "adresse@gmail.com"} />
          </Field>
          <Field label={id === "leanna" ? "Mot de passe de la boîte e-mail" : "Mot de passe d'application"} hint={id === "leanna" ? "Mot de passe de la boîte ou mot de passe dédié fourni par votre hébergeur. Il sera chiffré localement." : "Mot de passe d'application Google (16 caractères), pas le mot de passe habituel du compte."}>
            <SecretInput value={values.appPassword} onChange={value => setCredentials(current => ({ ...current, [id]: { ...current[id], appPassword: value } }))} placeholder={id === "leanna" ? "Mot de passe de messagerie" : "xxxx xxxx xxxx xxxx"} />
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
      <Section id="gmail-imap-smtp" icon={Mail} title="Messagerie e-mail" description="Compte dédié de Leanna configurable avec n'importe quel fournisseur compatible IMAP/SMTP, sans OAuth2.">
        <div className="rounded-xl border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
          <ShieldCheck size={15} className="mr-2 inline" />
          IMAP/SMTP avec TLS obligatoire (TLS 1.2 minimum). Les mots de passe sont chiffrés localement, jamais renvoyés à l'interface ni transmis aux agents. La connexion vérifie IMAP et SMTP avant d'enregistrer le compte.
        </div>
        <div className="rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
          Renseignez les paramètres IMAP/SMTP fournis par votre hébergeur. IMAP et SMTP imposent SSL/TLS ou STARTTLS. Utilisez l'adresse complète comme identifiant. Leanna vérifie les deux connexions avant d'enregistrer la configuration.
        </div>
        {accountCard("leanna", "Compte dédié de Leanna", "Boîte utilisée par défaut pour consulter et envoyer les e-mails. Chaque envoi exige une confirmation explicite.")}
        <SectionDivider label="Compte personnel — inchangé" />
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
