import React from 'react';
import { X, BrainCircuit, GitBranch, FolderOpen, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

interface SystemModalProps {
  onClose: () => void;
  connected: boolean;
  profile: any;
  gitInfo: { branch: string; summary: string } | null;
  workspace: { path: string; exists: boolean } | null;
}

export function SystemModal({ onClose, connected, profile, gitInfo, workspace }: SystemModalProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-base)' }}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(74,222,128,0.12)' }}>
              <BrainCircuit className="w-5 h-5" style={{ color: '#4ade80' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Statut système</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>État des services Jarvis</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition" style={{ color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: connected ? '#4ade80' : '#fbbf24' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>IA ({profile.aiName || 'Leanna'})</span>
            </div>
            <span className="text-[10px] font-medium" style={{ color: connected ? '#4ade80' : '#fbbf24' }}>
              {connected ? 'Connectée' : 'Déconnectée'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a855f7' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>Fournisseur</span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {profile.textProvider === 'openrouter' ? profile.openrouterModel?.split('/').pop() || 'OpenRouter' : 'Gemini 2.0'}
            </span>
          </div>
          {gitInfo && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center gap-2">
                <GitBranch size={12} style={{ color: '#f472b6' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>Git</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono block" style={{ color: '#f472b6' }}>{gitInfo.branch}</span>
                <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>{gitInfo.summary}</span>
              </div>
            </div>
          )}
          {workspace && (
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
              <div className="flex items-center gap-2">
                <FolderOpen size={12} style={{ color: 'var(--accent-primary)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>Workspace</span>
              </div>
              <span className="text-[10px] font-mono truncate max-w-[180px]" style={{ color: 'var(--text-muted)' }}>
                {workspace.path.split(/[/\\]/).pop()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <MessageSquare size={12} style={{ color: '#0ea5e9' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>Voix</span>
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{profile.aiVoice || 'Aoede'}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-base)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>Langue</span>
            </div>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{profile.language === 'fr' ? 'Français' : profile.language === 'en' ? 'English' : profile.language}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
