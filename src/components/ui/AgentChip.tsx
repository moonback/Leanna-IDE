/**
 * AgentChip — pastille d'agent colorée selon sa famille (agentColors.ts).
 *
 * Le point pulse quand l'agent est actif. L'état est aussi donné en texte
 * (lecteurs d'écran), jamais par la couleur seule.
 *
 *   <AgentChip agentRole="architect" label="Architecte" status="active" />
 */
import React from 'react';
import { clsx } from 'clsx';
import { agentColor } from './agentColors.js';

export type AgentChipStatus = 'active' | 'running' | 'idle' | 'error';

const STATUS_TEXT: Record<AgentChipStatus, string> = {
  active: 'actif',
  running: 'en cours',
  idle: 'en veille',
  error: 'en erreur',
};

export interface AgentChipProps {
  /** Rôle d'agent (ex. 'coder'). Détermine la couleur. */
  agentRole: string;
  label: string;
  status?: AgentChipStatus;
  className?: string;
}

export function AgentChip({ agentRole, label, status = 'idle', className }: AgentChipProps) {
  return (
    <span
      className={clsx('nb-chip', className)}
      style={{ '--nb-chip-color': status === 'error' ? 'var(--color-error)' : agentColor(agentRole) } as React.CSSProperties}
      data-status={status === 'running' ? 'active' : status}
    >
      <span className="nb-chip__dot" aria-hidden="true" />
      {label}
      <span className="sr-only">, {STATUS_TEXT[status]}</span>
    </span>
  );
}
