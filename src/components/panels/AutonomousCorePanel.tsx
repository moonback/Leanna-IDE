/**
 * AutonomousCorePanel — Panneau principal de l'Autonomous Core V2
 *
 * Trois onglets :
 *   Statut   — état runtime, niveau d'autonomie, diagnostics
 *   Objectifs — CRUD des objectifs persistants
 *   Missions  — flux en temps réel des missions
 */
import { useState } from 'react';
import { X, Activity, Target, Rocket } from 'lucide-react';
import { StatusTab } from './autonomous/StatusTab.js';
import { GoalsTab } from './autonomous/GoalsTab.js';
import { MissionsTab } from './autonomous/MissionsTab.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutonomousCorePanelProps {
  inline?: boolean;
  onClose?: () => void;
}

type TabKey = 'status' | 'goals' | 'missions';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'status',   label: 'Statut',     icon: <Activity size={14} /> },
  { key: 'goals',    label: 'Objectifs',  icon: <Target size={14} /> },
  { key: 'missions', label: 'Missions',   icon: <Rocket size={14} /> },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AutonomousCorePanel({ inline = false, onClose }: AutonomousCorePanelProps) {
  const [tab, setTab] = useState<TabKey>('status');

  const container = inline
    ? 'flex flex-col h-full w-full overflow-hidden'
    : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';

  const panel = inline
    ? 'flex flex-col h-full w-full'
    : 'relative flex flex-col w-[480px] max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden';

  return (
    <div className={container}>
      <div
        className={panel}
        style={{ backgroundColor: 'var(--bg-base)', border: !inline ? '1px solid var(--border-base)' : undefined }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', opacity: 0.9 }}>
              <Activity size={14} color="white" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                Autonomous Core V2
              </p>
              <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
                Boucle d'autonomie persistante
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={15} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div
          className="flex border-b shrink-0"
          style={{ borderColor: 'var(--border-base)' }}
        >
          {TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                tab === key
                  ? 'border-current'
                  : 'border-transparent hover:bg-white/5'
              }`}
              style={{
                color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
                borderBottomColor: tab === key ? 'var(--accent)' : undefined,
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'status'   && <StatusTab />}
          {tab === 'goals'    && <GoalsTab />}
          {tab === 'missions' && <MissionsTab />}
        </div>
      </div>
    </div>
  );
}
