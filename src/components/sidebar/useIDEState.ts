/**
 * Hook custom qui consolide les props IDE en objets state/actions typés.
 * Élimine les useMemo fragiles avec dépendances manuelles.
 */

import { useMemo } from 'react';
import type { UnifiedSidebarProps } from './types';
import type { IDEPanelState, IDEPanelActions } from './types';

const noop = () => {};

export function useIDEState(props: UnifiedSidebarProps) {
  const state: IDEPanelState = useMemo(() => ({
    showExplorer: props.showExplorer ?? false,
    showGlobalSearch: props.showGlobalSearch ?? false,
    showTerminal: props.showTerminal ?? false,
    showPreview: props.showPreview ?? false,
    showSettings: props.showSettings ?? false,
    showRunMenu: props.showRunMenu ?? false,
    showCheckpoints: props.showCheckpoints ?? false,
    showSandbox: props.showSandbox ?? false,
    showWorkflow: props.showWorkflow ?? false,
    showSkillsMonitor: props.showSkillsMonitor ?? false,
    showChat: props.showChat ?? false,
    showAgents: props.showAgents ?? false,
    showMissions: props.showMissions ?? false,
    showSystemHealth: props.showSystemHealth ?? false,
    showMcp: props.showMcp ?? false,
    showFleet: props.showFleet ?? false,
    previewUrl: props.previewUrl ?? null,
    visionEnabled: props.visionEnabled ?? false,
    screenShareEnabled: props.screenShareEnabled ?? false,
  }), [
    props.showExplorer, props.showGlobalSearch, props.showTerminal,
    props.showPreview, props.showSettings, props.showRunMenu,
    props.showCheckpoints, props.showSandbox, props.showWorkflow, props.showSkillsMonitor,
    props.showChat, props.showAgents, props.showMissions,
    props.showSystemHealth, props.showMcp,
    props.showFleet, props.previewUrl, props.visionEnabled,
    props.screenShareEnabled,
  ]);

  const actions: IDEPanelActions = useMemo(() => ({
    onToggleExplorer: props.onToggleExplorer ?? noop,
    onToggleSearch: props.onToggleSearch ?? noop,
    onToggleTerminal: props.onToggleTerminal ?? noop,
    onTogglePreview: props.onTogglePreview ?? noop,
    onToggleSettings: props.onToggleSettings ?? noop,
    onToggleRunMenu: props.onToggleRunMenu ?? noop,
    onToggleCheckpoints: props.onToggleCheckpoints ?? noop,
    onToggleSandbox: props.onToggleSandbox ?? noop,
    onToggleWorkflow: props.onToggleWorkflow ?? noop,
    onToggleSkillsMonitor: props.onToggleSkillsMonitor ?? noop,
    onToggleChat: props.onToggleChat ?? noop,
    onToggleAgents: props.onToggleAgents ?? noop,
    onToggleMissions: props.onToggleMissions ?? noop,
    onToggleSystemHealth: props.onToggleSystemHealth ?? noop,
    onToggleMcp: props.onToggleMcp ?? noop,
    onToggleFleet: props.onToggleFleet ?? noop,
    onToggleVision: props.onToggleVision ?? noop,
    onToggleScreenShare: props.onToggleScreenShare ?? noop,
  }), [
    props.onToggleExplorer, props.onToggleSearch, props.onToggleTerminal,
    props.onTogglePreview, props.onToggleSettings, props.onToggleRunMenu,
    props.onToggleCheckpoints, props.onToggleSandbox, props.onToggleWorkflow, props.onToggleSkillsMonitor,
    props.onToggleChat, props.onToggleAgents, props.onToggleMissions,
    props.onToggleSystemHealth, props.onToggleMcp,
    props.onToggleFleet, props.onToggleVision, props.onToggleScreenShare,
  ]);

  return { state, actions };
}
