import { useCallback, useEffect, useState } from "react";
import { Mail, Link2, Unlink, Save, ShieldCheck, RefreshCw, ExternalLink } from "lucide-react";
import { Section, Field, TextInput, SecretInput, SectionDivider } from "./SettingsPrimitives.js";

type Account = { connected: boolean; email: string | null };
type GmailSettings = {
  configured: boolean;
  clientId: string;
  hasClientSecret: boolean;
  redirectUri: string;
  personalSendEnabled: boolean;
  accounts: { leanna: Account; personal: Account };
};

export function EmailSection() {
  const [settings, setSettings] = useState<GmailSettings | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/email/settings");
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Impossible de lire la configuration Gmail.");
      setSettings(data.data);
      setClientId(data.data.clientId || "");
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveCredentials = async () => {
    setBusy("credentials");
    setFeedback(null);
    try {
      const response = await fetch("/api/email/oauth/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Enregistrement impossible.");
      setSettings(data.data);
      setClientSecret("");
      setFeedback({ type: "success", message: "Identifiants OAuth enregistrés de manière chiffrée." });
    } catch (error) {
      setFeedback({ type: "error", message: (error as Error).message });
    } finally {
      setBusy("");
    }
  };

  const connect = async (account: "leanna" | "personal") => {
    setBusy(account);
    setFeedback(null);
    try {
      const response = await fetch("/api/email/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success" || !data.url) throw new Error(data.error || "Impossible de démarrer OAuth.");
      const popup = window.open(data.url, "leanna-gmail-oauth", "popup,width=620,height=760");
      if (!popup) throw new Error("La fenêtre Google a été bloquée. Autorisez les fenêtres popup pour Leanna.");
      const started = Date.now();
      const poll = window.setInterval(async () => {
        if (popup.closed || Date.now() - started > 180_000) {
          window.clearInterval(poll);
          await load();
          setBusy("");
          setFeedback({ type: "success", message: "État de connexion Gmail actualisé." });
        }
      }, 900);
    } catch (error) {
      setBusy("");
      setFeedback({ type: "error", message: (error as Error).message });
    }
  };

  const disconnect = async (account: "leanna" | "personal") => {
    if (!window.confirm(`Déconnecter le compte Gmail ${account === "leanna" ? "de Leanna" : "personnel"} ?`)) return;
    setBusy(account);
    try {
      const response = await fetch("/api/email/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "success") throw new Error(data.error || "Déconnexion impossible.");
      setSettings(data.data);
      setFeedback({ type: "success", message: "Compte Gmail déconnecté." });
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
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-base)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              <Mail size={16} /> {title}
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
            <p className="mt-2 text-xs font-mono" style={{ color: account?.connected ? "var(--color-success, #16a34a)" : "var(--text-muted)" }}>
              {account?.connected ? account.email : "Non connecté"}
            </p>
          </div>
          {account?.connected ? (
            <button type="button" disabled={!!busy} onClick={() => void disconnect(id)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
              <Unlink size={14} /> Déconnecter
            </button>
          ) : (
            <button type="button" disabled={!!busy || !settings?.configured} onClick={() => void connect(id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent-primary)", color: "white" }}>
              <Link2 size={14} /> {busy === id ? "Connexion…" : "Connecter Gmail"}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>Chargement des paramètres Gmail…</div>;

  return (
    <div className="flex flex-col gap-5">
      <Section id="gmail-oauth" icon={Mail} title="Connexion Gmail" description="Connectez séparément la boîte dédiée de Leanna et votre boîte personnelle. Les deux comptes peuvent être chez Google, avec des autorisations indépendantes.">
        <div className="rounded-xl border p-3 text-xs leading-relaxed" style={{ borderColor: "var(--border-base)", color: "var(--text-secondary)" }}>
          <ShieldCheck size={15} className="mr-2 inline" />
          Leanna utilise OAuth 2.0 et l'API Gmail. Les jetons de renouvellement et le secret OAuth sont chiffrés sur le disque local. Aucun mot de passe Gmail n'est demandé.
        </div>
        <Field label="Google OAuth Client ID" hint="Identifiant de type …apps.googleusercontent.com, créé dans Google Cloud Console.">
          <TextInput value={clientId} onChange={setClientId} placeholder="1234567890-….apps.googleusercontent.com" />
        </Field>
        <Field label="Google OAuth Client Secret" hint={settings?.hasClientSecret ? "Un secret est déjà enregistré. Laissez vide pour le conserver." : "Secret fourni par Google Cloud Console."}>
          <SecretInput value={clientSecret} onChange={setClientSecret} placeholder={settings?.hasClientSecret ? "Secret enregistré — saisir uniquement pour le remplacer" : "Client secret"} />
        </Field>
        <Field label="URI de redirection autorisée" hint="Ajoutez cette adresse exacte dans les identifiants OAuth Google (type application Web).">
          <div className="flex gap-2">
            <TextInput value={settings?.redirectUri || ""} onChange={() => undefined} readOnly />
            <button type="button" onClick={() => void navigator.clipboard.writeText(settings?.redirectUri || "")} className="rounded-lg border px-3 text-xs" style={{ borderColor: "var(--border-base)" }}>Copier</button>
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy === "credentials" || !clientId.trim() || (!clientSecret.trim() && !settings?.hasClientSecret)} onClick={() => void saveCredentials()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent-primary)", color: "white" }}>
            <Save size={14} /> {busy === "credentials" ? "Enregistrement…" : "Enregistrer les identifiants"}
          </button>
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--accent-primary)" }}>
            Google Cloud Console <ExternalLink size={12} />
          </a>
        </div>
        <SectionDivider label="Comptes Gmail" />
        {accountCard("leanna", "Compte dédié de Leanna", "Adresse d'expédition par défaut de l'assistante. Les envois demandent toujours une confirmation.")}
        {accountCard("personal", "Votre compte personnel", "Leanna peut y consulter vos messages. L'envoi depuis cette adresse reste désactivé par défaut.")}
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-base)" }}>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={settings?.personalSendEnabled || false} disabled={busy === "permission" || !settings?.accounts.personal.connected} onChange={e => void togglePersonalSend(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Autoriser l'envoi depuis mon compte personnel</span>
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>Autorisation distincte. Même activée, chaque envoi nécessite une confirmation explicite.</span>
            </span>
          </label>
        </div>
      </Section>
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{settings?.configured ? "OAuth configuré" : "Configuration OAuth requise"}</span>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-base)" }}><RefreshCw size={13} /> Actualiser</button>
      </div>
      {feedback && <div role="status" className="rounded-lg border p-3 text-xs" style={{ borderColor: feedback.type === "error" ? "var(--color-error, #dc2626)" : "var(--border-base)", color: feedback.type === "error" ? "var(--color-error, #dc2626)" : "var(--text-secondary)" }}>{feedback.message}</div>}
    </div>
  );
}
