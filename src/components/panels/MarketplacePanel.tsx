/**
 * MarketplacePanel — Marketplace d'agents et de skills Leanna.
 *
 * S'affiche en side panel overlay depuis la droite (par-dessus l'IDE,
 * sans masquer l'EmptyEditorState derrière).
 *
 * Vues :
 *  - Accueil        : Paquets en vedette + stats globales
 *  - Catalogue      : Grille paginée avec recherche, filtres, tri
 *  - Installés      : Paquets déjà installés localement
 *  - Détail paquet  : Fiche complète avec onglets (Aperçu, Skills/Agent, Avis, Sécurité)
 *  - Publier        : Formulaire de publication avec validation sécurité live
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useSyncExternalStore,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Store, Search, Download, Star, Shield, ShieldCheck, ShieldAlert,
  ShieldOff, CheckCircle, Package, Bot, Zap, Layers,
  ArrowLeft, Upload, RefreshCw, ChevronLeft,
  ChevronRight, Tag, Clock, TrendingUp, Award, X,
  Globe, Code, Database, Lock, Wrench,
  BookOpen, Send, AlertTriangle, Check, Sparkles,
  LayoutGrid,
} from 'lucide-react';
import { SidePanel } from '../ui/SidePanel.js';
import { useToast } from '../ui/Toast.js';
import {
  getMarketplaceState,
  subscribe,
  initMarketplaceStore,
  searchMarketplace,
  selectPackage,
  clearSelectedPackage,
  installPackage,
  uninstallPackage,
  ratePackage,
  publishPackage,
  validateSecurity,
  downloadPackage,
  setSearchQuery,
  setActiveType,
  setActiveCategory,
  setActiveSort,
  setPage,
  type MarketplacePackage,
  type MarketplaceCategory,
  type MarketplacePackageType,
  type SecurityTrustLevel,
} from '../../stores/marketplaceStore.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants & helpers
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<MarketplaceCategory | "", string> = {
  "": "Toutes",
  code: "Code",
  devops: "DevOps",
  web: "Web",
  data: "Data",
  writing: "Rédaction",
  security: "Sécurité",
  productivity: "Productivité",
  ai: "IA",
  other: "Autre",
};

const CATEGORY_ICONS: Record<string, React.FC<any>> = {
  code: Code,
  devops: Zap,
  web: Globe,
  data: Database,
  writing: BookOpen,
  security: Lock,
  productivity: Wrench,
  ai: Sparkles,
  other: Package,
};

const TYPE_LABELS: Record<MarketplacePackageType | "", string> = {
  "": "Tous",
  agent: "Agents",
  skill: "Skills",
  bundle: "Bundles",
};

const SORT_LABELS: Record<string, string> = {
  popular: "Populaires",
  recent: "Récents",
  rating: "Mieux notés",
  installs: "Plus installés",
};

const TRUST_CONFIG: Record<SecurityTrustLevel, { label: string; color: string; Icon: React.FC<any> }> = {
  verified: { label: "Certifié Leanna", color: "var(--color-success)", Icon: ShieldCheck },
  community: { label: "Communautaire", color: "#3b82f6", Icon: Shield },
  unreviewed: { label: "Non vérifié", color: "var(--text-dimmed)", Icon: ShieldOff },
  flagged: { label: "Signalé", color: "var(--color-error)", Icon: ShieldAlert },
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `Il y a ${days} jours`;
  if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`;
  return `Il y a ${Math.floor(days / 365)} an(s)`;
}

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          fill={s <= Math.round(rating) ? "#eab308" : "transparent"}
          strokeWidth={s <= Math.round(rating) ? 0 : 1.5}
          style={{ color: s <= Math.round(rating) ? "#eab308" : "var(--text-dimmed)" }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════════════════

// ── Badge type ──
function TypeBadge({ type }: { type: MarketplacePackageType }) {
  const colors: Record<MarketplacePackageType, string> = {
    agent: "#8b5cf6",
    skill: "#06b6d4",
    bundle: "#f59e0b",
  };
  const icons: Record<MarketplacePackageType, React.FC<any>> = {
    agent: Bot,
    skill: Zap,
    bundle: Layers,
  };
  const Icon = icons[type];
  const color = colors[type];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      <Icon size={9} />
      {TYPE_LABELS[type]}
    </span>
  );
}

// ── Trust badge ──
function TrustBadge({ level }: { level: SecurityTrustLevel }) {
  const cfg = TRUST_CONFIG[level];
  const Icon = cfg.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
      style={{
        color: cfg.color,
        backgroundColor: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
      }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ── Carte de paquet ──
function PackageCard({
  pkg,
  onSelect,
  onInstall,
  onUninstall,
  installing,
}: {
  pkg: MarketplacePackage;
  onSelect: (p: MarketplacePackage) => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  installing: boolean;
}) {
  const installed = pkg._installed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl cursor-pointer overflow-hidden group"
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-base)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = pkg.color;
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px color-mix(in srgb, ${pkg.color} 15%, transparent)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-base)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
      onClick={() => onSelect(pkg)}
    >
      {/* Header coloré */}
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${pkg.color}, color-mix(in srgb, ${pkg.color} 50%, transparent))` }}
      />

      <div className="p-4">
        {/* Ligne supérieure */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${pkg.color} 12%, var(--bg-surface))` }}
          >
            {pkg.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {pkg.name}
              </h3>
              {pkg.verified && (
                <CheckCircle size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>
              <span>par {pkg.author}</span>
              <span>·</span>
              <span>v{pkg.version}</span>
            </div>
          </div>
          <TypeBadge type={pkg.type} />
        </div>

        {/* Description */}
        <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {pkg.description}
        </p>

        {/* Tags */}
        {pkg.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {pkg.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-dimmed)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats + Action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-dimmed)' }}>
            <span className="flex items-center gap-1">
              <Download size={10} />
              {formatNumber(pkg.stats.downloads)}
            </span>
            <span className="flex items-center gap-1">
              <Star size={10} fill="#eab308" style={{ color: '#eab308' }} />
              {pkg.stats.rating.toFixed(1)}
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              installed ? onUninstall(pkg.id) : onInstall(pkg.id);
            }}
            disabled={installing || pkg.security.trustLevel === 'flagged'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            style={
              installed
                ? {
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-base)',
                  }
                : {
                    backgroundColor: pkg.color,
                    color: 'white',
                    boxShadow: `0 2px 8px color-mix(in srgb, ${pkg.color} 30%, transparent)`,
                  }
            }
          >
            {installing ? (
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : installed ? (
              <>
                <Check size={10} /> Installé
              </>
            ) : (
              <>
                <Download size={10} /> Installer
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Détail d'un paquet ──
function PackageDetail({
  pkg,
  onBack,
  onInstall,
  onUninstall,
  installing,
  onDownload,
}: {
  pkg: MarketplacePackage;
  onBack: () => void;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  installing: boolean;
  onDownload: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'reviews' | 'security'>('overview');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAuthor, setReviewAuthor] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const toast = useToast();
  const installed = pkg._installed;

  const handleSubmitReview = async () => {
    if (!reviewText.trim() || !reviewAuthor.trim()) return;
    setReviewSubmitting(true);
    const ok = await ratePackage(pkg.id, reviewRating, reviewText, reviewAuthor);
    setReviewSubmitting(false);
    if (ok) {
      toast.success('Avis envoyé !');
      setReviewText('');
      setReviewAuthor('');
    } else {
      toast.error("Erreur lors de l'envoi de l'avis");
    }
  };

  const tabs = [
    { id: 'overview', label: 'Aperçu' },
    { id: 'content', label: pkg.type === 'bundle' ? 'Contenu' : pkg.type === 'agent' ? 'Agent' : 'Skill' },
    { id: 'reviews', label: `Avis (${pkg.stats.reviewCount})` },
    { id: 'security', label: 'Sécurité' },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} />
        </button>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
          style={{ backgroundColor: `color-mix(in srgb, ${pkg.color} 15%, var(--bg-surface))` }}
        >
          {pkg.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {pkg.name}
            </h2>
            {pkg.verified && <CheckCircle size={13} style={{ color: 'var(--color-success)' }} />}
            <TypeBadge type={pkg.type} />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
            par {pkg.author} · v{pkg.version} · {pkg.license}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onDownload(pkg.id)}
            className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="Télécharger le JSON"
          >
            <Download size={14} />
          </button>
          <button
            onClick={() => installed ? onUninstall(pkg.id) : onInstall(pkg.id)}
            disabled={installing || pkg.security.trustLevel === 'flagged'}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            style={
              installed
                ? { backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }
                : { backgroundColor: pkg.color, color: 'white', boxShadow: `0 2px 12px color-mix(in srgb, ${pkg.color} 30%, transparent)` }
            }
          >
            {installing ? (
              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : installed ? (
              <><Check size={13} /> Installé</>
            ) : (
              <><Download size={13} /> Installer</>
            )}
          </button>
        </div>
      </div>

      {/* Stats rapides */}
      <div
        className="flex gap-6 px-5 py-2.5 border-b flex-shrink-0 text-xs"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-surface)' }}
      >
        {[
          { icon: Download, label: formatNumber(pkg.stats.downloads), title: 'Téléchargements' },
          { icon: Package, label: formatNumber(pkg.stats.installs), title: 'Installations' },
          { icon: TrendingUp, label: formatNumber(pkg.stats.weeklyDownloads) + '/sem', title: 'Cette semaine' },
          { icon: Clock, label: timeAgo(pkg.updatedAt), title: 'Mis à jour' },
        ].map(({ icon: Icon, label, title }) => (
          <div key={title} className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }} title={title}>
            <Icon size={11} style={{ color: 'var(--text-dimmed)' }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <StarRating rating={pkg.stats.rating} size={11} />
          <span style={{ color: 'var(--text-muted)' }}>
            {pkg.stats.rating.toFixed(1)} ({pkg.stats.reviewCount})
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className="px-5 py-2.5 text-xs font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-5"
            >
              {/* Description */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>
                  Description
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {pkg.description}
                </p>
              </div>

              {/* README */}
              {pkg.readme && (
                <div
                  className="rounded-xl p-4 text-sm"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                >
                  <pre className="whitespace-pre-wrap font-sans leading-relaxed text-xs" style={{ color: 'var(--text-muted)' }}>
                    {pkg.readme}
                  </pre>
                </div>
              )}

              {/* Infos */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Auteur', value: pkg.author },
                  { label: 'Version', value: pkg.version },
                  { label: 'Licence', value: pkg.license },
                  { label: 'Catégorie', value: CATEGORY_LABELS[pkg.category as MarketplaceCategory] ?? pkg.category },
                  { label: 'Publié', value: timeAgo(pkg.publishedAt) },
                  { label: 'Versions', value: pkg.versions.join(', ') },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                  >
                    <div className="text-xs mb-0.5" style={{ color: 'var(--text-dimmed)' }}>{label}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {pkg.tags.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-dimmed)' }}>
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {pkg.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
                      >
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'content' && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-4"
            >
              {/* Agent */}
              {pkg.agent && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border-base)' }}
                >
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{ backgroundColor: 'color-mix(in srgb, #8b5cf6 8%, var(--bg-surface))', borderBottom: '1px solid var(--border-base)' }}
                  >
                    <Bot size={14} style={{ color: '#8b5cf6' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b5cf6' }}>
                      Agent inclus
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {pkg.agent.name}
                      </span>
                      <code
                        className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-dimmed)' }}
                      >
                        {pkg.agent.role}
                      </code>
                    </div>
                    {pkg.agent.description && (
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {pkg.agent.description}
                      </p>
                    )}
                    {pkg.agent.capabilities?.length > 0 && (
                      <div>
                        <div className="text-xs mb-1.5" style={{ color: 'var(--text-dimmed)' }}>Capacités :</div>
                        <div className="flex flex-wrap gap-1.5">
                          {pkg.agent.capabilities.map((cap: string) => (
                            <span
                              key={cap}
                              className="text-xs px-2 py-0.5 rounded font-mono"
                              style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {pkg.agent.triggerKeywords && pkg.agent.triggerKeywords.length > 0 && (
                      <div>
                        <div className="text-xs mb-1.5" style={{ color: 'var(--text-dimmed)' }}>Mots-clés :</div>
                        <div className="flex flex-wrap gap-1.5">
                          {pkg.agent.triggerKeywords.map((kw: string) => (
                            <span
                              key={kw}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ backgroundColor: 'color-mix(in srgb, #8b5cf6 10%, transparent)', color: '#8b5cf6' }}
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Skills */}
              {pkg.skills && pkg.skills.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap size={13} style={{ color: '#06b6d4' }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#06b6d4' }}>
                      Skills inclus ({pkg.skills.length})
                    </span>
                  </div>
                  {pkg.skills.map((skill) => (
                    <div
                      key={skill.name}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--border-base)' }}
                    >
                      <div
                        className="flex items-center gap-2 px-4 py-2.5"
                        style={{ backgroundColor: 'color-mix(in srgb, #06b6d4 8%, var(--bg-surface))', borderBottom: '1px solid var(--border-base)' }}
                      >
                        <Zap size={12} style={{ color: '#06b6d4' }} />
                        <code className="text-xs font-mono font-semibold" style={{ color: '#06b6d4' }}>
                          {skill.name}
                        </code>
                      </div>
                      <div className="p-3 space-y-2">
                        {skill.description && (
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                            {skill.description}
                          </p>
                        )}
                        {skill.parameters?.length > 0 && (
                          <div className="space-y-1">
                            {skill.parameters.map((p: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <code
                                  className="px-1.5 py-0.5 rounded font-mono"
                                  style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                                >
                                  {p.name}
                                </code>
                                <span style={{ color: 'var(--text-dimmed)' }}>{p.type}</span>
                                {p.required && (
                                  <span className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
                                    requis
                                  </span>
                                )}
                                <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>
                                  {p.description}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'reviews' && (
            <motion.div
              key="reviews"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-4"
            >
              {/* Formulaire d'avis */}
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
              >
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>
                  Laisser un avis
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Note :</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} onClick={() => setReviewRating(s)}>
                        <Star
                          size={16}
                          fill={s <= reviewRating ? "#eab308" : "transparent"}
                          strokeWidth={s <= reviewRating ? 0 : 1.5}
                          style={{ color: s <= reviewRating ? "#eab308" : "var(--text-dimmed)", cursor: 'pointer' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  value={reviewAuthor}
                  onChange={(e) => setReviewAuthor(e.target.value)}
                  placeholder="Ton pseudo"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                />
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Partage ton expérience avec ce paquet..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-base)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewSubmitting || !reviewText.trim() || !reviewAuthor.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                >
                  {reviewSubmitting ? (
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                  Publier
                </button>
              </div>

              {/* Liste des avis */}
              {pkg.reviews.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-dimmed)' }}>
                  Aucun avis pour l'instant. Sois le premier !
                </p>
              ) : (
                pkg.reviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-4 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                        >
                          {review.author[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {review.author}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={review.rating} size={11} />
                        <span className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
                          {timeAgo(review.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {review.comment}
                    </p>
                    {review.helpful > 0 && (
                      <div className="mt-2 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                        👍 {review.helpful} personnes ont trouvé cela utile
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div
              key="security"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-4"
            >
              {/* Score */}
              <div
                className="rounded-xl p-5"
                style={{ border: `2px solid ${TRUST_CONFIG[pkg.security.trustLevel].color}`, backgroundColor: `color-mix(in srgb, ${TRUST_CONFIG[pkg.security.trustLevel].color} 5%, var(--bg-surface))` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <TrustBadge level={pkg.security.trustLevel} />
                  <div className="text-right">
                    <div
                      className="text-3xl font-bold"
                      style={{ color: TRUST_CONFIG[pkg.security.trustLevel].color }}
                    >
                      {pkg.security.score}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-dimmed)' }}>/100</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {pkg.security.summary}
                </p>
                <div className="mt-3 text-xs" style={{ color: 'var(--text-dimmed)' }}>
                  Analysé {timeAgo(pkg.security.analyzedAt)}
                </div>
              </div>

              {/* Warnings */}
              {pkg.security.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-warning)' }}>
                    Avertissements ({pkg.security.warnings.length})
                  </h3>
                  <div className="space-y-2">
                    {pkg.security.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-3 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)' }}
                      >
                        <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                        <span style={{ color: 'var(--text-primary)' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Flags critiques */}
              {pkg.security.flags.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-error)' }}>
                    Problèmes critiques ({pkg.security.flags.length})
                  </h3>
                  <div className="space-y-2">
                    {pkg.security.flags.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-3 rounded-lg text-sm"
                        style={{ backgroundColor: 'var(--color-error-subtle)', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}
                      >
                        <ShieldAlert size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
                        <span style={{ color: 'var(--text-primary)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pkg.security.warnings.length === 0 && pkg.security.flags.length === 0 && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{ backgroundColor: 'var(--color-success-subtle)', border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)' }}
                >
                  <ShieldCheck size={20} style={{ color: 'var(--color-success)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Aucun problème de sécurité détecté. Ce paquet est sûr à utiliser.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Formulaire de publication ──
function PublishForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'security' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [secReport, setSecReport] = useState<any>(null);
  const [publishedPkg, setPublishedPkg] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const [draft, setDraft] = useState({
    name: '',
    description: '',
    type: 'agent' as MarketplacePackageType,
    category: 'code' as MarketplaceCategory,
    tags: '',
    version: '1.0.0',
    author: '',
    license: 'MIT',
    avatar: '🤖',
    color: '#6366f1',
    agentRole: '',
    agentName: '',
    agentDescription: '',
    agentSystemPrompt: '',
    skillName: '',
    skillDescription: '',
    skillInstruction: '',
  });

  const update = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const handleValidate = async () => {
    setSubmitting(true);
    setError(null);
    const payload = buildPayload();
    const result = await validateSecurity(payload);
    setSubmitting(false);
    if (result.securityReport) {
      setSecReport(result.securityReport);
      setStep('security');
    } else {
      setError(result.error || 'Erreur de validation');
    }
  };

  const handlePublish = async () => {
    setSubmitting(true);
    setError(null);
    const payload = buildPayload();
    const result = await publishPackage(payload);
    setSubmitting(false);
    if (result.success) {
      setPublishedPkg(result.package);
      setStep('done');
      toast.success(`"${result.package?.name}" publié dans le Marketplace !`);
    } else {
      setError(result.error || 'Erreur de publication');
    }
  };

  const buildPayload = () => ({
    name: draft.name,
    description: draft.description,
    type: draft.type,
    category: draft.category,
    tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
    version: draft.version,
    author: draft.author,
    license: draft.license,
    avatar: draft.avatar,
    color: draft.color,
    ...(draft.type !== 'skill' && draft.agentRole
      ? {
          agent: {
            name: draft.agentName || draft.name,
            role: draft.agentRole,
            description: draft.agentDescription,
            systemPrompt: draft.agentSystemPrompt,
            capabilities: [],
            tools: [],
            maxConcurrency: 2,
            defaultTimeoutMs: 60000,
            triggerKeywords: [],
          },
        }
      : {}),
    ...(draft.type !== 'agent' && draft.skillName
      ? {
          skills: [
            {
              name: draft.skillName,
              description: draft.skillDescription,
              parameters: [],
              instruction: draft.skillInstruction,
              category: draft.category,
              icon: 'Zap',
            },
          ],
        }
      : {}),
  });

  const inputStyle = {
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-base)',
    color: 'var(--text-primary)',
  };

  if (step === 'done' && publishedPkg) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl">
          {publishedPkg.avatar}
        </div>
        <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Paquet publié !
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          "{publishedPkg.name}" est maintenant disponible dans le Marketplace local.
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          Retour au Marketplace
        </button>
      </div>
    );
  }

  if (step === 'security' && secReport) {
    const cfg = TRUST_CONFIG[secReport.trustLevel as SecurityTrustLevel];
    return (
      <div className="flex flex-col h-full overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setStep('form')} className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'var(--text-muted)' }}>
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Rapport de sécurité
          </h2>
        </div>

        <div
          className="rounded-xl p-5"
          style={{ border: `2px solid ${cfg.color}`, backgroundColor: `color-mix(in srgb, ${cfg.color} 5%, var(--bg-surface))` }}
        >
          <div className="flex items-center justify-between mb-3">
            <TrustBadge level={secReport.trustLevel} />
            <span className="text-3xl font-bold" style={{ color: cfg.color }}>
              {secReport.score}<span className="text-sm font-normal">/100</span>
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{secReport.summary}</p>
        </div>

        {secReport.warnings.map((w: string, i: number) => (
          <div key={i} className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--color-warning-subtle)', border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)' }}>
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
            <span>{w}</span>
          </div>
        ))}

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        {secReport.flags.length === 0 ? (
          <button
            onClick={handlePublish}
            disabled={submitting}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold transition-all hover:scale-105 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload size={14} />}
            Publier dans le Marketplace
          </button>
        ) : (
          <div className="p-4 rounded-xl text-sm text-center" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
            Publication impossible : des problèmes critiques ont été détectés. Corrige-les avant de publier.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Publier un paquet
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Nom *</label>
          <input
            value={draft.name} onChange={(e) => update('name', e.target.value)}
            placeholder="Mon Super Agent"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Description *</label>
          <textarea
            value={draft.description} onChange={(e) => update('description', e.target.value)}
            placeholder="Une description courte et percutante..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
            style={inputStyle}
          />
        </div>
        {[
          { key: 'author', label: 'Auteur *', placeholder: 'ton_pseudo' },
          { key: 'version', label: 'Version', placeholder: '1.0.0' },
          { key: 'license', label: 'Licence', placeholder: 'MIT' },
          { key: 'avatar', label: 'Emoji avatar', placeholder: '🤖' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>{label}</label>
            <input
              value={(draft as any)[key]} onChange={(e) => update(key, e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        ))}
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Type</label>
          <select
            value={draft.type} onChange={(e) => update('type', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            <option value="agent">Agent</option>
            <option value="skill">Skill</option>
            <option value="bundle">Bundle</option>
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Catégorie</label>
          <select
            value={draft.category} onChange={(e) => update('category', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          >
            {Object.entries(CATEGORY_LABELS).filter(([k]) => k !== '').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Tags (séparés par virgule)</label>
          <input
            value={draft.tags} onChange={(e) => update('tags', e.target.value)}
            placeholder="typescript, api, automation"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Agent fields */}
      {draft.type !== 'skill' && (
        <div className="space-y-3 p-4 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, #8b5cf6 5%, var(--bg-surface))', border: '1px solid color-mix(in srgb, #8b5cf6 20%, transparent)' }}>
          <div className="flex items-center gap-2">
            <Bot size={13} style={{ color: '#8b5cf6' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b5cf6' }}>Agent</span>
          </div>
          {[
            { key: 'agentRole', label: 'Rôle (snake_case)', placeholder: 'mon_agent' },
            { key: 'agentName', label: 'Nom affiché', placeholder: 'Mon Agent' },
            { key: 'agentDescription', label: 'Description', placeholder: 'Cet agent...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>{label}</label>
              <input
                value={(draft as any)[key]} onChange={(e) => update(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>System Prompt</label>
            <textarea
              value={draft.agentSystemPrompt} onChange={(e) => update('agentSystemPrompt', e.target.value)}
              placeholder="Tu es un expert en..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none font-mono"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Skill fields */}
      {draft.type !== 'agent' && (
        <div className="space-y-3 p-4 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, #06b6d4 5%, var(--bg-surface))', border: '1px solid color-mix(in srgb, #06b6d4 20%, transparent)' }}>
          <div className="flex items-center gap-2">
            <Zap size={13} style={{ color: '#06b6d4' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#06b6d4' }}>Skill</span>
          </div>
          {[
            { key: 'skillName', label: 'Nom (snake_case)', placeholder: 'mon_skill' },
            { key: 'skillDescription', label: 'Description', placeholder: 'Ce skill...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>{label}</label>
              <input
                value={(draft as any)[key]} onChange={(e) => update(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
            </div>
          ))}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-dimmed)' }}>Instruction *</label>
            <textarea
              value={draft.skillInstruction} onChange={(e) => update('skillInstruction', e.target.value)}
              placeholder="Effectue les actions suivantes : {{param}}..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none font-mono"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <button
        onClick={handleValidate}
        disabled={submitting || !draft.name.trim() || !draft.description.trim() || !draft.author.trim()}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold transition-all hover:scale-105 disabled:opacity-40"
        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
      >
        {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Shield size={14} />}
        Valider la sécurité
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════════════════

type PanelView = 'home' | 'catalog' | 'installed' | 'publish';

interface MarketplacePanelProps {
  onClose: () => void;
}

export function MarketplacePanel({ onClose }: MarketplacePanelProps) {
  const state = useSyncExternalStore(subscribe, getMarketplaceState);
  const [view, setView] = useState<PanelView>('home');
  const [initialized, setInitialized] = useState(false);
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!initialized) {
      initMarketplaceStore();
      setInitialized(true);
    }
  }, [initialized]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSelect = useCallback((pkg: MarketplacePackage) => {
    selectPackage(pkg.id);
  }, []);

  const handleBack = useCallback(() => {
    clearSelectedPackage();
  }, []);

  const handleInstall = useCallback(async (id: string) => {
    const result = await installPackage(id);
    if (result.success) {
      toast.success(result.message || 'Paquet installé !');
    } else {
      toast.error(result.error || "Erreur lors de l'installation");
    }
  }, [toast]);

  const handleUninstall = useCallback(async (id: string) => {
    const result = await uninstallPackage(id);
    if (result.success) {
      toast.success('Paquet désinstallé.');
    } else {
      toast.error(result.error || 'Erreur lors de la désinstallation');
    }
  }, [toast]);

  const handleDownload = useCallback((id: string) => {
    downloadPackage(id);
  }, []);

  // ── Vues imbriquées ───────────────────────────────────────────────────────

  // Si un paquet est sélectionné → vue détail
  if (state.selectedPackage) {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-main)' }}>
        <PackageDetail
          pkg={state.selectedPackage}
          onBack={handleBack}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          installing={state.installLoading[state.selectedPackage.id] ?? false}
          onDownload={handleDownload}
        />
      </div>
    );
  }

  // Vue publication
  if (view === 'publish') {
    return (
      <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-main)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
          <Store size={16} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Marketplace</span>
          <span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>/ Publier</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'var(--text-dimmed)' }}>
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <PublishForm onClose={() => setView('catalog')} />
        </div>
      </div>
    );
  }

  // ── UI partagé : header + nav tabs ────────────────────────────────────────
  const navTabs: Array<{ id: PanelView; label: string; icon: React.FC<any> }> = [
    { id: 'home', label: 'Accueil', icon: Store },
    { id: 'catalog', label: 'Catalogue', icon: LayoutGrid },
    { id: 'installed', label: `Installés${state.installed.length > 0 ? ` (${state.installed.length})` : ''}`, icon: Check as any },
  ];

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-main)' }}>
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)' }}
        >
          <Store size={15} style={{ color: 'white' }} />
        </div>
        <div>
          <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Marketplace</h1>
          {state.stats && (
            <p className="text-xs" style={{ color: 'var(--text-dimmed)' }}>
              {state.stats.total} paquets · {formatNumber(state.stats.totalInstalls)} installations
            </p>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setView('publish')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          <Upload size={11} /> Publier
        </button>
        <button
          onClick={() => { initMarketplaceStore(); toast.info('Catalogue actualisé'); }}
          className="p-1.5 rounded-lg hover:bg-white/8 transition-colors"
          style={{ color: 'var(--text-dimmed)' }}
          title="Actualiser"
        >
          <RefreshCw size={13} className={state.loading ? 'animate-spin' : ''} />
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'var(--text-dimmed)' }}>
          <X size={14} />
        </button>
      </div>

      {/* ── Nav tabs ── */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
        {navTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
            style={{
              color: view === id ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: view === id ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Contenu des vues ── */}
      <AnimatePresence mode="wait">
        {/* ─────── ACCUEIL ─────── */}
        {view === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            {/* Stats globales */}
            {state.stats && (
              <div className="grid grid-cols-4 gap-3 p-4 border-b" style={{ borderColor: 'var(--border-base)' }}>
                {[
                  { label: 'Paquets', value: state.stats.total, Icon: Package, color: 'var(--accent-primary)' },
                  { label: 'Agents', value: state.stats.agents, Icon: Bot, color: '#8b5cf6' },
                  { label: 'Skills', value: state.stats.skills, Icon: Zap, color: '#06b6d4' },
                  { label: 'Installés', value: state.stats.installed, Icon: Check as any, color: 'var(--color-success)' },
                ].map(({ label, value, Icon, color }) => (
                  <div
                    key={label}
                    className="rounded-xl p-3 text-center"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, var(--bg-surface))`, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}
                  >
                    <Icon size={16} className="mx-auto mb-1" style={{ color }} />
                    <div className="text-lg font-bold" style={{ color }}>{value}</div>
                    <div className="text-xs" style={{ color: 'var(--text-dimmed)' }}>{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Recherche rapide */}
            <div className="px-4 pt-4 pb-2">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                onClick={() => { setView('catalog'); setTimeout(() => searchRef.current?.focus(), 50); }}
              >
                <Search size={14} style={{ color: 'var(--text-dimmed)' }} />
                <span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>
                  Rechercher agents, skills, bundles...
                </span>
              </div>
            </div>

            {/* Catégories rapides */}
            <div className="px-4 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-dimmed)' }}>
                Catégories
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(CATEGORY_LABELS).filter(([k]) => k !== '') as [MarketplaceCategory, string][]).map(([key, label]) => {
                  const Icon = CATEGORY_ICONS[key] ?? Package;
                  return (
                    <button
                      key={key}
                      onClick={() => { setView('catalog'); setActiveCategory(key); }}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all hover:scale-105"
                      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
                    >
                      <Icon size={18} style={{ color: 'var(--accent-primary)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Featured */}
            {state.featured.length > 0 && (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-dimmed)' }}>
                    <Award size={12} style={{ color: '#eab308' }} /> En vedette
                  </h2>
                  <button
                    onClick={() => setView('catalog')}
                    className="text-xs hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Voir tout
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {state.featured.slice(0, 4).map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      onSelect={handleSelect}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      installing={state.installLoading[pkg.id] ?? false}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ─────── CATALOGUE ─────── */}
        {view === 'catalog' && (
          <motion.div
            key="catalog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Barre de filtres */}
            <div className="flex flex-col gap-2 p-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
              {/* Search */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)' }}
              >
                <Search size={13} style={{ color: 'var(--text-dimmed)' }} />
                <input
                  ref={searchRef}
                  value={state.searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                {state.searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ color: 'var(--text-dimmed)' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filtres type + catégorie + tri */}
              <div className="flex gap-2 flex-wrap">
                {/* Type */}
                <select
                  value={state.activeType}
                  onChange={(e) => setActiveType(e.target.value as any)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                {/* Catégorie */}
                <select
                  value={state.activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value as any)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                {/* Tri */}
                <select
                  value={state.activeSort}
                  onChange={(e) => setActiveSort(e.target.value as any)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-base)', color: 'var(--text-muted)' }}
                >
                  {Object.entries(SORT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                <div className="flex-1" />
                <span className="text-xs self-center" style={{ color: 'var(--text-dimmed)' }}>
                  {state.total} résultat{state.total !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Grille de résultats */}
            <div className="flex-1 overflow-y-auto p-3">
              {state.loading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--text-dimmed)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>Chargement...</span>
                </div>
              ) : state.error ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <AlertTriangle size={24} style={{ color: 'var(--color-error)' }} />
                  <span className="text-sm" style={{ color: 'var(--color-error)' }}>{state.error}</span>
                  <button
                    onClick={() => searchMarketplace()}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                  >
                    Réessayer
                  </button>
                </div>
              ) : state.packages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <Package size={32} style={{ color: 'var(--text-dimmed)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-dimmed)' }}>Aucun paquet trouvé</span>
                  <button
                    onClick={() => { setSearchQuery(''); setActiveType(''); setActiveCategory(''); }}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-base)' }}
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {state.packages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      onSelect={handleSelect}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      installing={state.installLoading[pkg.id] ?? false}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {state.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border-base)' }}>
                <button
                  onClick={() => setPage(state.page - 1)}
                  disabled={state.page <= 1}
                  className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {state.page} / {state.totalPages}
                </span>
                <button
                  onClick={() => setPage(state.page + 1)}
                  disabled={state.page >= state.totalPages}
                  className="p-1.5 rounded-lg hover:bg-white/8 disabled:opacity-30"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ─────── INSTALLÉS ─────── */}
        {view === 'installed' && (
          <motion.div
            key="installed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto p-4"
          >
            {state.installed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--accent-subtle)' }}>
                  <Package size={28} style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    Aucun paquet installé
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Explore le catalogue et installe des agents et skills en un clic.
                  </p>
                </div>
                <button
                  onClick={() => setView('catalog')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                >
                  <LayoutGrid size={13} /> Explorer le catalogue
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {state.installed.map((pkg) => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    onSelect={handleSelect}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    installing={state.installLoading[pkg.id] ?? false}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
