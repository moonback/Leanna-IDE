import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Activity, AudioLines, BookOpen, Bot, CalendarClock, ChevronDown, Coins, Cpu, FilePlus, GitBranch,
  History, ListChecks, Loader2, Mail, Maximize2, MessageSquare, Mic, MicOff, Moon, MoreHorizontal, Search, Settings, Command,
  Sparkles, Timer, Workflow, CheckCircle2, XCircle, KeyRound, Power, PowerOff, RefreshCw, Sun,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useLiveAPIContext } from '../../context/LiveAPIContext.js';
import { useProfile } from '../../context/UserProfileContext.js';
import { useWorkspaceState } from '../../hooks/useWorkspaceState.js';
import { Modal, StatusBadge } from '../ui/index.js';
import { useGitInfo, useGeminiStatus, type EmptyEditorStateProps } from './EmptyEditorState.js';
import { DashboardCore } from './DashboardCore.js';

// ─── Utilitaires ─────────────────────────────────────────────────────────

const SPRING = { type: 'spring' as const, bounce: 0.15, duration: 0.5 };
const AUDIT_POLL_MS = 30_000; // même cadence que SystemHealthDashboard
const BARS = 40;

const DEFAULT_SECTION_ORDER = ['operations', 'audio', 'session', 'tokens', 'activity', 'transcript', 'plan', 'system', 'automations', 'project', 'recent'];

// En xl : 1 bandeau (12 col.) puis 2 rangées de 12 colonnes chacune ; grid-flow dense comble les trous après réorganisation.
const SECTION_SPAN: Record<string, string> = {
  operations: 'md:col-span-4 xl:col-span-12',
  audio: 'md:col-span-2 xl:col-span-3',
  session: 'md:col-span-2 xl:col-span-2',
  tokens: 'md:col-span-2 xl:col-span-2',
  activity: 'md:col-span-2 xl:col-span-3',
  plan: 'md:col-span-2 xl:col-span-2',
  transcript: 'md:col-span-2 xl:col-span-3',
  system: 'md:col-span-2 xl:col-span-3',
  automations: 'md:col-span-2 xl:col-span-2',
  project: 'md:col-span-2 xl:col-span-2',
  recent: 'md:col-span-2 xl:col-span-2',
};

const fmtInt = (n: number) => n.toLocaleString('fr-FR');
const fmtTime = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

/** Horodatage courant rafraîchi toutes les `ms` (isolé dans les petits composants qui en ont besoin). */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

interface AuditReport {
  cpus: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  uptimeHours: number;
  nodeVersion: string;
  platform: string;
  geminiOk: boolean;
  supabaseOk: boolean;
  openrouterOk: boolean;
  telegramOk: boolean;
  mcpOk: boolean;
  mcpConnected: number;
  mcpTotal: number;
}

function useAudit() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const aliveRef = useRef(true);

  const load = useCallback(() => {
    if (document.hidden) return; // /api/audit sonde des services externes : pas en arrière-plan
    setLoading(true);
    fetch('/api/audit')
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!aliveRef.current || json?.status !== 'ok') return;
        const rep = json.report as AuditReport;
        setReport(rep);
        setUpdatedAt(Date.now());
        if (rep.totalMemoryMB > 0) {
          setMemHistory(h => [...h, ((rep.totalMemoryMB - rep.freeMemoryMB) / rep.totalMemoryMB) * 100].slice(-20));
        }
      })
      .catch(() => { /* carte « indisponible » */ })
      .finally(() => { if (aliveRef.current) setLoading(false); });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const id = setInterval(load, AUDIT_POLL_MS);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, [load]);
  return { report, updatedAt, memHistory, loading, reload: load };
}

interface RecentConversation { id: string; title: string | null; message_count: number; started_at: string }

function useRecentConversations(workspacePath?: string) {
  const [items, setItems] = useState<RecentConversation[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/conversations?limit=6', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        const list = Array.isArray(data?.conversations) ? data.conversations : [];
        setItems(list
          .filter((c: any) => typeof c.id === 'string' && Number(c.message_count) > 0)
          .slice(0, 6)
          .map((c: any) => ({ id: c.id, title: c.title ?? null, message_count: Number(c.message_count), started_at: c.started_at })));
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [workspacePath]);
  return items;
}

// ─── Briques visuelles ───────────────────────────────────────────────────

interface CardAction { label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; onClick: () => void }

