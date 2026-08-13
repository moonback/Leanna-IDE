import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import {
  Plus, X, FolderOpen, FileText,
  Terminal, Command, MessageSquare,
  Code2, MonitorSmartphone, GitBranch, BrainCircuit,
  Circle, Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspaceState } from '../../hooks/useWorkspaceState';
import { useLiveAPIContext } from '../../context/LiveAPIContext';
import { useProfile } from '../../context/UserProfileContext';
import { ShortcutsModal } from './ShortcutsModal';
import { SystemModal } from './SystemModal';
import { useTheme } from '../../context/ThemeContext';
import disconnectedBgDark from '/assets/images/disconnected-bg-dark.png';
import disconnectedBgLight from '/assets/images/disconnected-bg-light.png';

// ─── Types ───────────────────────────────────────────────────────────────

type AgentMode = 'disconnected' | 'idle' | 'listening' | 'speaking' | 'working';

interface RecentFile {
  path: string;
  language: string;
  openedAt: number;
}

interface GitInfo {
  branch: string;
  summary: string;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────

const MOD = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  ? '⌘'
  : 'Ctrl';

function toolColor(tool: string): string {
  if (/write|modify|create/.test(tool)) return '52, 211, 153';    // emerald
  if (/read|list|search|analyze/.test(tool)) return '56, 189, 248'; // sky
  if (/git|commit|push|branch/.test(tool)) return '251, 191, 36';  // amber
  if (/terminal|shell|exec/.test(tool)) return '244, 114, 182';    // pink
  if (/agent|mission|workflow/.test(tool)) return '168, 85, 247';  // purple
  return '99, 102, 241';
}

function resolveMode(
  connected: boolean,
  isBusy: boolean,
  inputAmp: number,
  outputAmp: number,
): AgentMode {
  if (!connected) return 'disconnected';
  if (isBusy) return 'working';
  if (outputAmp > 0.04) return 'speaking';
  if (inputAmp > 0.04) return 'listening';
  return 'idle';
}

// ─── Composant Kbd ──────────────────────────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[9px] font-mono font-medium"
      style={{
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-input)',
        border: '1px solid var(--border-base)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {children}
    </kbd>
  );
}

// ─── Fond de particules ──────────────────────────────────────────────────

const BASE_PARTICLE_DENSITY = 0.000055; // particules par pixel²
const MIN_PARTICLES = 14;
const MAX_PARTICLES = 42;
const BASE_SPEED = 0.16;
const BURST_DURATION = 1.1; // secondes, durée de l'explosion à la connexion

interface ParticleFieldProps {
  connected: boolean;
  connecting?: boolean;
  isBusy: boolean;
  activeTool: string;
  getInputAmplitude: () => number;
  getOutputAmplitude: () => number;
}

