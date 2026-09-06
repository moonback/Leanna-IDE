/**
 * SystemDashboardView — Tableau de bord du système
 * 
 * Ce composant fournit une vue centralisée pour surveiller et gérer :
 * - Les événements en temps réel (EventBus)
 * - Les artefacts produits par le système
 * - Les vérifications en cours
 * - Les métriques globales du système
 * 
 * @example
 * <Route path="/dashboard" element={<SystemDashboardView />} />
 */

import React, { useState, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import {
  LayoutDashboard, Package, Shield, Clock, Settings, X, Minimize2, Maximize2
} from "lucide-react";
import { EventMonitor } from "../components/system/EventMonitor";
import { ArtifactManagerUI } from "../components/system/ArtifactManagerUI";
import { VerificationMonitor } from "../components/system/VerificationMonitor";
import type { Event, Artifact, VerificationResult } from "../../server/core/types";
import { useEventBus, useArtifactManager, useVerificationManager } from "../hooks";

/**
 * Onglets disponibles
 */
type DashboardTab = "overview" | "events" | "artifacts" | "verifications" | "settings";

/**
 * Props du composant SystemDashboardView
 */
export interface SystemDashboardViewProps {
  /** Onglet initial */
  initialTab?: DashboardTab;
  /** Afficher les statistiques globales */
  showGlobalStats?: boolean;
}

/**
 * Composant SystemDashboardView
 */
export function SystemDashboardView({
  initialTab = "overview",
  showGlobalStats = true,
}: SystemDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreenTab, setFullscreenTab] = useState<DashboardTab | null>(null);
  
  // Handlers pour les événements
  const handleEventClick = useCallback((event: Event) => {
    console.log("Événement sélectionné:", event);
  }, []);
  
  const handleArtifactSelect = useCallback((artifact: Artifact) => {
    console.log("Artefact sélectionné:", artifact);
  }, []);
  
  const handleVerificationClick = useCallback((verification: VerificationResult) => {
    console.log("Vérification sélectionnée:", verification);
  }, []);
  
  // Métriques globales
  const { getMetrics: getEventMetrics, historySize, subscriberCount } = useEventBus();
  const { getStats: getArtifactStats } = useArtifactManager();
  const { getStats: getVerificationStats } = useVerificationManager();
  
  const eventMetrics = getEventMetrics();
  const artifactStats = getArtifactStats();
  const verificationStats = getVerificationStats();
  
  // Statistiques globales
  const globalStats = useMemo(() => ({
    events: {
      total: eventMetrics.total,
      uptime: eventMetrics.uptime,
      avgPerMinute: eventMetrics.averagePerMinute,
      subscribers: subscriberCount,
      history: historySize,
    },
    artifacts: {
      total: artifactStats.totalArtifacts,
      versions: artifactStats.totalVersions,
      references: artifactStats.totalReferences,
      size: artifactStats.totalSize,
    },
    verifications: {
      total: verificationStats.total,
      passed: verificationStats.passed,
      failed: verificationStats.failed,
    },
  }), [eventMetrics, subscriberCount, historySize, artifactStats, verificationStats]);
  
  // Toggle plein écran
  const toggleFullscreen = useCallback((tab: DashboardTab) => {
    setFullscreenTab(prev => prev === tab ? null : tab);
  }, []);
  
  // Rendu de l'onglet "Overview"
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 p-4"
    >
      {/* Statistiques globales */}
      {showGlobalStats && (
        <div className="grid grid-cols-3 gap-4">
          {/* Événements */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-semibold text-slate-800">Événements</span>
              </div>
              <span className="text-xs text-slate-500">
                Uptime: {(globalStats.events.uptime / 1000).toFixed(0)}s
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-xl font-bold text-slate-800">{globalStats.events.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Abonnés</span>
                <span className="text-xl font-bold text-blue-600">{globalStats.events.subscribers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Histoire</span>
                <span className="text-xl font-bold text-purple-600">{globalStats.events.history}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">/min</span>
                <span className="text-xl font-bold text-green-600">
                  {globalStats.events.avgPerMinute.toFixed(1)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Artefacts */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Package className="w-4 h-4 text-purple-600" />
                </div>
                <span className="font-semibold text-slate-800">Artefacts</span>
              </div>
              <span className="text-xs text-slate-500">
                {(globalStats.artifacts.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-xl font-bold text-slate-800">{globalStats.artifacts.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Versions</span>
                <span className="text-xl font-bold text-purple-600">{globalStats.artifacts.versions}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Références</span>
                <span className="text-xl font-bold text-green-600">{globalStats.artifacts.references}</span>
              </div>
            </div>
          </div>
          
          {/* Vérifications */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-green-600" />
                </div>
                <span className="font-semibold text-slate-800">Vérifications</span>
              </div>
              <span className="text-xs text-slate-500">
                {globalStats.verifications.total > 0 
                  ? ((globalStats.verifications.passed / globalStats.verifications.total) * 100).toFixed(1) + "% OK"
                  : "0%"
                }
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Total</span>
                <span className="text-xl font-bold text-slate-800">{globalStats.verifications.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Réussies</span>
                <span className="text-xl font-bold text-green-600">{globalStats.verifications.passed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Échouées</span>
                <span className="text-xl font-bold text-red-600">{globalStats.verifications.failed}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Miniatures des sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-slate-800">Derniers événements</span>
            <button
              onClick={() => setActiveTab("events")}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Voir tout
            </button>
          </div>
          <EventMonitor
            maxEvents={10}
            maxHeight="200px"
            autoScroll={true}
            onEventClick={handleEventClick}
          />
        </div>
        
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-slate-800">Derniers artefacts</span>
            <button
              onClick={() => setActiveTab("artifacts")}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Voir tout
            </button>
          </div>
          <ArtifactManagerUI
            maxHeight="200px"
            showCreateButton={false}
            showStats={false}
            onArtifactSelect={handleArtifactSelect}
          />
        </div>
      </div>
    </motion.div>
  );
  
  // Rendu de l'onglet "Événements"
  const renderEvents = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <EventMonitor
        maxEvents={200}
        maxHeight="100%"
        autoScroll={true}
        onEventClick={handleEventClick}
      />
    </motion.div>
  );
  
  // Rendu de l'onglet "Artefacts"
  const renderArtifacts = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <ArtifactManagerUI
        maxHeight="100%"
        showCreateButton={true}
        showStats={true}
        onArtifactSelect={handleArtifactSelect}
        onArtifactCreate={handleArtifactSelect}
      />
    </motion.div>
  );
  
  // Rendu de l'onglet "Vérifications"
  const renderVerifications = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <VerificationMonitor
        maxVerifications={200}
        maxHeight="100%"
        autoScroll={true}
        showStats={true}
        onVerificationClick={handleVerificationClick}
      />
    </motion.div>
  );
  
  // Rendu de l'onglet "Paramètres"
  const renderSettings = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4"
    >
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-800">Paramètres du tableau de bord</span>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700">
                Afficher les statistiques globales
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Affiche le panneau de statistiques dans l'onglet Overview
              </p>
            </div>
            <button
              onClick={() => { /* Toggle showGlobalStats */ }}
              className={`
                w-10 h-6 rounded-full relative transition-colors
                ${showGlobalStats ? "bg-blue-500" : "bg-slate-200"}
              `}
            >
              <span className={`
                absolute top-1 left-1 w-4 h-4 rounded-full bg-white
                transition-transform ${showGlobalStats ? "translate-x-4" : ""}
              `} />
            </button>
          </div>
          
          <div className="border-t border-slate-200/50 pt-4">
            <div className="text-sm text-slate-500 mb-3">Réinitialiser le tableau de bord</div>
            <button className="py-2 px-3 bg-red-600/10 hover:bg-red-600/20 text-red-600 rounded-lg transition-colors text-sm">
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
  
  // Rendu basé sur l'onglet actif
  const renderTabContent = () => {
    if (fullscreenTab) {
      switch (fullscreenTab) {
        case "events": return renderEvents();
        case "artifacts": return renderArtifacts();
        case "verifications": return renderVerifications();
        case "settings": return renderSettings();
        default: return renderOverview();
      }
    }
    
    switch (activeTab) {
      case "events": return renderEvents();
      case "artifacts": return renderArtifacts();
      case "verifications": return renderVerifications();
      case "settings": return renderSettings();
      default: return renderOverview();
    }
  };
  
  // Navigation des onglets
  const tabs: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Vue d'ensemble", icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: "events", label: "Événements", icon: <Clock className="w-4 h-4" /> },
    { id: "artifacts", label: "Artefacts", icon: <Package className="w-4 h-4" /> },
    { id: "verifications", label: "Vérifications", icon: <Shield className="w-4 h-4" /> },
    { id: "settings", label: "Paramètres", icon: <Settings className="w-4 h-4" /> },
  ];
  
  return (
    <div className="flex flex-col h-full bg-surface-soft">
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-600" />
          <span className="text-xl font-bold text-slate-800">Tableau de bord du système</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700"
            title="Paramètres"
          >
            <Settings className="w-5 h-5" />
          </button>
          
          {fullscreenTab ? (
            <button
              onClick={() => setFullscreenTab(null)}
              className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700"
              title="Quitter le mode plein écran"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setFullscreenTab(activeTab)}
              className="p-2 rounded-lg hover:bg-slate-100/50 transition-colors text-slate-500 hover:text-slate-700"
              title="Mode plein écran"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Navigation */}
      {!fullscreenTab && (
        <div className="flex items-center gap-1 p-2 bg-surface border-b border-border overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                  ${isActive 
                    ? "bg-blue-500/10 text-blue-600 font-medium" 
                    : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-700"
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}
      
      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
}

export default SystemDashboardView;
