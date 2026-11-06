import { useEffect, useState } from 'react';
import { Activity, AudioLines, Brain, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { useToast } from '../ui/Toast.js';

type Config = {
  enabled: boolean; name: string; provider: 'gemini' | 'openrouter'; model: string; voice: string;
  systemPrompt: string; temperature: number; topP: number; maxTokens: number; language: string;
  responseStyle: 'concise' | 'balanced' | 'detailed'; contradictionLevel: number;
  useSpeech: boolean; maxRounds: number; maxDurationSeconds: number; autoCreateTasks: boolean;
};
const defaults: Config = {
  enabled: true, name: 'Roxane', provider: 'gemini', model: 'gemini-3.8-flash', voice: 'Kore',
  systemPrompt: "Tu es Roxane, une analyste indépendante, exigeante et constructive. Tu examines les hypothèses, cherches les angles morts, compares les alternatives et contestes les propositions insuffisamment justifiées. Tu ne contredis pas artificiellement : reconnais clairement les bons arguments. Réponds en français, à l'oral, de manière naturelle et concise.",
  temperature: 0.75, topP: 0.9, maxTokens: 1200, language: 'fr', responseStyle: 'balanced',
  contradictionLevel: 80, useSpeech: true, maxRounds: 3, maxDurationSeconds: 600, autoCreateTasks: false,
};

export function RoxaneSettingsSection() {
  const [config, setConfig] = useState<Config>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();
  useEffect(() => {
    let alive = true;
    fetch('/api/debate/config').then(r => r.ok ? r.json() : Promise.reject(new Error('Chargement impossible')))
      .then(data => { if (alive) setConfig({ ...defaults, ...data.config }); })
      .catch(e => { if (alive) error(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [error]);

  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/debate/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sauvegarde impossible');
      setConfig({ ...defaults, ...data.config });
      success('Configuration de Roxane enregistrée.');
    } catch (e) { error(e instanceof Error ? e.message : 'Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  const field = 'w-full rounded-xl border px-3 py-2 text-sm outline-none';
  const style = { backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' };
  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Chargement des paramètres de Roxane…</div>;

  return <div className="space-y-5">
    <section className="rounded-2xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <div className="flex items-center gap-3"><div className="rounded-xl p-2" style={{ background: 'rgba(139,92,246,.14)' }}><Brain className="h-5 w-5 text-violet-400" /></div><div><h2 className="font-semibold text-sm">Identité de Roxane</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Une seconde IA indépendante, avec ses propres instructions et paramètres.</p></div></div>
      <label className="flex items-center justify-between text-sm"><span>Activer Roxane</span><input type="checkbox" checked={config.enabled} onChange={e => update('enabled', e.target.checked)} /></label>
      <label className="block text-xs space-y-1">Nom<input className={field} style={style} value={config.name} onChange={e => update('name', e.target.value)} /></label>
      <label className="block text-xs space-y-1">Personnalité et prompt système<textarea className={field + ' min-h-36'} style={style} value={config.systemPrompt} onChange={e => update('systemPrompt', e.target.value)} /></label>
    </section>
    <section className="rounded-2xl border p-5 space-y-4" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-400"/><h2 className="font-semibold text-sm">Modèle et génération</h2></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs space-y-1">Fournisseur<select className={field} style={style} value={config.provider} onChange={e => update('provider', e.target.value as Config['provider'])}><option value="gemini">Google Gemini</option><option value="openrouter">OpenRouter</option></select></label>
        <label className="text-xs space-y-1">Identifiant du modèle<input className={field} style={style} value={config.model} onChange={e => update('model', e.target.value)} placeholder="gemini-3.8-flash / provider/model"/></label>
        <label className="text-xs space-y-1">Voix (synthèse navigateur)<input className={field} style={style} value={config.voice} onChange={e => update('voice', e.target.value)} placeholder="Nom de voix système"/></label>
        <label className="text-xs space-y-1">Température : {config.temperature.toFixed(2)}<input className="w-full" type="range" min="0" max="2" step=".05" value={config.temperature} onChange={e => update('temperature', Number(e.target.value))}/></label>
        <label className="text-xs space-y-1">Top P : {config.topP.toFixed(2)}<input className="w-full" type="range" min="0" max="1" step=".05" value={config.topP} onChange={e => update('topP', Number(e.target.value))}/></label>
        <label className="text-xs space-y-1">Tokens de sortie<input className={field} style={style} type="number" min="128" max="8192" value={config.maxTokens} onChange={e => update('maxTokens', Number(e.target.value))}/></label>
        <label className="text-xs space-y-1">Tours maximum<input className={field} style={style} type="number" min="1" max="8" value={config.maxRounds} onChange={e => update('maxRounds', Number(e.target.value))}/></label>
        <label className="text-xs space-y-1">Durée maximale (secondes)<input className={field} style={style} type="number" min="60" max="1800" value={config.maxDurationSeconds} onChange={e => update('maxDurationSeconds', Number(e.target.value))}/></label>
      </div>
      <label className="block text-xs space-y-2">Niveau de contradiction : {config.contradictionLevel}%<input className="w-full" type="range" min="0" max="100" value={config.contradictionLevel} onChange={e => update('contradictionLevel', Number(e.target.value))}/></label>
      <label className="flex items-center justify-between text-sm"><span>Lire les interventions à voix haute</span><input type="checkbox" checked={config.useSpeech} onChange={e => update('useSpeech', e.target.checked)}/></label>
      <label className="flex items-center justify-between text-sm"><span>Créer automatiquement les tâches après validation</span><input type="checkbox" checked={config.autoCreateTasks} onChange={e => update('autoCreateTasks', e.target.checked)}/></label>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Le modèle texte est indépendant de celui de Leanna. La voix est actuellement fournie par la synthèse vocale du système/navigateur ; la sélection de modèle vocal Live sera une intégration séparée.</p>
    </section>
    <div className="flex justify-end"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent-primary)' }}><Save className="h-4 w-4"/>{saving ? 'Enregistrement…' : 'Enregistrer Roxane'}</button></div>
  </div>;
}
