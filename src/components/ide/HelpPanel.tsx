/**
 * HelpPanel — Panneau d'aide intégré dans l'IDE (même zone que l'éditeur).
 * Version condensée du HelpView pour affichage inline.
 */

import {
  BrainCircuit, Camera, Code2, Command, Cpu,
  Keyboard, Layers3, Mic, Search, Terminal, X, Zap,
} from 'lucide-react';
import type { LucideIcon, } from 'lucide-react';
import type { ReactNode } from 'react';

interface HelpPanelProps {
  onClose: () => void;
}

function Card({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)' }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)' }}>
          <Icon className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />
        </span>
        <h3 className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {children}
      </div>
    </section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block rounded border px-1 py-0.5 font-mono text-[9px]" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}>
      {children}
    </kbd>
  );
}

export function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 flex-shrink-0" style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}>
        <div className="flex items-center gap-2">
          <Command className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>Centre d'aide</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--ctrl-hover)]"
          title="Fermer"
        >
          <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

          <Card icon={Cpu} title="Démarrage rapide">
            <ol className="list-decimal list-inside space-y-1">
              <li>Connectez Jarvis via l'indicateur agent (bas de la sidebar).</li>
              <li>Parlez naturellement — Jarvis écoute et répond.</li>
              <li>Utilisez les sous-menus de la sidebar pour accéder aux outils.</li>
            </ol>
          </Card>

          <Card icon={Keyboard} title="Raccourcis clavier">
            <div className="space-y-0.5">
              <p><Kbd>Ctrl+P</Kbd> Palette de fichiers</p>
              <p><Kbd>Ctrl+Shift+P</Kbd> Palette de commandes</p>
              <p><Kbd>Ctrl+Shift+E</Kbd> Explorateur</p>
              <p><Kbd>Ctrl+Shift+F</Kbd> Recherche globale</p>
              <p><Kbd>Ctrl+`</Kbd> Terminal</p>
              <p><Kbd>Ctrl+L</Kbd> Chat IA</p>
              <p><Kbd>Ctrl+S</Kbd> Sauvegarder</p>
              <p><Kbd>Ctrl+/</Kbd> Commenter</p>
              <p><Kbd>F12</Kbd> Aller à la définition</p>
            </div>
          </Card>

          <Card icon={Layers3} title="Compétences IA">
            <ul className="list-disc list-inside space-y-0.5">
              <li><strong>Codebase</strong> — lire, écrire, modifier des fichiers</li>
              <li><strong>Mémoire</strong> — sauvegarde et recherche sémantique</li>
              <li><strong>Système</strong> — commandes, notifications, infos</li>
              <li><strong>Raisonnement</strong> — analyse complexe (Gemini Pro)</li>
              <li><strong>Automatisation</strong> — tâches planifiées, navigation web</li>
            </ul>
          </Card>

          <Card icon={Code2} title="Éditeur">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Monaco Editor (moteur VS Code)</li>
              <li>Explorateur de fichiers</li>
              <li>Terminal PTY intégré</li>
              <li>Prévisualisation live</li>
              <li>Recherche globale avec regex</li>
            </ul>
          </Card>

          <Card icon={Mic} title="Interaction vocale">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Conversation bidirectionnelle en temps réel</li>
              <li>5 voix disponibles dans les paramètres</li>
              <li>L'orbe pulse quand Jarvis écoute/répond</li>
            </ul>
          </Card>

          <Card icon={Camera} title="Vision & Écran">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Caméra : Jarvis voit ce que vous montrez</li>
              <li>Partage d'écran : débogage visuel</li>
              <li>Frames analysées par Gemini en continu</li>
            </ul>
          </Card>

          <Card icon={BrainCircuit} title="Mémoire">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Sauvegarde automatique des infos importantes</li>
              <li>Recherche sémantique (par sens)</li>
              <li>Fusion automatique des souvenirs similaires</li>
            </ul>
          </Card>

          <Card icon={Zap} title="Automatisation">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Tâches récurrentes planifiables</li>
              <li>Navigation web headless</li>
              <li>Extraction de données automatisée</li>
            </ul>
          </Card>

          <Card icon={Terminal} title="Terminal">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Shell PTY réel (PowerShell/bash/zsh)</li>
              <li>Plusieurs terminaux simultanés</li>
              <li>Supporte couleurs et apps interactives</li>
            </ul>
          </Card>

          <Card icon={Search} title="Recherche">
            <ul className="list-disc list-inside space-y-0.5">
              <li>Full-text dans tout le workspace</li>
              <li>Support regex + filtre par extension</li>
              <li>Demandez à Jarvis de chercher vocalement</li>
            </ul>
          </Card>

        </div>

        <p className="mt-4 text-center text-[9px]" style={{ color: 'var(--text-dimmed)' }}>
          Jarvis OS v0.1.0 · Alimenté par Gemini & Supabase
        </p>
      </div>
    </div>
  );
}