const Card = React.memo(function Card({
  title, icon: Icon, index, className = '', right, children, menu = [], expanded,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  index: number;
  className?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Actions supplémentaires du menu ⋯ (« Agrandir » est toujours présent). */
  menu?: CardAction[];
  /** Contenu détaillé de la modale ; à défaut, le contenu de la carte. */
  expanded?: React.ReactNode;
}) {
  const reduce = !!useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);
  const items: CardAction[] = [{ label: 'Agrandir', icon: Maximize2, onClick: () => setModalOpen(true) }, ...menu];
  return (
    <>
    <motion.section
      className={`group relative flex h-full min-h-0 min-w-0 flex-col rounded-xl border p-2.5 ${className}`}
      style={{
        zIndex: menuOpen ? 30 : undefined,
        backgroundColor: 'color-mix(in srgb, var(--bg-panel) 92%, transparent)',
        borderColor: 'color-mix(in srgb, var(--border-base) 58%, transparent)',
        backdropFilter: 'blur(14px)',
        transformStyle: 'preserve-3d',
        perspective: '1100px',
        backgroundImage: 'radial-gradient(circle at var(--pointer-x, 50%) var(--pointer-y, 50%), color-mix(in srgb, var(--accent-primary) 10%, transparent), transparent 42%)',
        boxShadow: '0 8px 24px color-mix(in srgb, var(--bg) 22%, transparent)',
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, rotateX: -14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { ...SPRING, delay: 0.04 * index }}
      whileHover={reduce ? undefined : { y: -4, rotateX: 2.2, rotateY: -1.8, scale: 1.008, borderColor: 'var(--accent-primary)', boxShadow: '0 20px 42px color-mix(in srgb, var(--accent-primary) 17%, transparent)' }}
      onPointerMove={event => {
        if (reduce || event.pointerType === 'touch') return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        event.currentTarget.style.setProperty('--pointer-x', `${Math.round(x * 100)}%`);
        event.currentTarget.style.setProperty('--pointer-y', `${Math.round(y * 100)}%`);
      }}
      onPointerLeave={event => {
        event.currentTarget.style.setProperty('--pointer-x', '50%');
        event.currentTarget.style.setProperty('--pointer-y', '50%');
      }}
      aria-label={title}
    >
      {/* Filet lumineux qui balaie le haut de la carte au survol. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-4 top-0 h-px overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <span className="dash-sweep absolute inset-y-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />
      </span>
      <header className="mb-1.5 flex shrink-0 items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-110"
          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent-primary) 22%, transparent)' }}
        >
          <Icon size={13} />
        </span>
        <h2 className="truncate text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          {right}
          <div ref={menuRef} className="relative">
            <span className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
              <MiniButton label={`Options : ${title}`} icon={MoreHorizontal} onClick={() => setMenuOpen(value => !value)} active={menuOpen} />
            </span>
            <AnimatePresence>
              {menuOpen && (
                <motion.div role="menu" aria-label={`Options ${title}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, rotateX: -20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border p-1 shadow-2xl"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)', transformOrigin: 'top right', boxShadow: '0 18px 40px rgba(0,0,0,.4)' }}>
                  {items.map(item => (
                    <button key={item.label} type="button" role="menuitem"
                      onClick={() => { setMenuOpen(false); item.onClick(); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[var(--accent-subtle)]"
                      style={{ color: 'var(--text-primary)' }}>
                      <item.icon size={13} style={{ color: 'var(--accent-primary)' }} /> {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      <div className="dash-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
    </motion.section>
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={title} size="lg">
      <Modal.Body>{expanded ?? children}</Modal.Body>
    </Modal>
    </>
  );
});

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="truncate font-mono text-base font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        <AnimatedValue value={value} />
      </div>
    </div>
  );
}

/** Fait glisser la nouvelle valeur quand elle change. */
function AnimatedValue({ value }: { value: React.ReactNode }) {
  const reduce = !!useReducedMotion();
  const key = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  if (key === undefined) return <>{value}</>;
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={key}
          initial={reduce ? { opacity: 0 } : { y: '80%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: '-80%', opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function MiniButton({ label, icon: Icon, onClick, active = false, spin = false }: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
  active?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md border transition-colors hover:border-[var(--accent-primary)]"
      style={{
        borderColor: 'var(--border-base)',
        backgroundColor: active ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
        color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
      }}
    >
      <Icon size={12} className={spin ? 'animate-spin' : undefined} />
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1.5 text-xs" style={{ color: 'var(--text-dimmed)' }}>{children}</p>;
}

function Ring({ percent, label, color = 'var(--accent-primary)' }: { percent: number; label: string; color?: string }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative h-16 w-16 flex-shrink-0" role="img" aria-label={`${label} : ${Math.round(p)} %`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border-base)" strokeWidth="6" />
        <motion.circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p / 100) }}
          transition={{ type: 'spring', bounce: 0, duration: 0.8 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        {Math.round(p)}%
      </span>
    </div>
  );
}

function Bar({ percent, color = 'var(--accent-primary)' }: { percent: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--border-base)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        transition={{ type: 'spring', bounce: 0, duration: 0.8 }}
      />
    </div>
  );
}

function Sparkline({ values, max: fixedMax }: { values: number[]; max?: number }) {
  const gradId = React.useId();
  if (values.length < 2) return <div className="h-12" />;
  const max = fixedMax ?? Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${38 - (v / max) * 34}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polygon
        key={`a${values.length}`}
        points={`0,40 ${pts} 100,40`}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      />
      <motion.polyline
        key={values.length}
        points={pts}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ─── Cartes temps réel ───────────────────────────────────────────────────

function LiveClock() {
  const now = useNow(1000);
  const d = new Date(now);
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sec = String(d.getSeconds()).padStart(2, '0');
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div>
      <div className="flex items-baseline gap-1 font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
        <span className="text-xl font-bold tracking-tight">{hm}</span>
        <span className="text-sm" style={{ color: 'var(--accent-primary)' }}><AnimatedValue value={sec} /></span>
      </div>
      <div className="text-xs first-letter:uppercase" style={{ color: 'var(--text-muted)' }}>{date}</div>
    </div>
  );
}

/**
 * Niveaux audio micro / sortie : boucle requestAnimationFrame et écriture
 * directe dans le DOM (≈30 i/s sans re-render React), comme MicLevelMeter.
 */
function AudioCard({ index }: { index: number }) {
  const { getInputAmplitude, getOutputAmplitude, muted, asleep, connected, isBusy, toggleMute, wake } = useLiveAPIContext();
  const reduce = !!useReducedMotion();
  const inRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const outRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const orbRef = useRef<HTMLDivElement>(null);
  const inPeakRef = useRef<HTMLSpanElement>(null);
  const outPeakRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const inHist = new Array(BARS).fill(0);
    const outHist = new Array(BARS).fill(0);
    const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    const paint = (refs: (HTMLSpanElement | null)[], hist: number[]) => {
      for (let i = 0; i < BARS; i++) {
        const el = refs[i];
        if (el) el.style.transform = `scaleY(${Math.max(0.05, hist[i])})`;
      }
    };
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (t - last < 33) return;
      last = t;
      const i = connected && !muted && !asleep ? clamp(getInputAmplitude()) : 0;
      const o = connected ? clamp(getOutputAmplitude()) : 0;
      if (reduce) { inHist.fill(i); outHist.fill(o); } else {
        inHist.shift(); inHist.push(i); outHist.shift(); outHist.push(o);
      }
      paint(inRefs.current, inHist);
      paint(outRefs.current, outHist);
      if (orbRef.current) {
        const s = 1 + (reduce ? 0 : Math.max(i, o) * 0.6);
        orbRef.current.style.transform = `scale(${s})`;
        orbRef.current.style.opacity = String(0.35 + Math.max(i, o) * 0.65);
      }
      if (inPeakRef.current) inPeakRef.current.textContent = `${Math.round(i * 100)}`;
      if (outPeakRef.current) outPeakRef.current.textContent = `${Math.round(o * 100)}`;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getInputAmplitude, getOutputAmplitude, connected, muted, asleep, reduce]);

  const MicIcon = muted ? MicOff : asleep ? Moon : Mic;
  const micInactive = !connected || muted || asleep;
  const micColor = micInactive ? 'var(--text-dimmed)' : 'var(--accent-primary)';
  const state = !connected ? 'Hors ligne' : muted ? 'Micro coupé' : asleep ? 'En veille' : isBusy ? 'Outil en cours' : 'À l\'écoute';

  const bars = (refs: React.MutableRefObject<(HTMLSpanElement | null)[]>, color: string) => (
    <div className="flex h-6 flex-1 items-end gap-[2px]" aria-hidden>
      {Array.from({ length: BARS }, (_, k) => (
        <span
          key={k}
          ref={el => { refs.current[k] = el; }}
          className="h-full flex-1 rounded-sm"
          style={{ backgroundColor: color, transform: 'scaleY(0.05)', transformOrigin: 'bottom', transition: reduce ? undefined : 'transform 60ms linear' }}
        />
      ))}
    </div>
  );

  return (
    <Card title="Audio en direct" icon={AudioLines} index={index}
      menu={connected ? [{ label: muted ? 'Activer le micro' : 'Couper le micro', icon: muted ? Mic : MicOff, onClick: toggleMute }] : []}
      right={<>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{state}</span>
        {connected && asleep && !muted && (
          <MiniButton label="Réveiller" icon={Sun} onClick={wake} />
        )}
        {connected && (
          <MiniButton label={muted ? 'Activer le micro' : 'Couper le micro'} icon={muted ? Mic : MicOff} onClick={toggleMute} active={muted} />
        )}
      </>}>
      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center">
          <div
            ref={orbRef}
            className="absolute inset-0 rounded-full"
            style={{
              background: micInactive
                ? 'radial-gradient(circle, var(--text-dimmed) 0%, color-mix(in srgb, var(--text-dimmed) 20%, transparent) 60%, transparent 72%)'
                : 'radial-gradient(circle, var(--accent-primary) 0%, color-mix(in srgb, var(--accent-primary) 20%, transparent) 60%, transparent 72%)',
              opacity: micInactive ? 0.12 : 0.35,
              transition: reduce ? undefined : 'transform 80ms linear, opacity 80ms linear',
            }}
          />
          <MicIcon size={22} style={{ color: micInactive ? 'var(--text-dimmed)' : 'var(--text-primary)', position: 'relative', opacity: micInactive ? 0.65 : 1 }} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] uppercase" style={{ color: 'var(--text-dimmed)' }}>Micro</span>
            {bars(inRefs, micColor)}
            <span ref={inPeakRef} className="w-7 text-right font-mono text-xs tabular-nums" style={{ color: micInactive ? 'var(--text-dimmed)' : 'var(--text-muted)' }}>0</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-[10px] uppercase" style={{ color: 'var(--text-dimmed)' }}>Leanna</span>
            {bars(outRefs, 'var(--color-success, #22c55e)')}
            <span ref={outPeakRef} className="w-7 text-right font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>0</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SessionCard({ index }: { index: number }) {
  const { status, connected, transcript, lastLatencyMs, getLatencyStats } = useLiveAPIContext();
  const now = useNow(1000);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  useEffect(() => { setConnectedAt(connected ? Date.now() : null); }, [connected]);
  // getLatencyStats lit une ref : recalcul quand une nouvelle mesure arrive.
  const stats = useMemo(() => getLatencyStats(), [getLatencyStats, lastLatencyMs]);
  const userMsgs = transcript.filter(t => t.role === 'user').length;
  const badge = status === 'connected' ? 'connected' : status === 'connecting' ? 'waiting' : 'disconnected';
  return (
    <Card title="Session vocale" icon={Activity} index={index}
      right={<StatusBadge status={badge} size="sm" pulse={status === 'connecting'}
        label={status === 'connected' ? 'Connectée' : status === 'connecting' ? 'Connexion…' : 'Déconnectée'} />}>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Durée" value={connectedAt ? fmtDuration(now - connectedAt) : '—'} />
        <Stat label="Messages" value={`${userMsgs} / ${transcript.length - userMsgs}`} hint="Vous / Leanna" />
        <Stat label="Latence" value={lastLatencyMs != null ? `${lastLatencyMs} ms` : '—'} hint="Dernier délai avant la première réponse audio" />
        <Stat label="Moy. (min–max)" value={stats ? `${stats.avg} (${stats.min}–${stats.max})` : '—'} hint={stats ? `${stats.samples} mesures` : undefined} />
      </div>
    </Card>
  );
}

function TokensCard({ index }: { index: number }) {
  const { tokenUsage, promptContext } = useLiveAPIContext();
  const series = useMemo(() => tokenUsage.history.slice(-30).map(h => h.totalTokens), [tokenUsage.history]);
  const ctxColor = promptContext.level === 'critical' ? 'var(--color-error)' : promptContext.level === 'warn' ? 'var(--color-warning)' : 'var(--accent-primary)';
  return (
    <Card title="Tokens & contexte" icon={Coins} index={index}>
      <div className="flex items-center gap-3">
        <Ring percent={promptContext.percent} label="Contexte utilisé" color={ctxColor} />
        <div className="grid flex-1 grid-cols-2 gap-2">
          <Stat label="Total" value={fmtInt(tokenUsage.totalTokens)} />
          <Stat label="Tours" value={promptContext.turns} />
          <Stat label="Entrée" value={fmtInt(tokenUsage.totalPromptTokens)} />
          <Stat label="Sortie" value={fmtInt(tokenUsage.totalCompletionTokens)} />
        </div>
      </div>
      <div className="mt-2">
        {series.length >= 2 ? <Sparkline values={series} /> : <Empty>La courbe apparaît après deux échanges.</Empty>}
      </div>
      {promptContext.suggestion && (
        <p className="mt-1 text-xs" style={{ color: ctxColor }}>{promptContext.suggestion}</p>
      )}
    </Card>
  );
}

function ActivityCard({ index }: { index: number }) {
  const { activity, isBusy, reasoning } = useLiveAPIContext();
  const reduce = !!useReducedMotion();
  const steps = activity.slice(-7).reverse();
  const done = activity.filter(a => a.status === 'done').length;
  const errors = activity.filter(a => a.status === 'error').length;
  const full = activity.length === 0 ? <Empty>Aucun outil appelé pour l'instant.</Empty> : (
    <ul className="flex flex-col gap-1">
      {[...activity].reverse().map(s => (
        <li key={s.id} className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.status === 'running' ? 'var(--accent-primary)' : s.status === 'done' ? 'var(--color-success, #22c55e)' : 'var(--color-error)' }} />
            <span style={{ color: 'var(--text-primary)' }}>{s.label}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-dimmed)' }}>{fmtTime(s.timestamp)}{s.endTimestamp ? ` · ${fmtDuration(s.endTimestamp.getTime() - s.timestamp.getTime())}` : ''}</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.tool}{s.detail ? ` — ${s.detail}` : ''}</div>
        </li>
      ))}
    </ul>
  );
  return (
    <Card title="Activité des outils" icon={Bot} index={index} expanded={full}
      right={<span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        {done} ✓ · {errors} ✗{isBusy && ' · en cours'}
      </span>}>
      {reasoning?.active && (
        <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
          <Sparkles size={12} /> Raisonnement : {reasoning.strategyLabel ?? reasoning.strategy ?? 'actif'}
        </div>
      )}
      {steps.length === 0 ? <Empty>Aucun outil appelé pour l'instant.</Empty> : (
        <ul className="flex flex-col gap-1">
          <AnimatePresence initial={false}>
            {steps.map(s => {
              const Icon = s.status === 'running' ? Loader2 : s.status === 'done' ? CheckCircle2 : XCircle;
              const color = s.status === 'running' ? 'var(--accent-primary)' : s.status === 'done' ? 'var(--color-success, #22c55e)' : 'var(--color-error)';
              return (
                <motion.li
                  key={s.id}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <span className={s.status === 'running' && !reduce ? 'animate-spin' : undefined} style={{ display: 'inline-flex' }}>
                    <Icon size={13} style={{ color, flexShrink: 0 }} />
                  </span>
                  <span className="truncate" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                  <span className="ml-auto flex-shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-dimmed)' }}>
                    {s.endTimestamp ? fmtDuration(s.endTimestamp.getTime() - s.timestamp.getTime()) : fmtTime(s.timestamp)}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

function TranscriptCard({ index, aiName, onOpenChat }: { index: number; aiName: string; onOpenChat?: () => void }) {
  const { transcript } = useLiveAPIContext();
  const reduce = !!useReducedMotion();
  const all = transcript.filter(t => t.text?.trim());
  const last = all.slice(-4);
  const full = all.length === 0 ? <Empty>Aucun échange pour l'instant.</Empty> : (
    <ul className="flex flex-col gap-2">
      {all.map(t => (
        <li key={t.id} className="rounded-lg px-3 py-2 text-sm leading-relaxed"
          style={{ backgroundColor: t.role === 'user' ? 'var(--bg-secondary)' : 'var(--accent-subtle)', color: 'var(--text-primary)' }}>
          <div className="mb-0.5 text-[11px] font-semibold" style={{ color: t.role === 'user' ? 'var(--text-muted)' : 'var(--accent-primary)' }}>{t.role === 'user' ? 'Vous' : aiName}</div>
          <div className="whitespace-pre-wrap">{t.text}</div>
        </li>
      ))}
    </ul>
  );
  return (
    <Card title="Conversation en direct" icon={MessageSquare} index={index} expanded={full}
      menu={onOpenChat ? [{ label: 'Ouvrir le chat', icon: MessageSquare, onClick: onOpenChat }] : []}>
      {last.length === 0 ? <Empty>Parlez à {aiName} : les derniers échanges s'afficheront ici.</Empty> : (
        <ul className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {last.map(t => (
              <motion.li key={t.id} layout={!reduce} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-lg px-2 py-1 text-xs leading-snug"
                style={{
                  backgroundColor: t.role === 'user' ? 'var(--bg-secondary)' : 'var(--accent-subtle)',
                  color: 'var(--text-primary)',
                }}>
                <span className="font-semibold" style={{ color: t.role === 'user' ? 'var(--text-muted)' : 'var(--accent-primary)' }}>
                  {t.role === 'user' ? 'Vous' : aiName} ·
                </span>{' '}
                <span className="line-clamp-2">{t.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

function PlanCard({ index }: { index: number }) {
  const { currentPlan } = useLiveAPIContext();
  const progress = useMemo(() => {
    if (!currentPlan) return null;
    const boxes = currentPlan.match(/^\s*[-*]\s*\[( |x|X)\]/gm) ?? [];
    if (boxes.length === 0) return null;
    return { done: boxes.filter(b => /\[(x|X)\]/.test(b)).length, total: boxes.length };
  }, [currentPlan]);
  return (
    <Card title="Plan courant" icon={ListChecks} index={index}
      right={progress && <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{progress.done}/{progress.total}</span>}>
      {!currentPlan ? <Empty>Aucun plan en cours.</Empty> : (
        <>
          {progress && <div className="mb-2"><Bar percent={(progress.done / progress.total) * 100} /></div>}
          <pre className="whitespace-pre-wrap text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
            {currentPlan}
          </pre>
        </>
      )}
    </Card>
  );
}

function AutomationsCard({ index }: { index: number }) {
  const { scheduledTasks, workflows } = useLiveAPIContext();
  const now = useNow(1000);
  const active = scheduledTasks.filter(t => t.enabled !== false);
  const next = active
    .filter(t => t.lastRunAt)
    .map(t => ({ name: t.name, at: (t.lastRunAt as number) + t.intervalMs }))
    .sort((a, b) => a.at - b.at)[0];
  const okWf = workflows.filter(w => w.lastRunStatus === 'success').length;
  const failWf = workflows.filter(w => w.lastRunStatus === 'failed').length;
  return (
    <Card title="Automatisations" icon={CalendarClock} index={index}>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Tâches actives" value={`${active.length} / ${scheduledTasks.length}`} />
        <Stat label="Workflows" value={`${workflows.filter(w => w.enabled).length} / ${workflows.length}`} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Timer size={12} />
        {next ? <span className="truncate">Prochaine : <b style={{ color: 'var(--text-primary)' }}>{next.name}</b> dans <span className="font-mono">{fmtDuration(next.at - now)}</span></span>
          : <span>Aucune exécution planifiée connue</span>}
      </div>
      {workflows.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Workflow size={12} /> Derniers runs : {okWf} réussis · {failWf} échoués
        </div>
      )}
    </Card>
  );
}

function SystemCard({ index }: { index: number }) {
  const { report, updatedAt, memHistory, loading, reload } = useAudit();
  const now = useNow(1000);
  const refresh = <MiniButton label="Actualiser" icon={RefreshCw} onClick={reload} spin={loading} />;
  if (!report) {
    return <Card title="Système" icon={Cpu} index={index} right={refresh}>
      <Empty>{loading ? 'Chargement…' : 'Données système indisponibles.'}</Empty>
    </Card>;
  }
  const usedMB = report.totalMemoryMB - report.freeMemoryMB;
  const usedPct = report.totalMemoryMB > 0 ? (usedMB / report.totalMemoryMB) * 100 : 0;
  const services: [string, boolean][] = [
    ['Gemini', report.geminiOk], ['Supabase', report.supabaseOk], ['OpenRouter', report.openrouterOk],
    ['Telegram', report.telegramOk], [`MCP ${report.mcpConnected}/${report.mcpTotal}`, report.mcpOk],
  ];
  return (
    <Card title="Système" icon={Cpu} index={index}
      menu={[{ label: 'Actualiser', icon: RefreshCw, onClick: reload }]}
      right={<>
        {updatedAt && <span className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>il y a {fmtDuration(now - updatedAt)}</span>}
        {refresh}
      </>}>
      <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Mémoire</span>
        <span className="font-mono">{(usedMB / 1024).toFixed(1)} / {(report.totalMemoryMB / 1024).toFixed(1)} Go</span>
      </div>
      <Bar percent={usedPct} color={usedPct > 90 ? 'var(--color-error)' : usedPct > 75 ? 'var(--color-warning)' : 'var(--accent-primary)'} />
      {memHistory.length >= 2 && <div className="mt-1"><Sparkline values={memHistory} max={100} /></div>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Uptime machine" value={fmtDuration(report.uptimeHours * 3_600_000)} />
        <Stat label="CPU" value={`${report.cpus} cœurs`} hint={`${report.platform} · Node ${report.nodeVersion}`} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {services.map(([name, ok]) => (
          <span key={name} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ok ? 'var(--color-success, #22c55e)' : 'var(--color-error)' }} />
            {name}
          </span>
        ))}
      </div>
    </Card>
  );
}

type OperationalOverview = {
  agents: number;
  agentTasks: number;
  runningAgentTasks: number;
  missions: number;
  activeMissions: number;
  emailAccounts: number;
  configuredEmailAccounts: number;
};

function useOperationalOverview() {
  const [data, setData] = useState<OperationalOverview | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (document.hidden) return;
    setLoading(true);
    const results = await Promise.allSettled([
      fetch('/api/agents/roles', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Agents'); return r.json(); }),
      fetch('/api/agents/tasks', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Tâches agents'); return r.json(); }),
      fetch('/api/missions', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('Missions'); return r.json(); }),
      fetch('/api/email/settings', { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('E-mail'); return r.json(); }),
    ]);
    const [rolesResult, tasksResult, missionsResult, emailResult] = results;
    if (results.every(r => r.status === 'fulfilled')) {
      const roles = rolesResult.status === 'fulfilled' ? rolesResult.value : {};
      const tasksData = tasksResult.status === 'fulfilled' ? tasksResult.value : {};
      const missionsData = missionsResult.status === 'fulfilled' ? missionsResult.value : {};
      const emailData = emailResult.status === 'fulfilled' ? emailResult.value : {};
      const tasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
      const missions = Array.isArray(missionsData?.missions) ? missionsData.missions : [];
      const accounts = emailData?.status === 'success' ? emailData.data?.accounts : null;
      const emailAccounts = accounts ? [accounts.leanna, accounts.personal].filter((a: any) => a?.connected).length : 0;
      const configuredEmailAccounts = accounts ? [accounts.leanna, accounts.personal].filter((a: any) => !!a?.email).length : 0;
      setData({
        agents: Array.isArray(roles?.roles) ? roles.roles.length : 0,
        agentTasks: tasks.length,
        runningAgentTasks: tasks.filter((t: any) => ['pending', 'running', 'in_progress'].includes(String(t.status).toLowerCase())).length,
        missions: missions.length,
        activeMissions: missions.filter((m: any) => ['pending', 'in_progress', 'running', 'paused', 'blocked'].includes(String(m.status).toLowerCase())).length,
        emailAccounts,
        configuredEmailAccounts,
      });
      setUpdatedAt(Date.now());
      setError(null);
    } else {
      const failed = results.flatMap((r, i) => r.status === 'rejected' ? [['Agents', 'Tâches agents', 'Missions', 'E-mail'][i]] : []);
      setError(`Données indisponibles : ${failed.join(', ')}`);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);
  return { data, updatedAt, loading, error, reload: load };
}

function OperationalOverviewCard({ index }: { index: number }) {
  const { data, updatedAt, loading, error, reload } = useOperationalOverview();
  const now = useNow(1000);
  const total = data ? data.agents + data.missions + data.emailAccounts : null;
  return (
    <Card title="Données opérationnelles en temps réel" icon={Activity} index={index}
      menu={[{ label: 'Actualiser les données', icon: RefreshCw, onClick: () => void reload() }]}
      right={<>
        {updatedAt && <span className="text-[11px]" style={{ color: 'var(--text-dimmed)' }}>Actualisé il y a {fmtDuration(now - updatedAt)}</span>}
        <MiniButton label="Actualiser les données" icon={RefreshCw} onClick={() => void reload()} spin={loading} />
      </>}>
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Bot size={20} style={{ color: 'var(--accent-primary)' }} />
              <div><Stat label="Agents disponibles" value={fmtInt(data.agents)} /><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtInt(data.runningAgentTasks)} tâche(s) active(s) · {fmtInt(data.agentTasks)} au total</div></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Workflow size={20} style={{ color: 'var(--accent-primary)' }} />
              <div><Stat label="Missions" value={fmtInt(data.missions)} /><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtInt(data.activeMissions)} active(s)</div></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <Mail size={20} style={{ color: 'var(--accent-primary)' }} />
              <div><Stat label="Comptes e-mail" value={fmtInt(data.emailAccounts)} /><div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtInt(data.configuredEmailAccounts)} configuré(s)</div></div>
            </div>
            <div className="rounded-xl px-3 py-1.5" style={{ backgroundColor: 'var(--accent-subtle)' }}>
              <Stat label="Total recensé" value={fmtInt(total ?? 0)} hint="Agents disponibles + missions enregistrées + comptes e-mail connectés" />
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Agents + missions + comptes connectés</div>
            </div>
          </div>
          {error && <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>{error} — valeurs affichées à la dernière synchronisation complète.</p>}
        </>
      ) : <Empty>{loading ? 'Récupération des agents, missions et comptes e-mail…' : error ?? 'Aucune donnée disponible.'}</Empty>}
    </Card>
  );
}

function ProjectCard({ index, onShowSettings }: { index: number; onShowSettings: (section?: string) => void }) {
  const ws = useWorkspaceState();
  const git = useGitInfo();
  const gemini = useGeminiStatus();
  const changed = Array.isArray(git?.files) ? git!.files.length : null;
  return (
    <Card title="Projet" icon={GitBranch} index={index}>
      <div className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {ws.workspace?.projectName ?? 'Aucun projet'}
      </div>
      <div className="truncate font-mono text-[11px]" style={{ color: 'var(--text-dimmed)' }}>{ws.workspace?.path ?? ''}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Branche" value={git?.branch ?? '—'} />
        <Stat label="Fichiers modifiés" value={changed ?? '—'} />
      </div>
      {(gemini === 'invalid' || gemini === 'unconfigured') && (
        <button type="button" onClick={() => onShowSettings('tokens')}
          className="mt-3 flex items-center gap-1.5 text-xs underline" style={{ color: 'var(--color-warning)' }}>
          <KeyRound size={12} /> Clé Gemini {gemini === 'invalid' ? 'invalide' : 'manquante'}
        </button>
      )}
    </Card>
  );
}

function RecentCard({ index, onResumeConversation }: { index: number; onResumeConversation?: (id: string) => void }) {
  const ws = useWorkspaceState();
  const items = useRecentConversations(ws.workspace?.path);
  return (
    <Card title="Conversations récentes" icon={History} index={index}>
      {items === null ? <Empty>Chargement…</Empty> : items.length === 0 ? <Empty>Aucune conversation enregistrée.</Empty> : (
        <ul className="flex flex-col gap-1">
          {items.map(c => (
            <li key={c.id}>
              <button type="button" disabled={!onResumeConversation} onClick={() => onResumeConversation?.(c.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
                style={{ color: 'var(--text-primary)' }}>
                <span className="truncate">{c.title?.trim() || 'Conversation sans titre'}</span>
                <span className="ml-auto flex-shrink-0 font-mono text-[11px]" style={{ color: 'var(--text-dimmed)' }}>{c.message_count} msg</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────

/** Tableau de bord temps réel, alternative à EmptyEditorState (réglage « Écran d'accueil de l'éditeur »). */
export const EditorDashboard = React.memo(function EditorDashboard({
  onCreateFile, onShowSettings, onOpenSearch, onOpenChat, onOpenNotebooks, onResumeConversation,
}: EmptyEditorStateProps) {
  const { connected, connecting, connect, disconnect, clearTranscript, clearActivity, activity, isBusy, reasoning } = useLiveAPIContext();
  const { profile } = useProfile();
  const reduce = !!useReducedMotion();
  const aiName = profile.aiName || 'Leanna';
  const userName = profile.userName?.trim();
  const [sectionOrder, setSectionOrder] = useState<string[]>(DEFAULT_SECTION_ORDER);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('leanna.dashboard.section-order');
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.every(id => typeof id === 'string')) {
        const valid = parsed.filter(id => DEFAULT_SECTION_ORDER.includes(id));
        setSectionOrder([...valid, ...DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id))]);
      }
    } catch { /* ordre par défaut si stockage indisponible ou invalide */ }
  }, []);

  const moveSection = useCallback((targetId: string) => {
    if (!draggedSection || draggedSection === targetId) return;
    setSectionOrder(current => {
      const next = [...current];
      const from = next.indexOf(draggedSection);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, draggedSection);
      try { window.localStorage.setItem('leanna.dashboard.section-order', JSON.stringify(next)); } catch { /* stockage facultatif */ }
      return next;
    });
    setDraggedSection(null);
  }, [draggedSection]);

  const resetLayout = useCallback(() => {
    setSectionOrder(DEFAULT_SECTION_ORDER);
    setDraggedSection(null);
    try { window.localStorage.removeItem('leanna.dashboard.section-order'); } catch { /* stockage facultatif */ }
  }, []);

  // Connexion seule : le chat reste fermé (bouton « Ouvrir le chat » séparé).
  const handleConnect = useCallback(() => {
    if (connecting) return;
    if (connected) { disconnect(); return; }
    clearTranscript(); clearActivity(); connect([], 'full');
  }, [connected, connecting, connect, disconnect, clearTranscript, clearActivity]);

  type DashboardAction = { label: string; icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>; onClick?: () => void };
  // Les callbacks facultatifs absents sont retirés : pas d'entrée de menu qui planterait au clic.
  const actions = ([
    { label: 'Ouvrir le chat', icon: MessageSquare, onClick: onOpenChat },
    { label: 'Nouveau fichier', icon: FilePlus, onClick: onCreateFile },
    { label: 'Rechercher', icon: Search, onClick: onOpenSearch },
    { label: 'Notebooks', icon: BookOpen, onClick: onOpenNotebooks },
    { label: 'Paramètres', icon: Settings, onClick: () => onShowSettings() },
    { label: isEditMode ? 'Terminer la personnalisation' : 'Personnaliser', icon: Settings, onClick: () => setIsEditMode(value => !value) },
    { label: immersiveMode ? 'Vue standard' : 'Vue immersive', icon: Sparkles, onClick: () => setImmersiveMode(value => !value) },
  ] as DashboardAction[]).filter((action): action is Required<DashboardAction> => typeof action.onClick === 'function');

  const paletteMatches = actions.filter(action => action.label.toLowerCase().includes(paletteQuery.trim().toLowerCase()));
  const runPaletteAction = (action: (typeof actions)[number]) => { setPaletteOpen(false); setPaletteQuery(''); action.onClick(); };

  return (
    // À partir de xl, le tableau de bord tient dans la fenêtre : seules les cartes défilent en interne.
    <div className="relative flex flex-1 flex-col overflow-y-auto xl:overflow-hidden" style={{ backgroundColor: 'var(--bg)', perspective: 1400 }}>
      {/* Halos d'accent qui dérivent lentement en fond */}
      {!reduce && (<>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'var(--accent-primary)', opacity: 0.08 }}
          animate={{ x: [0, 160, -80, 0], y: [0, 60, 120, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 right-1/5 h-[28rem] w-[28rem] rounded-full blur-3xl"
          style={{ background: 'var(--color-success, #22c55e)', opacity: 0.05 }}
          animate={{ x: [0, -140, 60, 0], y: [0, -80, -30, 0] }}
          transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Particules flottantes */}
        {Array.from({ length: 14 }, (_, k) => (
          <span key={k} aria-hidden className="dash-particle pointer-events-none absolute h-1 w-1 rounded-full"
            style={{ left: `${(k * 37) % 100}%`, top: `${20 + ((k * 53) % 75)}%`, background: 'var(--accent-primary)', boxShadow: '0 0 6px var(--accent-primary)',
              ['--dur' as string]: `${7 + (k % 5) * 2}s`, ['--delay' as string]: `${(k % 7) * -1.3}s` }} />
        ))}
      </>)}
      {/* Sol holographique en perspective au bas de l'écran */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 overflow-hidden" style={{ perspective: 600 }}>
        <div className="absolute inset-x-[-50%] bottom-[-30%] h-full"
          style={{ transform: 'rotateX(72deg)', transformOrigin: 'bottom',
            backgroundImage: 'linear-gradient(color-mix(in srgb, var(--accent-primary) 18%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 18%, transparent) 1px, transparent 1px)',
            backgroundSize: '56px 56px', maskImage: 'linear-gradient(to top, black, transparent 80%)', WebkitMaskImage: 'linear-gradient(to top, black, transparent 80%)', opacity: 0.35 }} />
      </div>
      <main className={`relative z-10 mx-auto w-full px-3 py-2 transition-[max-width,padding] duration-500 sm:px-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col ${immersiveMode ? 'max-w-none sm:px-8' : 'max-w-none'}`}>
        <motion.header
          className="mb-1.5 flex shrink-0 flex-wrap items-end justify-between gap-2"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          <div className="flex items-end gap-5">
            <LiveClock />
            <div className="hidden pb-1 sm:block">
              <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {greeting()}{userName ? `, ${userName}` : ''}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {connected ? `${aiName} est connectée` : `${aiName} est hors ligne`}
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-2" aria-label="Actions rapides">
            <button type="button" onClick={() => setDebugOpen(value => !value)} aria-expanded={debugOpen}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors"
              style={{ backgroundColor: debugOpen ? 'var(--accent-subtle)' : 'var(--bg-panel)', borderColor: debugOpen ? 'color-mix(in srgb, var(--accent-primary) 45%, transparent)' : 'color-mix(in srgb, var(--border-base) 65%, transparent)', color: debugOpen ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <Cpu size={13} /> Diagnostic <span className="font-mono text-[11px]">{debugOpen ? '−' : '+'}</span>
            </button>
            <motion.button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg transition-all disabled:cursor-wait disabled:opacity-70"
              style={connected
                ? { backgroundColor: 'color-mix(in srgb, var(--color-success, #22c55e) 14%, var(--bg-panel))', borderColor: 'var(--color-success, #22c55e)', color: 'var(--color-success, #22c55e)', boxShadow: '0 0 18px color-mix(in srgb, var(--color-success, #22c55e) 16%, transparent)' }
                : { background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-primary) 88%, white 12%), var(--accent-primary))', borderColor: 'color-mix(in srgb, var(--accent-primary) 72%, white 28%)', color: 'white', boxShadow: '0 0 20px color-mix(in srgb, var(--accent-primary) 24%, transparent)' }}
              aria-label={connecting ? 'Connexion à Leanna en cours' : connected ? 'Déconnecter Leanna' : 'Connecter Leanna'}
            >
              {connecting ? <Loader2 size={14} className={reduce ? undefined : 'animate-spin'} /> : connected ? <PowerOff size={14} /> : <Power size={14} />}
              {connecting ? 'Connexion…' : connected ? 'Leanna connectée' : 'Connecter Leanna'}
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: connected ? 'var(--color-success, #22c55e)' : 'rgba(255,255,255,.8)' }} />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => setPaletteOpen(true)}
              whileHover={reduce ? undefined : { y: -2, rotateX: 10 }}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)', color: 'var(--text-primary)' }}
              aria-haspopup="dialog"
            >
              <Command size={14} style={{ color: 'var(--accent-primary)' }} /> Commandes
            </motion.button>
            {/* <div className="relative">
              <motion.button
                type="button"
                onClick={() => setQuickMenuOpen(value => !value)}
                aria-haspopup="menu"
                aria-expanded={quickMenuOpen}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium"
                style={{ backgroundColor: quickMenuOpen ? 'var(--accent-subtle)' : 'var(--bg-panel)', borderColor: quickMenuOpen ? 'var(--accent-primary)' : 'var(--border-base)', color: 'var(--text-primary)' }}
              >
                <Settings size={14} /> Menu <ChevronDown size={13} className={quickMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </motion.button>
              <AnimatePresence>
                {quickMenuOpen && (
                  <motion.div
                    role="menu"
                    aria-label="Actions du tableau de bord"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border p-1.5 shadow-2xl"
                    style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-base)', boxShadow: '0 18px 48px rgba(0,0,0,.38)' }}
                  >
                    {actions.map(action => (
                      <button
                        key={action.label}
                        type="button"
                        role="menuitem"
                        onClick={() => { setQuickMenuOpen(false); action.onClick(); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-colors hover:bg-[var(--accent-subtle)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <action.icon size={14} style={{ color: 'var(--accent-primary)' }} />
                        <span>{action.label}</span>
                        {action.label.includes('personnalisation') && <span className="ml-auto text-[10px]" style={{ color: 'var(--accent-primary)' }}>ACTIF</span>}
                      </button>
                    ))}
                    {isEditMode && (
                      <button type="button" role="menuitem" onClick={() => { setQuickMenuOpen(false); resetLayout(); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t px-3 py-2.5 text-left text-xs" style={{ borderColor: 'var(--border-base)', color: 'var(--text-muted)' }}>
                        <RefreshCw size={14} /> Réinitialiser la disposition
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div> */}
          </nav>
        </motion.header>

        <div className="xl:min-h-0 xl:flex-[0_0_44%]">
          <DashboardCore aiName={aiName} connected={connected} connecting={connecting} activity={activity} isBusy={isBusy} reasoningActive={!!reasoning?.active} />
        </div>

        <Modal open={paletteOpen} onClose={() => { setPaletteOpen(false); setPaletteQuery(''); }} title="Palette de commandes" size="md">
          <Modal.Body>
            <input
              autoFocus
              value={paletteQuery}
              onChange={event => setPaletteQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && paletteMatches[0]) runPaletteAction(paletteMatches[0]); }}
              placeholder="Rechercher une action…"
              aria-label="Rechercher une action"
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent-primary)]"
              style={{ borderColor: 'var(--border-base)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <ul className="flex flex-col gap-1">
              {paletteMatches.map((action, k) => (
                <motion.li key={action.label} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.03 }}>
                  <button type="button" onClick={() => runPaletteAction(action)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--accent-subtle)]"
                    style={{ color: 'var(--text-primary)' }}>
                    <action.icon size={15} className="shrink-0" />
                    {action.label}
                    {k === 0 && <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Entrée</span>}
                  </button>
                </motion.li>
              ))}
              {paletteMatches.length === 0 && <Empty>Aucune action ne correspond.</Empty>}
            </ul>
          </Modal.Body>
        </Modal>

        {isEditMode && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--accent-primary)', backgroundColor: 'var(--accent-subtle)', color: 'var(--text-primary)' }}>
          <Settings size={14} style={{ color: 'var(--accent-primary)' }} />
          <span>Mode personnalisation actif — faites glisser les sections pour modifier leur ordre.</span>
          <span className="ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>{sectionOrder.length} widgets</span>
        </motion.div>}
        <div className={`grid grid-cols-1 items-stretch gap-4 transition-[gap] duration-500 md:grid-cols-4 xl:min-h-0 xl:flex-1 xl:grid-flow-row-dense xl:grid-cols-12 xl:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] ${immersiveMode ? 'gap-6' : ''}`} aria-label="Sections du tableau de bord réorganisables">
          {sectionOrder.filter(sectionId => !['tokens', 'system', 'automations'].includes(sectionId)).map((sectionId, index) => {
            const section = (() => {
              switch (sectionId) {
                case 'operations': return <OperationalOverviewCard index={index} />;
                case 'audio': return <AudioCard index={index} />;
                case 'session': return <SessionCard index={index} />;
                case 'tokens': return <TokensCard index={index} />;
                case 'activity': return <ActivityCard index={index} />;
                case 'transcript': return <TranscriptCard index={index} aiName={aiName} onOpenChat={onOpenChat} />;
                case 'plan': return <PlanCard index={index} />;
                case 'system': return <SystemCard index={index} />;
                case 'automations': return <AutomationsCard index={index} />;
                case 'project': return <ProjectCard index={index} onShowSettings={onShowSettings} />;
                case 'recent': return <RecentCard index={index} onResumeConversation={onResumeConversation} />;
                default: return null;
              }
            })();
            return (
              <div
                key={sectionId}
                draggable={isEditMode}
                onDragStart={event => {
                  if (!isEditMode) return;
                  setDraggedSection(sectionId);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', sectionId);
                }}
                onDragOver={event => { if (!isEditMode) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                onDrop={event => { if (!isEditMode) return; event.preventDefault(); moveSection(sectionId); }}
                onDragEnd={() => setDraggedSection(null)}
                className={`min-w-0 transition-all duration-300 xl:min-h-0 ${isEditMode ? 'cursor-grab active:cursor-grabbing ring-1 ring-[var(--accent-primary)]/20 rounded-xl' : ''} ${SECTION_SPAN[sectionId] ?? 'md:col-span-2 xl:col-span-2'} ${draggedSection === sectionId ? 'scale-[0.985] opacity-40' : ''}`}
                title={isEditMode ? 'Faire glisser pour déplacer cette section' : undefined}
              >
                {section}
              </div>
            );
          })}
        </div>
        <AnimatePresence>
          {debugOpen && (
            <motion.section
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mt-3 max-h-[34vh] shrink-0 overflow-auto rounded-xl border p-3"
              style={{ borderColor: 'color-mix(in srgb, var(--border-base) 65%, transparent)', background: 'color-mix(in srgb, var(--bg-secondary) 88%, transparent)', backdropFilter: 'blur(18px)' }}
              aria-label="Panneau de diagnostic"
            >
              <div className="mb-2 flex items-center gap-2">
                <Cpu size={14} style={{ color: 'var(--text-muted)' }} />
                <h2 className="text-xs font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>Monitoring & diagnostics</h2>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Système · Tokens · Automatisations</span>
                <button type="button" onClick={() => setDebugOpen(false)} className="ml-auto rounded-md px-2 py-1 text-[11px] hover:bg-[var(--bg-panel)]" style={{ color: 'var(--text-muted)' }}>Réduire</button>
              </div>
              <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
                {sectionOrder.filter(sectionId => ['tokens', 'system', 'automations'].includes(sectionId)).map((sectionId, index) => {
                  const section = sectionId === 'tokens' ? <TokensCard index={index} />
                    : sectionId === 'system' ? <SystemCard index={index} />
                    : <AutomationsCard index={index} />;
                  return (
                    <div key={sectionId} draggable={isEditMode}
                      onDragStart={event => {
                        if (!isEditMode) return;
                        setDraggedSection(sectionId);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', sectionId);
                      }}
                      onDragOver={event => { if (!isEditMode) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                      onDrop={event => { if (!isEditMode) return; event.preventDefault(); moveSection(sectionId); }}
                      onDragEnd={() => setDraggedSection(null)}
                      className={`min-w-0 md:col-span-1 ${isEditMode ? 'cursor-grab active:cursor-grabbing ring-1 ring-[var(--accent-primary)]/20 rounded-xl' : ''} ${draggedSection === sectionId ? 'scale-[0.985] opacity-40' : ''}`}
                      title={isEditMode ? 'Faire glisser pour déplacer cette section' : undefined}
                    >{section}</div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
});
