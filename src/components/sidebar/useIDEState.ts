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
    showSettings: props.showSettings ?? false,
    showRunMenu: props.showRunMenu ?? false,
    showSandbox: props.showSandbox ?? false,
    showWorkflow: props.showWorkflow ?? false,
    showSkillsMonitor: props.showSkillsMonitor ?? false,
    showChat: props.showChat ?? false,
    showAgents: props.showAgents ?? false,
    showAgentBuilder: props.showAgentBuilder ?? false,
    showMissions: props.showMissions ?? false,
    showKnowledge: props.showKnowledge ?? false,
    showDocuments: props.showDocuments ?? false,
    showNotebooks: props.showNotebooks ?? false,
    showSystemHealth: props.showSystemHealth ?? false,
    showMcp: props.showMcp ?? false,
    showFleet: props.showFleet ?? false,
    showBrowser: props.showBrowser ?? false,
    visionEnabled: props.visionEnabled ?? false,
    screenShareEnabled: props.screenShareEnabled ?? false,
  }), [
    props.showExplorer, props.showGlobalSearch,
    props.showSettings, props.showRunMenu,
    props.showSandbox, props.showWorkflow, props.showSkillsMonitor,
    props.showChat, props.showAgents, props.showAgentBuilder, props.showMissions,
    props.showKnowledge, props.showDocuments, props.showNotebooks, props.showSystemHealth, props.showMcp,
    props.showFleet, props.showBrowser, props.visionEnabled,
    props.screenShareEnabled,
  ]);

  const actions: IDEPanelActions = useMemo(() => ({
    onToggleExplorer: props.onToggleExplorer ?? noop,
    onToggleSearch: props.onToggleSearch ?? noop,
    onToggleSettings: props.onToggleSettings ?? noop,
    onToggleRunMenu: props.onToggleRunMenu ?? noop,
    onToggleSandbox: props.onToggleSandbox ?? noop,
    onToggleWorkflow: props.onToggleWorkflow ?? noop,
    onToggleSkillsMonitor: props.onToggleSkillsMonitor ?? noop,
    onToggleChat: props.onToggleChat ?? noop,
    onToggleAgents: props.onToggleAgents ?? noop,
    onToggleAgentBuilder: props.onToggleAgentBuilder ?? noop,
    onToggleMissions: props.onToggleMissions ?? noop,
    onToggleKnowledge: props.onToggleKnowledge ?? noop,
    onToggleNotebooks: props.onToggleNotebooks ?? noop,
    onToggleDocuments: props.onToggleDocuments ?? noop,
    onToggleSystemHealth: props.onToggleSystemHealth ?? noop,
    onToggleMcp: props.onToggleMcp ?? noop,
    onToggleFleet: props.onToggleFleet ?? noop,
    onToggleBrowser: props.onToggleBrowser ?? noop,
    onToggleVision: props.onToggleVision ?? noop,
    onToggleScreenShare: props.onToggleScreenShare ?? noop,
  }), [
    props.onToggleExplorer, props.onToggleSearch,
    props.onToggleSettings, props.onToggleRunMenu,
    props.onToggleSandbox, props.onToggleWorkflow, props.onToggleSkillsMonitor,
    props.onToggleChat, props.onToggleAgents, props.onToggleAgentBuilder, props.onToggleMissions,
    props.onToggleKnowledge, props.onToggleNotebooks, props.onToggleDocuments, props.onToggleSystemHealth, props.onToggleMcp,
    props.onToggleFleet, props.onToggleBrowser, props.onToggleVision, props.onToggleScreenShare,
  ]);

  return { state, actions };
}
