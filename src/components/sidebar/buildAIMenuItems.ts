/**
 * buildAIMenuItems — Construit la liste plate des items du menu IA
 * à partir de la config sidebar, filtrée par état de connexion.
 */

import { sidebarSections } from '../../config/ideSidebarConfig';
import type { AIMenuItem } from './types';

export function buildAIMenuItems(assistantConnected: boolean): AIMenuItem[] {
  const section = sidebarSections.find(s => s.id === 'ai-agent');
  if (!section) return [];

  return section.items
    .flatMap(item =>
      item.type === 'submenu' && item.children ? item.children : [item]
    )
    .filter(item => item.actionKey || item.stateKey)
    .filter(item => !item.requiresAssistant || assistantConnected)
    .map(item => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      stateKey: item.stateKey,
      actionKey: item.actionKey,
      dotStateKey: item.dotStateKey,
    }));
}