const ParticleField = React.memo(function ParticleField({
  connected,
  connecting = false,
  isBusy,
  activeTool,
  getInputAmplitude,
  getOutputAmplitude,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  // Garde en mémoire l'état "connected" précédent pour détecter le
  // passage disconnected → connected (déclencheur de l'explosion).
  const prevConnectedRef = useRef(connected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // L'agent vient tout juste de se connecter : on déclenche le "crash".
    const burstActive = connected && !prevConnectedRef.current;
    prevConnectedRef.current = connected;

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      phase: number; z: number; // z: 0 (loin) → 1 (proche)
    };
    let particles: Particle[] = [];

    const spawnParticles = (w: number, h: number, burst: boolean) => {
      const count = Math.round(
        Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, w * h * BASE_PARTICLE_DENSITY))
      );
      const cx = w / 2;
      const cy = h / 2;
      particles = Array.from({ length: count }, () => {
        const z = 0.35 + Math.random() * 0.65;
        if (burst) {
          // Naissance groupée près du centre, projection radiale
          // à haute vitesse → effet d'éclatement / collision.
          const angle = Math.random() * Math.PI * 2;
          const startDist = Math.random() * Math.min(w, h) * 0.12;
          const speed = (2.6 + Math.random() * 2.6) * z;
          return {
            x: cx + Math.cos(angle) * startDist,
            y: cy + Math.sin(angle) * startDist,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            phase: Math.random() * Math.PI * 2,
            z,
          };
        }
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * BASE_SPEED * z,
          vy: (Math.random() - 0.5) * BASE_SPEED * z,
          phase: Math.random() * Math.PI * 2,
          z,
        };
      });
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.offsetWidth;
      const h = parent.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawnParticles(w, h, burstActive);
    };
    resize();

    // Les redimensionnements ultérieurs ne doivent jamais redéclencher
    // l'explosion : seule la toute première résolution (au montage /
    // à la reconnexion) peut être un burst.
    const roResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.offsetWidth;
      const h = parent.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      spawnParticles(w, h, false);
    };
    const ro = new ResizeObserver(roResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const handleMouseLeave = () => { mouseRef.current.active = false; };
    canvas.parentElement?.addEventListener('mousemove', handleMouseMove);
    canvas.parentElement?.addEventListener('mouseleave', handleMouseLeave);

    let smoothAudio = 0;
    let smoothSpeed = BASE_SPEED;
    let currentToolColor = '56, 189, 248';
    let time = 0;
    let rafId: number;

    // Smooth color interpolation: [r, g, b]
    let smoothR = 56, smoothG = 189, smoothB = 248;

    function parseColor(rgb: string): [number, number, number] {
      const [r, g, b] = rgb.split(',').map(Number);
      return [r, g, b];
    }

    const tick = () => {
      time += 0.016;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;

      const inputAmp = getInputAmplitude();
      const outputAmp = getOutputAmplitude();
      const rawAudio = Math.max(inputAmp, outputAmp);
      // Attaque rapide, relâchement lent
      smoothAudio += (rawAudio - smoothAudio) * (rawAudio > smoothAudio ? 0.75 : 0.12);

      const mode = resolveMode(connected, isBusy, inputAmp, outputAmp);
      if (isBusy && activeTool) currentToolColor = toolColor(activeTool);

      // Paramètres par mode
      let targetSpeed = BASE_SPEED;      let connDist = 120;
      let lineAlpha = 0.20;
      let dotR = 1.8;
      let haloR = 5;
      let targetColor = '99, 102, 241';
      let convergence = 0;
      let orbitStrength = 0;

      switch (mode) {
        case 'disconnected':
          targetSpeed = 0.10;
          connDist = 100;
          lineAlpha = 0.12;
          dotR = 1.4;
          haloR = 3.5;
          targetColor = '100, 120, 160';
          break;
        case 'idle':
          targetSpeed = 0.16;
          connDist = 130;
          lineAlpha = 0.14;
          dotR = 1.5;
          haloR = 4;
          targetColor = '56, 189, 248';
          break;
        case 'listening':
          targetSpeed = 0.22 + smoothAudio * 3.5;
          connDist = 140 + smoothAudio * 70;
          lineAlpha = 0.20 + smoothAudio * 0.45;
          dotR = 1.8 + smoothAudio * 4;
          haloR = 5 + smoothAudio * 14;
          targetColor = '52, 211, 153';
          break;
        case 'speaking':
          targetSpeed = 0.26 + smoothAudio * 4;
          connDist = 150 + smoothAudio * 80;
          lineAlpha = 0.22 + smoothAudio * 0.40;
          dotR = 2.0 + smoothAudio * 5;
          haloR = 5 + smoothAudio * 18;
          targetColor = '99, 179, 255';
          break;
        case 'working':
          targetSpeed = 0.26;
          connDist = 145;
          lineAlpha = 0.24;
          dotR = 1.8;
          haloR = 5 + Math.abs(Math.sin(time * 3)) * 3;
          targetColor = currentToolColor;
          convergence = 0.08;
          break;
      }

      // Interpolation douce vers la couleur cible
      const lerpRate = 0.04;
      const [tr, tg, tb] = parseColor(targetColor);
      smoothR += (tr - smoothR) * lerpRate;
      smoothG += (tg - smoothG) * lerpRate;
      smoothB += (tb - smoothB) * lerpRate;
      const primaryColor = `${smoothR | 0}, ${smoothG | 0}, ${smoothB | 0}`;

      smoothSpeed += (targetSpeed - smoothSpeed) * 0.18;
      ctx.clearRect(0, 0, w, h);

      // Fond radial ambiant coloré (suit la couleur interpolée)
      const ambientAlpha = mode === 'disconnected' ? 0.03 : 0.07 + smoothAudio * 0.08;
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.65);
      ambient.addColorStop(0, `rgba(${primaryColor}, ${ambientAlpha})`);
      ambient.addColorStop(1, `rgba(${primaryColor}, 0)`);
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, w, h);

      // ── Effet de "crash" à l'activation de l'agent ──
      const burstProgress = burstActive ? Math.min(time / BURST_DURATION, 1) : 1;
      if (burstActive && time < BURST_DURATION) {
        // Flash bref au centre
        if (time < 0.35) {
          const flashAlpha = (1 - time / 0.35) * 0.38;
          const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.42);
          flash.addColorStop(0, `rgba(${primaryColor}, ${flashAlpha})`);
          flash.addColorStop(1, `rgba(${primaryColor}, 0)`);
          ctx.fillStyle = flash;
          ctx.fillRect(0, 0, w, h);
        }
        // Onde de choc qui se propage puis s'estompe
        const ringRadius = burstProgress * Math.max(w, h) * 0.6;
        const ringAlpha = (1 - burstProgress) * 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${primaryColor}, ${ringAlpha})`;
        ctx.lineWidth = 2.2 * (1 - burstProgress) + 0.4;
        ctx.stroke();
      }

      const mouse = mouseRef.current;
      const mouseRadius = 90;

      // Déplacement des particules
      for (const p of particles) {
        if (orbitStrength > 0) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const norm = Math.sqrt(dx * dx + dy * dy) || 1;
          p.vx += (-dy / norm) * orbitStrength * 0.004 * p.z;
          p.vy += (dx / norm) * orbitStrength * 0.004 * p.z;
        }
        if (convergence > 0) {
          p.vx += (cx - p.x) * convergence * 0.0003;
          p.vy += (cy - p.y) * convergence * 0.0003;
        }
        // Répulsion douce autour du curseur
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseRadius && dist > 0.01) {
            const force = (1 - dist / mouseRadius) * 0.03 * p.z;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const cap = smoothSpeed * 2.2 * p.z;
        if (spd > cap) {
          p.vx = (p.vx / spd) * cap;
          p.vy = (p.vy / spd) * cap;
        }
        p.x += p.vx;
        p.y += p.vy;
        if (p.x <= 0 || p.x >= w) { p.vx *= -1; p.x = Math.max(0, Math.min(w, p.x)); }
        if (p.y <= 0 || p.y >= h) { p.vy *= -1; p.y = Math.max(0, Math.min(h, p.y)); }
      }

      // Connexions
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const avgZ = (particles[i].z + particles[j].z) / 2;
          const localConnDist = connDist * avgZ;
          if (d < localConnDist) {
            const alpha = (1 - d / localConnDist) * lineAlpha * avgZ;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            if (mode === 'working') {
              // Dégradé bicolore sur les connexions : outil → idle
              const grad = ctx.createLinearGradient(
                particles[i].x, particles[i].y,
                particles[j].x, particles[j].y,
              );
              grad.addColorStop(0, `rgba(${primaryColor}, ${alpha * 1.4})`);
              grad.addColorStop(1, `rgba(56, 189, 248, ${alpha * 0.4})`);
              ctx.strokeStyle = grad;
            } else {
              ctx.strokeStyle = `rgba(${primaryColor}, ${alpha})`;
            }
            ctx.lineWidth = (mode === 'working' || mode === 'speaking' ? 0.9 : 0.65) * avgZ;
            ctx.stroke();
          }
        }
      }

      // Points et halos
      for (const p of particles) {
        const pulse = 1 + 0.12 * Math.sin(time * 1.6 + p.phase);
        const r = dotR * pulse * p.z;
        const hr = haloR * pulse * p.z;
        const zAlpha = 0.5 + p.z * 0.5;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, hr);
        grad.addColorStop(0, `rgba(${primaryColor}, ${(0.22 + smoothAudio * 0.35) * zAlpha})`);
        grad.addColorStop(1, `rgba(${primaryColor}, 0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, hr, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${primaryColor}, ${(0.80 + smoothAudio * 0.18) * zAlpha})`;
        ctx.fill();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.parentElement?.removeEventListener('mousemove', handleMouseMove);
      canvas.parentElement?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [connected, isBusy, activeTool, getInputAmplitude, getOutputAmplitude]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
});

// ─── Hooks personnalisés ────────────────────────────────────────────────

function useRecentFiles(): [RecentFile[], (files: RecentFile[]) => void, () => void] {
  const [files, setFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('jarvis_recent_files');
      if (stored) {
        const parsed = JSON.parse(stored) as RecentFile[];
        setFiles(parsed.slice(0, 3));
      }
    } catch {
      // ignore
    }
  }, []);

  const updateFiles = useCallback((newFiles: RecentFile[]) => {
    setFiles(newFiles.slice(0, 3));
    localStorage.setItem('jarvis_recent_files', JSON.stringify(newFiles));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    localStorage.removeItem('jarvis_recent_files');
  }, []);

  return [files, updateFiles, clearFiles];
}

function useGitInfo() {
  const [info, setInfo] = useState<GitInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('jarvis_api_token');
    const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
    fetch('/api/git/status', { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'success') {
          setInfo({ branch: data.branch, summary: data.summary });
        }
      })
      .catch(() => {});
  }, []);

  return info;
}

// ─── Modale des capacités ──────────────────────────────────────────────

interface CapabilitiesModalProps {
  onClose: () => void;
  aiName: string;
}

function CapabilitiesModal({ onClose, aiName }: CapabilitiesModalProps) {
  const capabilities = [
    { icon: MessageSquare, label: 'Chat vocal', desc: 'Communication vocale en temps réel avec dictée et réponses audio.' },
    { icon: Code2, label: 'Édition de code', desc: 'Génération, refactoring et correction automatique multi-langages.' },
    { icon: Terminal, label: 'Terminal intégré', desc: "Exécution de commandes shell, builds et tests automatisés." },
    { icon: GitBranch, label: 'Git intégré', desc: 'Commits, branches, push/pull, diffs — gestion complète.' },
    { icon: Search, label: 'Recherche intelligente', desc: 'Fichiers, symboles et documentation avec contexte IA.' },
    { icon: MonitorSmartphone, label: 'Preview live', desc: 'Aperçu en temps réel des applications web intégré.' },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        className="relative w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
        }}
        initial={{ scale: 0.96, y: 8, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <BrainCircuit className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Capacités IA
              </h2>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Modules de {aiName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center transition-colors"
            style={{
              color: 'var(--ctrl-icon)',
              borderRadius: 'var(--radius-md)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5">
          {capabilities.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-start gap-2.5 px-2.5 py-2.5 transition-colors"
              style={{ borderRadius: 'var(--radius-md)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div
                className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  backgroundColor: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <Icon size={12} style={{ color: 'var(--ctrl-icon)' }} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium block" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>
                <span className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {desc}
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────

interface EmptyEditorStateProps {
  onOpenFile: (path: string) => void;
  onCreateFile: () => void;
  onShowSettings: () => void;
  onOpenTerminal?: () => void;
  onOpenSearch?: () => void;
  onOpenChat?: () => void;
  onRunProject?: () => void;
}

export const EmptyEditorState = React.memo(function EmptyEditorState({
  onOpenFile,
  onCreateFile,
  onShowSettings,
  onOpenTerminal,
  onOpenSearch,
  onOpenChat,
  onRunProject,
}: EmptyEditorStateProps) {
  const ws = useWorkspaceState();
  const { connected, connecting, isBusy, getInputAmplitude, getOutputAmplitude, connect } =
    useLiveAPIContext();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const disconnectedBg = theme === 'dark' ? disconnectedBgDark : disconnectedBgLight;

  // États locaux
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  // Données externes
  const [recentFiles, setRecentFiles, clearRecentFiles] = useRecentFiles();
  const gitInfo = useGitInfo();

  // Greeting mémorisé
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

  // Gestion des raccourcis clavier
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onCreateFile();
      }
      if (e.key === ',') {
        e.preventDefault();
        onShowSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCreateFile, onShowSettings]);

  // Ouverture d'un fichier récent
  const handleOpenRecent = useCallback(
    async (filePath: string) => {
      try {
        const token = localStorage.getItem('jarvis_api_token');
        const headers: Record<string, string> = token ? { 'x-jarvis-token': token } : {};
        const response = await fetch(
          `/api/ide/file?${new URLSearchParams({ path: filePath })}`,
          { headers }
        );
        if (!response.ok) {
          // Le fichier n'existe plus : on le retire de la liste
          const updated = recentFiles.filter((f) => f.path !== filePath);
          setRecentFiles(updated);
          return;
        }
        onOpenFile(filePath);
      } catch {
        // En cas d'erreur réseau, on tente d'ouvrir quand même (l'éditeur gèrera)
        onOpenFile(filePath);
      }
    },
    [recentFiles, setRecentFiles, onOpenFile]
  );

  // Gestionnaires des modales (mémorisés)
  const openCapabilities = useCallback(() => setShowCapabilities(true), []);
  const closeCapabilities = useCallback(() => setShowCapabilities(false), []);
  const openShortcuts = useCallback(() => setShowShortcuts(true), []);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
  const openSystem = useCallback(() => setShowSystem(true), []);
  const closeSystem = useCallback(() => setShowSystem(false), []);

  // Toggle : ouvrir automatiquement le panneau chat à la connexion
  const [autoOpenChat, setAutoOpenChat] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('jarvis:autoOpenChat');
      return stored !== null ? JSON.parse(stored) : true;
    } catch { return true; }
  });

  const toggleAutoOpenChat = useCallback(() => {
    setAutoOpenChat(prev => {
      const next = !prev;
      localStorage.setItem('jarvis:autoOpenChat', JSON.stringify(next));
      return next;
    });
  }, []);

  // Handler Chat IA : connecte l'assistant si nécessaire, puis ouvre le panneau chat
  const handleOpenChat = useCallback(() => {
    if (!connected && !connecting) {
      connect([], 'full');
    }
    if (autoOpenChat) {
      onOpenChat?.();
    }
  }, [connected, connecting, connect, onOpenChat, autoOpenChat]);

  // Raccourcis pour les actions
  const actions = useMemo(
    () => [
      { label: 'Nouveau fichier', desc: 'Créer un fichier dans le projet actif', icon: Plus, onClick: onCreateFile, shortcut: `${MOD}+N`, id: 'new-file' },
      { label: 'Terminal', desc: 'Ouvrir un terminal intégré', icon: Terminal, onClick: onOpenTerminal, shortcut: `${MOD}+\``, id: 'terminal' },
      // { label: 'Recherche', desc: 'Chercher dans tout le projet', icon: Search, onClick: onOpenSearch, shortcut: `${MOD}+Shift+F`, id: 'search' },
      { label: 'Chat IA', desc: `Discuter avec ${profile.aiName || 'l\'agent'}`, icon: MessageSquare, onClick: handleOpenChat, shortcut: `${MOD}+L`, id: 'chat-ia' },
      // { label: 'Lancer le projet', desc: 'Exécuter npm run dev', icon: Code2, onClick: onRunProject, shortcut: '', id: 'run' },
      // { label: 'Paramètres', desc: 'Configurer l\'IA, le thème et les préférences', icon: Command, onClick: onShowSettings, shortcut: `${MOD}+,`, id: 'settings' },
    ],
    [onCreateFile, onShowSettings, onOpenTerminal, onOpenSearch, handleOpenChat, onRunProject, profile.aiName]
  );

  // Liens rapides
  const quickLinks = useMemo(
    () => [
      { label: 'Capacités IA', onClick: openCapabilities },
      { label: 'Raccourcis', onClick: openShortcuts },
      { label: 'Système', onClick: openSystem },
    ],
    [openCapabilities, openShortcuts, openSystem]
  );

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-10 relative"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Fond : image statique si déconnecté, particules si connecté */}
      {/* Fond image — toujours visible, opacité réduite pour ne pas rivaliser avec le contenu */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${disconnectedBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.35,
        }}
      />
      {/* Overlay gradient : assombrit les bords, focus sur le centre */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 0%, var(--bg-base) 100%)',
        }}
      />

      {/* Particules + glow par-dessus l'image quand l'agent est actif */}
      {connected && (
        <>
          <ParticleField
            connected={connected}
            isBusy={isBusy}
            activeTool=""
            getInputAmplitude={getInputAmplitude}
            getOutputAmplitude={getOutputAmplitude}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 50% 40% at 50% 38%, var(--accent-subtle) 0%, transparent 70%)',
            }}
          />
        </>
      )}

      <motion.div
        className="w-full max-w-[720px] px-8 py-10 relative z-10"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-2xl)',
          boxShadow: 'var(--shadow-xl)',
          backdropFilter: 'blur(22px)',
        }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* Indicateur de statut */}
        <motion.div
          className="flex items-center justify-center mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-base)',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <span
              className="w-[6px] h-[6px] rounded-full"
              style={{
                backgroundColor: connected ? 'var(--color-success)' : 'var(--color-warning)',
                boxShadow: connected
                  ? '0 0 6px var(--color-success)'
                  : '0 0 6px var(--color-warning)',
              }}
            />
            <span
              className="text-[10px] font-mono uppercase tracking-[0.14em]"
              style={{ color: 'var(--text-muted)' }}
            >
              {profile.aiName || 'Leanna'} · {connected ? 'en ligne' : 'hors ligne'}
            </span>
          </div>
        </motion.div>

        {/* Salutation */}
        <motion.h1
          className="text-[22px] font-semibold tracking-tight text-center mb-8"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {profile.userName ? `${greeting}, ${profile.userName}` : greeting}
        </motion.h1>


        {/* Activation Agent */}
        {/* {!connected && (
          <motion.div
            className="mb-7 flex justify-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <button
              type="button"
              onClick={() => connect([], 'full')}
              disabled={connecting}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl font-semibold transition-all duration-200"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                boxShadow: '0 14px 40px rgba(56,189,248,0.28), 0 0 60px rgba(56,189,248,0.12)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 18px 50px rgba(56,189,248,0.35), 0 0 80px rgba(56,189,248,0.18)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 14px 40px rgba(56,189,248,0.28), 0 0 60px rgba(56,189,248,0.12)';
              }}
            >
              <BrainCircuit size={16} />
              <span>
                {connecting ? 'Connexion...' : `Activer ${profile.aiName || 'l’agent'}`}
              </span>
            </button>
          </motion.div>
        )} */}

        {/* Cartes d'action */}
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          {actions.map(({ label, desc, icon: Icon, onClick, shortcut, id }) => (
            <div key={label} className="relative flex flex-col">
              <button
                onClick={onClick}
                disabled={!onClick}
                className="group card-hover-gradient flex flex-col items-start gap-2.5 p-4 text-left transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-base)',
                  borderRadius: id === 'chat-ia' ? 'var(--radius-xl) var(--radius-xl) 0 0' : 'var(--radius-xl)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(56,189,248,0.08), var(--shadow-sm)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-base)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <div
                    className="w-8 h-8 flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--accent-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  {shortcut && <Kbd>{shortcut}</Kbd>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {label}
                  </span>
                  <span className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {desc}
                  </span>
                </div>
              </button>

              {/* Toggle "Ouvrir le panneau" — uniquement sur la carte Chat IA */}
              {id === 'chat-ia' && (
                <div
                  className="flex items-center justify-between px-4 py-2"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderLeft: '1px solid var(--border-base)',
                    borderRight: '1px solid var(--border-base)',
                    borderBottom: '1px solid var(--border-base)',
                    borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
                  }}
                >
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Ouvrir le panneau
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleAutoOpenChat(); }}
                    className="relative w-[28px] h-[14px] rounded-full transition-colors duration-200"
                    style={{
                      backgroundColor: autoOpenChat
                        ? 'var(--accent-primary)'
                        : 'var(--bg-ctrl)',
                      border: `1px solid ${autoOpenChat ? 'var(--accent-primary)' : 'var(--border-base)'}`,
                    }}
                    aria-label={autoOpenChat ? 'Désactiver ouverture auto du panneau chat' : 'Activer ouverture auto du panneau chat'}
                    aria-pressed={autoOpenChat}
                    title={autoOpenChat ? 'Panneau chat : s\'ouvre automatiquement' : 'Panneau chat : ne s\'ouvre pas automatiquement'}
                  >
                    <div
                      className="absolute top-[1.5px] w-[9px] h-[9px] rounded-full transition-all duration-200"
                      style={{
                        left: autoOpenChat ? '15px' : '2px',
                        backgroundColor: autoOpenChat ? '#fff' : 'var(--text-muted)',
                        boxShadow: autoOpenChat ? '0 0 4px rgba(56,189,248,0.4)' : 'none',
                      }}
                    />
                  </button>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Fichiers récents */}
        {recentFiles.length > 0 && (
          <motion.div className="mb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <span
                className="text-[9px] font-mono uppercase tracking-[0.14em] font-semibold"
                style={{ color: 'var(--text-dimmed)' }}
              >
                Récents
              </span>
              <button
                onClick={clearRecentFiles}
                className="text-[9px] px-1.5 py-0.5 transition-colors"
                style={{
                  color: 'var(--text-dimmed)',
                  borderRadius: 'var(--radius-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-dimmed)';
                }}
              >
                Effacer
              </button>
            </div>
            <div
              className="overflow-hidden"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-xl)',
                backdropFilter: 'blur(14px)',
              }}
            >
              {recentFiles.map(({ path, language }, index) => {
                const fileName = path.split(/[/\\]/).pop() || path;
                const dirPath = path.split(/[/\\]/).slice(-3, -1).join('/');
                return (
                  <button
                    key={path}
                    onClick={() => handleOpenRecent(path)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-all duration-150 group"
                    style={{ borderTop: index === 0 ? 'none' : '1px solid var(--border-base)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)';
                      e.currentTarget.style.paddingLeft = '16px';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.paddingLeft = '14px';
                    }}
                  >
                    <FileText size={12} style={{ color: 'var(--ctrl-icon)' }} className="flex-shrink-0" />
                    <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {fileName}
                    </span>
                    <span className="text-[9px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                      {dirPath}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                      {language && (
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-muted)',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          {language}
                        </span>
                      )}
                      {index < 5 && <Kbd>{index + 1}</Kbd>}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Barre d'état workspace / git */}
        <motion.div
          className="flex items-center text-[10px] font-mono overflow-hidden mb-6"
          style={{
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-base)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          {ws.workspace && (
            <span className="flex items-center gap-1.5 px-2.5 py-[7px]" style={{ color: 'var(--text-secondary)' }}>
              <FolderOpen size={10} style={{ color: 'var(--ctrl-icon)' }} />
              {ws.workspace.path.split(/[/\\]/).pop()}
            </span>
          )}
          {gitInfo && (
            <span
              className="flex items-center gap-1.5 px-2.5 py-[7px]"
              style={{
                color: 'var(--text-secondary)',
                borderLeft: '1px solid var(--border-base)',
              }}
            >
              <GitBranch size={10} style={{ color: 'var(--ctrl-icon)' }} />
              {gitInfo.branch}
            </span>
          )}
          <span
            className="flex items-center gap-1.5 px-2.5 py-[7px] ml-auto"
            style={{
              color: connected ? 'var(--color-success)' : 'var(--color-warning)',
              borderLeft: '1px solid var(--border-base)',
            }}
          >
            <Circle size={6} fill="currentColor" strokeWidth={0} />
            <span style={{ color: 'var(--text-muted)' }}>
              {connected ? 'en ligne' : 'hors ligne'}
            </span>
          </span>
        </motion.div>

        {/* Liens rapides */}
        <motion.div
          className="flex items-center justify-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {quickLinks.map(({ label, onClick }, idx) => (
            <React.Fragment key={label}>
              {idx > 0 && (
                <span className="w-px h-3" style={{ backgroundColor: 'var(--border-base)' }} />
              )}
              <button
                onClick={onClick}
                className="text-[10px] font-medium transition-colors"
                style={{ color: 'var(--text-dimmed)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-dimmed)';
                }}
              >
                {label}
              </button>
            </React.Fragment>
          ))}
        </motion.div>
      </motion.div>

      {/* Modales */}
      <AnimatePresence>
        {showCapabilities && (
          <CapabilitiesModal onClose={closeCapabilities} aiName={profile.aiName || 'Leanna'} />
        )}
        {showShortcuts && <ShortcutsModal onClose={closeShortcuts} />}
        {showSystem && (
          <SystemModal
            onClose={closeSystem}
            connected={connected}
            profile={profile}
            gitInfo={gitInfo}
            workspace={ws.workspace}
          />
        )}
      </AnimatePresence>
    </div>
  );
});