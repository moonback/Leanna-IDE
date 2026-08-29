import {
  Check, Code2, Database, Eye, Keyboard, Palette, Plus, RotateCcw, SlidersHorizontal, Type, X, Minus, Search,
} from 'lucide-react';
import { useState, type ReactNode, useEffect, useRef } from 'react';
import type { IdeSettings } from '../../types/ide';
import { DEFAULT_IDE_SETTINGS } from '../../types/ide';
import { motion, AnimatePresence } from 'motion/react';

type SettingsPanelProps = {
  settings: IdeSettings;
  onUpdateSetting: <K extends keyof IdeSettings>(key: K, value: IdeSettings[K]) => void;
  onClose: () => void;
};

// ── Composants internes réutilisables ──────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || (checked ? 'Activer' : 'Désactiver')}
      onClick={() => onChange(!checked)}
      className="relative h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1"
      style={{
        backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-input)',
        boxShadow: checked ? '0 0 0 3px color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'none',
      }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function CompactSelect({ value, onChange, children, label }: { value: string | number; onChange: (value: string) => void; children: ReactNode; label?: string }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="rounded-md border px-2 py-1 text-xs outline-none transition-colors"
      style={{
        backgroundColor: 'var(--bg-input)',
        borderColor: 'var(--border-base)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </select>
  );
}

// ── Catégories ───────────────────────────────────────────────────────────────

type Category = { id: string; label: string; icon: typeof Palette; description: string };

const CATEGORIES: Category[] = [
  { id: 'apparence',  label: 'Apparence',    icon: Palette,           description: 'Thèmes, minimap, espaces' },
  { id: 'texte',      label: 'Typographie',  icon: Type,              description: 'Police, tabulation, retour à la ligne' },
  { id: 'editeur',    label: 'Éditeur',      icon: Code2,             description: 'Paires, scroll épinglé' },
  { id: 'raccourcis', label: 'Raccourcis',   icon: Keyboard,          description: 'Tous les raccourcis' },
  { id: 'donnees',    label: 'Données',      icon: Database,          description: 'Gestion des conversations' },
];

// ── Composant principal ──────────────────────────────────────────────────────

export function SettingsPanel({ settings, onUpdateSetting, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Category['id']>('apparence');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchQuery]);

  const handleReset = () => {
    (Object.keys(DEFAULT_IDE_SETTINGS) as Array<keyof IdeSettings>).forEach((key) => {
      onUpdateSetting(key, DEFAULT_IDE_SETTINGS[key]);
    });
  };

  const filterSettings = (tabId: string): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const tab = CATEGORIES.find(c => c.id === tabId);
    if (tab && (tab.label.toLowerCase().includes(q) || tab.description.toLowerCase().includes(q))) return true;
    const settingLabels: Record<string, string[]> = {
      apparence:  ['Thème', 'Minimap', 'Espaces visibles'],
      texte:      ['Taille de police', 'Tabulation', 'Word wrap'],
      editeur:    ['Brackets colorés', 'Sticky scroll'],
      raccourcis: ['Multi-curseur', 'Sélection multiple', 'Commenter', 'Formater', 'Définition', 'Références', 'Fichiers', 'Commandes'],
      donnees:    ["Vider l'historique"],
    };
    return settingLabels[tabId]?.some(label => label.toLowerCase().includes(q)) ?? false;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'apparence':  return <AppearanceSettings settings={settings} onUpdateSetting={onUpdateSetting} />;
      case 'texte':      return <TextSettings settings={settings} onUpdateSetting={onUpdateSetting} />;
      case 'editeur':    return <EditorSettings settings={settings} onUpdateSetting={onUpdateSetting} />;
      case 'raccourcis': return <ShortcutsSection />;
      case 'donnees':    return <ClearConversationsCard />;
      default:           return null;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)', borderLeft: '1px solid var(--border-base)' }}>

      {/* ─── Sidebar catégories ─── */}
      <aside className="flex w-48 flex-shrink-0 flex-col border-r" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: 'var(--border-base)' }}>
          <SlidersHorizontal size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Réglages éditeur</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {CATEGORIES.map((cat) => {
            if (!filterSettings(cat.id)) return null;
            const active = activeTab === cat.id;
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-subtle)' : 'transparent',
                  color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  borderRight: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
                }}
              >
                <Icon size={15} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{cat.label}</div>
                  <div className="text-xs truncate opacity-60">{cat.description}</div>
                </div>
                {active && <Check size={12} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border-base)' }}>
          <button
            onClick={handleReset}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <RotateCcw size={12} />
            Réinitialiser
          </button>
        </div>
      </aside>

      {/* ─── Contenu principal ─── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header avec recherche */}
        <header className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {CATEGORIES.find(c => c.id === activeTab)?.label || 'Réglages'}
            </h3>
            <p className="text-sm truncate opacity-60" style={{ color: 'var(--text-muted)' }}>
              {CATEGORIES.find(c => c.id === activeTab)?.description || ''}
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <Search size={13} className="absolute left-2.5 pointer-events-none" style={{ color: 'var(--text-dimmed)' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher… (Ctrl+F)"
              className="w-44 rounded-md border bg-transparent py-1 pl-7 pr-2 text-xs outline-none transition-colors"
              style={{
                borderColor: searchQuery ? 'var(--accent-primary)' : 'var(--border-base)',
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 p-0.5 rounded-full hover:bg-white/10" style={{ color: 'var(--text-dimmed)' }}>
                <X size={11} />
              </button>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 transition hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </header>

        {/* Zone scrollable */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="max-w-2xl mx-auto"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Onglets ────────────────────────────────────────────────────────────────

function AppearanceSettings({ settings, onUpdateSetting }: { settings: IdeSettings; onUpdateSetting: any }) {
  return (
    <SectionCard icon={Palette} title="Apparence" description="Personnalisez le thème et les affichages">
      <div className="mb-3 grid grid-cols-2 gap-2">
        {([
          { value: 'vs-dark', label: 'Sombre',   color: 'var(--bg-panel)' },
          { value: 'vs',      label: 'Clair',    color: 'var(--bg-panel)' },
          { value: 'hc-black',label: 'HC noir',  color: 'var(--bg-base)' },
          { value: 'hc-light',label: 'HC clair', color: 'white' },
        ] as { value: IdeSettings['theme']; label: string; color: string }[]).map((theme) => {
          const active = settings.theme === theme.value;
          return (
            <button key={theme.value} onClick={() => onUpdateSetting('theme', theme.value)}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
              style={{ borderColor: active ? 'var(--accent-primary)' : 'var(--border-base)', backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-input)' }}
            >
              <span className="h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: theme.color, borderColor: 'var(--border-base)' }} />
              <span className="flex-1 text-sm font-medium" style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}>{theme.label}</span>
              {active && <Check size={10} style={{ color: 'var(--accent-primary)' }} />}
            </button>
          );
        })}
      </div>
      <SettingRow label="Minimap" description="Aperçu du fichier à droite">
        <Toggle checked={settings.showMinimap} onChange={(v) => onUpdateSetting('showMinimap', v)} />
      </SettingRow>
      <SettingRow label="Espaces visibles" description="Marque les espaces et tabulations">
        <Toggle checked={settings.showWhitespace} onChange={(v) => onUpdateSetting('showWhitespace', v)} />
      </SettingRow>
    </SectionCard>
  );
}

function TextSettings({ settings, onUpdateSetting }: { settings: IdeSettings; onUpdateSetting: any }) {
  return (
    <SectionCard icon={Type} title="Typographie" description="Police, tabulation et retour à la ligne">
      <SettingRow label="Taille de police" description={`${settings.fontSize}px · de 10 à 24`}>
        <div className="flex items-center rounded-md border" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)' }}>
          <button onClick={() => onUpdateSetting('fontSize', Math.max(10, settings.fontSize - 1))} className="p-1 hover:bg-white/10 rounded-l-md" style={{ color: 'var(--text-muted)' }}>
            <Minus size={11} />
          </button>
          <span className="w-7 text-center font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{settings.fontSize}</span>
          <button onClick={() => onUpdateSetting('fontSize', Math.min(24, settings.fontSize + 1))} className="p-1 hover:bg-white/10 rounded-r-md" style={{ color: 'var(--text-muted)' }}>
            <Plus size={11} />
          </button>
        </div>
      </SettingRow>
      <SettingRow label="Tabulation" description="Nombre d'espaces par niveau">
        <CompactSelect value={settings.tabSize} onChange={(v) => onUpdateSetting('tabSize', Number(v))}>
          <option value={2}>2 espaces</option>
          <option value={4}>4 espaces</option>
          <option value={8}>8 espaces</option>
        </CompactSelect>
      </SettingRow>
      <SettingRow label="Word wrap" description="Enveloppe les longues lignes">
        <Toggle checked={settings.wordWrap} onChange={(v) => onUpdateSetting('wordWrap', v)} />
      </SettingRow>
    </SectionCard>
  );
}

function EditorSettings({ settings, onUpdateSetting }: { settings: IdeSettings; onUpdateSetting: any }) {
  return (
    <SectionCard icon={Code2} title="Éditeur" description="Comportement et aides visuelles">
      <SettingRow label="Brackets colorés" description="Coloration des paires de parenthèses">
        <Toggle checked={settings.bracketPairs} onChange={(v) => onUpdateSetting('bracketPairs', v)} />
      </SettingRow>
      <SettingRow label="Sticky scroll" description="Épingle les scopes en haut de l'éditeur">
        <Toggle checked={settings.stickyScroll} onChange={(v) => onUpdateSetting('stickyScroll', v)} />
      </SettingRow>
      <div className="mt-3 rounded-lg p-2" style={{ backgroundColor: 'var(--bg-input)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Les changements sont appliqués instantanément à l'éditeur actif.
        </p>
      </div>
    </SectionCard>
  );
}

function ShortcutsSection() {
  const shortcuts = [
    ['Multi-curseur', 'Alt + clic'],
    ['Sélection multiple', 'Ctrl + D'],
    ['Commenter', 'Ctrl + /'],
    ['Formater', 'Shift + Alt + F'],
    ['Définition', 'F12'],
    ['Références', 'Shift + F12'],
    ['Fichiers', 'Ctrl + P'],
    ['Commandes', 'Ctrl + Shift + P'],
  ];
  return (
    <SectionCard icon={Keyboard} title="Raccourcis clavier" description="Tous les raccourcis disponibles">
      <div className="grid grid-cols-1 gap-1">
        {shortcuts.map(([action, shortcut]) => (
          <div key={action} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-b-0" style={{ borderColor: 'var(--border-base)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{action}</span>
            <kbd className="rounded border px-1.5 py-0.5 font-mono text-xs" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              {shortcut}
            </kbd>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <Eye size={11} />
        <span className="text-xs">Ces raccourcis sont actifs dans l'éditeur</span>
      </div>
    </SectionCard>
  );
}

function ClearConversationsCard() {
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleClear = async () => {
    setClearing(true);
    setResult(null);
    try {
      const res = await fetch('/api/conversations/all', { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        setResult({ type: 'success', message: `${data.deleted} conversation(s) supprimée(s)` });
      } else {
        setResult({ type: 'error', message: data.error || 'Erreur inconnue' });
      }
    } catch (e: any) {
      setResult({ type: 'error', message: e.message || 'Erreur réseau' });
    } finally {
      setClearing(false);
      setConfirmOpen(false);
    }
  };

  return (
    <SectionCard icon={Database} title="Stockage" description="Gérez les données stockées dans Supabase">
      <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        La suppression est irréversible : toutes les conversations et messages seront définitivement effacés.
      </p>
      {!confirmOpen ? (
        <button onClick={() => setConfirmOpen(true)}
          className="w-full rounded-md border px-3 py-2 text-sm font-medium transition hover:opacity-80"
          style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--color-error)' }}
        >
          Vider l'historique des conversations
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>Confirmer la suppression définitive ?</p>
          <div className="flex gap-2">
            <button onClick={handleClear} disabled={clearing}
              className="flex-1 rounded-md px-2 py-1.5 text-sm font-medium text-white transition hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-error)' }}
            >
              {clearing ? 'Suppression…' : 'Confirmer'}
            </button>
            <button onClick={() => setConfirmOpen(false)} disabled={clearing}
              className="flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {result && (
        <p className="mt-2 text-sm font-medium" style={{ color: result.type === 'success' ? 'var(--color-success)' : 'var(--color-error)' }}>
          {result.message}
        </p>
      )}
    </SectionCard>
  );
}

// ─── Composants auxiliaires ─────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, description, children }: { icon: typeof Palette; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-4 shadow-sm" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary, var(--bg-panel))' }}>
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
          <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h4>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0" style={{ borderColor: 'var(--border-base)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
