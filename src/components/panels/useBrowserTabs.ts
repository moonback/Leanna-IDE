/**
 * useBrowserTabs — état des onglets du navigateur intégré (version « légère »).
 *
 * Chaque onglet mémorise son URL et son titre. Une SEULE webview est montée à
 * la fois (celle de l'onglet actif) : changer d'onglet recharge l'URL mémorisée.
 * Les outils IPC ciblent toujours la webview active, donc rien à adapter côté
 * agent.
 */

import { useCallback, useRef, useState } from 'react';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

let tabCounterSeed = 0;
function nextTabId(): string {
  tabCounterSeed += 1;
  return `tab-${Date.now().toString(36)}-${tabCounterSeed}`;
}

export interface UseBrowserTabsResult {
  tabs: BrowserTab[];
  activeTabId: string;
  activeTab: BrowserTab;
  /** Crée un onglet (optionnellement avec une URL) et l'active. Retourne l'onglet. */
  newTab: (url: string, title?: string) => BrowserTab;
  /** Ferme un onglet. Si c'était l'actif, bascule sur un voisin. Garde ≥ 1 onglet. */
  closeTab: (id: string) => void;
  /** Active un onglet existant. */
  activateTab: (id: string) => void;
  /** Met à jour l'URL et/ou le titre de l'onglet actif. */
  updateActiveTab: (patch: { url?: string; title?: string }) => void;
}

export function useBrowserTabs(initialUrl: string): UseBrowserTabsResult {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => [
    { id: nextTabId(), url: initialUrl, title: '' },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id);

  // Réf. synchronisée vers l'onglet actif, pour que updateActiveTab (appelé
  // depuis des listeners webview à dépendances figées) lise toujours l'actif.
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  const newTab = useCallback((url: string, title = ''): BrowserTab => {
    const tab: BrowserTab = { id: nextTabId(), url, title };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev; // toujours au moins un onglet
      const index = prev.findIndex((t) => t.id === id);
      if (index === -1) return prev;
      const next = prev.filter((t) => t.id !== id);
      // Si on ferme l'onglet actif, activer le voisin le plus proche.
      setActiveTabId((currentActive) => {
        if (currentActive !== id) return currentActive;
        const neighbor = next[Math.min(index, next.length - 1)];
        return neighbor.id;
      });
      return next;
    });
  }, []);

  const activateTab = useCallback((id: string) => {
    setActiveTabId((prev) => (prev === id ? prev : id));
  }, []);

  const updateActiveTab = useCallback((patch: { url?: string; title?: string }) => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.id !== activeTabIdRef.current) return t;
        const merged = { ...t };
        if (patch.url !== undefined && patch.url !== t.url) { merged.url = patch.url; changed = true; }
        if (patch.title !== undefined && patch.title !== t.title) { merged.title = patch.title; changed = true; }
        return merged;
      });
      return changed ? next : prev;
    });
  }, []);

  return { tabs, activeTabId, activeTab, newTab, closeTab, activateTab, updateActiveTab };
}
