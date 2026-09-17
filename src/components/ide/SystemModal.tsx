import React from 'react';
import { BrainCircuit, GitBranch, FolderOpen, MessageSquare } from 'lucide-react';
import { Modal } from '../ui/Modal.js';

interface SystemModalProps {
  onClose: () => void;
  connected: boolean;
  profile: any;
  gitInfo: { branch: string; summary: string } | null;
  workspace: { path: string; exists: boolean } | null;
}

export function SystemModal({ onClose, connected, profile, gitInfo, workspace }: SystemModalProps) {
  return (
    <Modal open onClose={onClose} size="sm" tone="default">
      <Modal.Header>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--color-success-subtle)' }}
          >
            <BrainCircuit className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Statut système</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>État des services Leanna</p>
          </div>
        </div>
      </Modal.Header>

      <Modal.Body>
        <div className="space-y-3">
          <StatusRow
            dot
            dotColor={connected ? 'var(--color-success)' : 'var(--color-warning)'}
            label={`IA (${profile.aiName || 'Leanna'})`}
            value={connected ? 'Connectée' : 'Déconnectée'}
            valueColor={connected ? 'var(--color-success)' : 'var(--color-warning)'}
          />
          <StatusRow
            dot
            dotColor="var(--accent-secondary)"
            label="Fournisseur"
            value={profile.textProvider === 'openrouter'
              ? profile.openrouterModel?.split('/').pop() || 'OpenRouter'
              : 'Gemini 2.0'}
            mono
          />
          {gitInfo && (
            <StatusRow
              icon={<GitBranch size={12} style={{ color: 'var(--color-error)' }} />}
              label="Git"
              value={gitInfo.branch}
              valueColor="var(--color-error)"
              sub={gitInfo.summary}
              mono
            />
          )}
          {workspace && (
            <StatusRow
              icon={<FolderOpen size={12} style={{ color: 'var(--accent-primary)' }} />}
              label="Workspace"
              value={workspace.path.split(/[/\\]/).pop() ?? ''}
              mono
            />
          )}
          <StatusRow
            icon={<MessageSquare size={12} style={{ color: 'var(--color-info)' }} />}
            label="Voix"
            value={profile.aiVoice || 'Aoede'}
          />
          <StatusRow
            dot
            dotColor="var(--accent-secondary)"
            label="Langue"
            value={profile.language === 'fr' ? 'Français' : profile.language === 'en' ? 'English' : profile.language}
          />
        </div>
      </Modal.Body>
    </Modal>
  );
}

// ── Ligne de statut réutilisable ──────────────────────────────────────────────
interface StatusRowProps {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  sub?: string;
  dot?: boolean;
  dotColor?: string;
  icon?: React.ReactNode;
}
function StatusRow({ label, value, valueColor, mono, sub, dot, dotColor, icon }: StatusRowProps) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl"
      style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}
    >
      <div className="flex items-center gap-2">
        {dot && (
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        )}
        {!dot && icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div className="text-right">
        <span
          className={mono ? 'text-sm font-mono block' : 'text-sm block'}
          style={{ color: valueColor ?? 'var(--text-muted)' }}
        >
          {value}
        </span>
        {sub && (
          <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{sub}</span>
        )}
      </div>
    </div>
  );
}
