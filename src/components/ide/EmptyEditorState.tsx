import React, {
  useState, useEffect, useMemo, useRef, useCallback,
} from 'react';
import {
  Plus, X, FolderOpen, FileText,
  MessageSquare, FolderPlus,
  Code2, GitBranch, BrainCircuit,
  Circle, Search, ChevronRight, Trash2,
  Command, BookOpen,
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
  if (/shell|exec/.test(tool)) return '244, 114, 182';    // pink
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
      className="inline-flex items-center justify-center h-[19px] min-w-[19px] px-1.5 text-[9.5px] font-mono font-medium tracking-wide"
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
// (moteur inchangé — c'est déjà la partie la plus soignée du composant)

const BASE_PARTICLE_DENSITY = 0.000055; // particules par pixel²
const MIN_PARTICLES = 14;
const MAX_PARTICLES = 42;
const BASE_SPEED = 0.16;
const BURST_DURATION = 1.1; // secondes, durée de l'explosion à la connexion

interface ParticleFieldProps {
  connected: boolean;
  isBusy: boolean;
  activeTool: string;
  getInputAmplitude: () => number;
  getOutputAmplitude: () => number;
}

const ParticleField = React.memo(function ParticleField({
  connected,
  isBusy,
  activeTool,
  getInputAmplitude,
  getOutputAmplitude,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const prevConnectedRef = useRef(connected);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const burstActive = connected && !prevConnectedRef.current;
    prevConnectedRef.current = connected;

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      phase: number; z: number;
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

    let smoothMouseX = -9999;
    let smoothMouseY = -9999;
    let cursorGlowAlpha = 0;

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
      smoothAudio += (rawAudio - smoothAudio) * (rawAudio > smoothAudio ? 0.75 : 0.12);

      const mode = resolveMode(connected, isBusy, inputAmp, outputAmp);
      if (isBusy && activeTool) currentToolColor = toolColor(activeTool);

      let targetSpeed = BASE_SPEED;
      let connDist = 120;
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

      const lerpRate = 0.04;
      const [tr, tg, tb] = parseColor(targetColor);
      smoothR += (tr - smoothR) * lerpRate;
      smoothG += (tg - smoothG) * lerpRate;
      smoothB += (tb - smoothB) * lerpRate;
      const primaryColor = `${smoothR | 0}, ${smoothG | 0}, ${smoothB | 0}`;

      smoothSpeed += (targetSpeed - smoothSpeed) * 0.18;
      ctx.clearRect(0, 0, w, h);

      const ambientAlpha = mode === 'disconnected' ? 0.03 : 0.07 + smoothAudio * 0.08;
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.65);
      ambient.addColorStop(0, `rgba(${primaryColor}, ${ambientAlpha})`);
      ambient.addColorStop(1, `rgba(${primaryColor}, 0)`);
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, w, h);

      const burstProgress = burstActive ? Math.min(time / BURST_DURATION, 1) : 1;
      if (burstActive && time < BURST_DURATION) {
        if (time < 0.35) {
          const flashAlpha = (1 - time / 0.35) * 0.38;
          const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.42);
          flash.addColorStop(0, `rgba(${primaryColor}, ${flashAlpha})`);
          flash.addColorStop(1, `rgba(${primaryColor}, 0)`);
          ctx.fillStyle = flash;
          ctx.fillRect(0, 0, w, h);
        }
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

      if (mouse.active) {
        const lerpMouse = 0.08;
        if (smoothMouseX < -9000) {
          smoothMouseX = mouse.x;
          smoothMouseY = mouse.y;
        } else {
          smoothMouseX += (mouse.x - smoothMouseX) * lerpMouse;
          smoothMouseY += (mouse.y - smoothMouseY) * lerpMouse;
        }
        cursorGlowAlpha += (1 - cursorGlowAlpha) * 0.12;
      } else {
        cursorGlowAlpha += (0 - cursorGlowAlpha) * 0.06;
      }

      if (cursorGlowAlpha > 0.005 && smoothMouseX > -9000) {
        let glowIntensity = 0.22;
        let glowRadius = 520;
        switch (mode) {
          case 'disconnected':
            glowIntensity = 0.10;
            glowRadius = 350;
            break;
          case 'idle':
            glowIntensity = 0.22;
            glowRadius = 520;
            break;
          case 'listening':
            glowIntensity = 0.30 + smoothAudio * 0.20;
            glowRadius = 560 + smoothAudio * 180;
            break;
          case 'speaking':
            glowIntensity = 0.26 + smoothAudio * 0.18;
            glowRadius = 550 + smoothAudio * 150;
            break;
          case 'working':
            glowIntensity = 0.28;
            glowRadius = 560;
            break;
        }

        const baseAlpha = glowIntensity * cursorGlowAlpha;

        const bgNappeR = glowRadius * 1.8;
        const bgNappe = ctx.createRadialGradient(
          smoothMouseX, smoothMouseY, 0,
          smoothMouseX, smoothMouseY, bgNappeR,
        );
        bgNappe.addColorStop(0, `rgba(${primaryColor}, ${baseAlpha * 0.5})`);
        bgNappe.addColorStop(0.3, `rgba(${primaryColor}, ${baseAlpha * 0.25})`);
        bgNappe.addColorStop(0.6, `rgba(${primaryColor}, ${baseAlpha * 0.08})`);
        bgNappe.addColorStop(1, `rgba(${primaryColor}, 0)`);
        ctx.fillStyle = bgNappe;
        ctx.fillRect(0, 0, w, h);

        const lobes = [
          { ox: 0,    oy: 0,     rMul: 1.0,  aMul: 0.85, phase: 0,   spd: 0.5 },
          { ox: 0.55, oy: -0.35, rMul: 0.78, aMul: 0.6,  phase: 1.1, spd: 0.65 },
          { ox: -0.5, oy: 0.4,   rMul: 0.72, aMul: 0.55, phase: 2.3, spd: 0.55 },
          { ox: 0.3,  oy: 0.55,  rMul: 0.68, aMul: 0.5,  phase: 3.7, spd: 0.7 },
          { ox: -0.4, oy: -0.45, rMul: 0.74, aMul: 0.55, phase: 4.9, spd: 0.6 },
          { ox: 0.6,  oy: 0.15,  rMul: 0.60, aMul: 0.45, phase: 6.1, spd: 0.75 },
          { ox: -0.2, oy: 0.6,   rMul: 0.55, aMul: 0.4,  phase: 7.4, spd: 0.5 },
        ];

        for (const lobe of lobes) {
          const breathe = 1 + 0.22 * Math.sin(time * lobe.spd * 1.4 + lobe.phase);
          const wobble = 0.45;
          const driftX = Math.sin(time * lobe.spd + lobe.phase) * glowRadius * wobble * lobe.ox
                       + Math.cos(time * lobe.spd * 0.7 + lobe.phase * 1.3) * glowRadius * 0.12;
          const driftY = Math.cos(time * lobe.spd * 0.85 + lobe.phase + 1.0) * glowRadius * wobble * lobe.oy
                       + Math.sin(time * lobe.spd * 0.6 + lobe.phase * 0.8) * glowRadius * 0.10;

          const lx = smoothMouseX + driftX;
          const ly = smoothMouseY + driftY;
          const lr = glowRadius * lobe.rMul * breathe;
          const la = baseAlpha * lobe.aMul;

          const lobeGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
          lobeGrad.addColorStop(0, `rgba(${primaryColor}, ${la * 0.85})`);
          lobeGrad.addColorStop(0.12, `rgba(${primaryColor}, ${la * 0.6})`);
          lobeGrad.addColorStop(0.35, `rgba(${primaryColor}, ${la * 0.3})`);
          lobeGrad.addColorStop(0.6, `rgba(${primaryColor}, ${la * 0.10})`);
          lobeGrad.addColorStop(0.85, `rgba(${primaryColor}, ${la * 0.03})`);
          lobeGrad.addColorStop(1, `rgba(${primaryColor}, 0)`);
          ctx.fillStyle = lobeGrad;
          ctx.fillRect(0, 0, w, h);
        }

        const filamentCount = 4;
        for (let i = 0; i < filamentCount; i++) {
          const angle = (Math.PI * 2 / filamentCount) * i + time * 0.3;
          const dist = glowRadius * (0.35 + 0.15 * Math.sin(time * 0.9 + i * 2.1));
          const fx = smoothMouseX + Math.cos(angle) * dist;
          const fy = smoothMouseY + Math.sin(angle) * dist;
          const fr = glowRadius * (0.3 + 0.08 * Math.sin(time * 1.2 + i));
          const fa = baseAlpha * 0.3;

          const filGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
          filGrad.addColorStop(0, `rgba(${primaryColor}, ${fa})`);
          filGrad.addColorStop(0.4, `rgba(${primaryColor}, ${fa * 0.3})`);
          filGrad.addColorStop(1, `rgba(${primaryColor}, 0)`);
          ctx.fillStyle = filGrad;
          ctx.fillRect(0, 0, w, h);
        }

        const coreR = glowRadius * 0.22;
        const coreAlpha = baseAlpha * 1.6;
        const coreGrad = ctx.createRadialGradient(
          smoothMouseX, smoothMouseY, 0,
          smoothMouseX, smoothMouseY, coreR,
        );
        coreGrad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(coreAlpha * 0.4, 0.25)})`);
        coreGrad.addColorStop(0.2, `rgba(${primaryColor}, ${Math.min(coreAlpha, 0.45)})`);
        coreGrad.addColorStop(0.6, `rgba(${primaryColor}, ${coreAlpha * 0.25})`);
        coreGrad.addColorStop(1, `rgba(${primaryColor}, 0)`);
        ctx.fillStyle = coreGrad;
        ctx.fillRect(0, 0, w, h);
      }

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
        setFiles(parsed.slice(0, 4));
      }
    } catch {
      // ignore
    }
  }, []);

  const updateFiles = useCallback((newFiles: RecentFile[]) => {
    setFiles(newFiles.slice(0, 4));
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
    { icon: GitBranch, label: 'Git intégré', desc: 'Commits, branches, push/pull, diffs — gestion complète.' },
    { icon: Search, label: 'Recherche intelligente', desc: 'Fichiers, symboles et documentation avec contexte IA.' },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <motion.div
        className="relative w-full max-w-sm max-h-[75vh] overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-base)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
        }}
        initial={{ scale: 0.97, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.97, y: 10, opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-base)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <BrainCircuit className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                Capacités
              </h2>
              <p className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                Modules actifs de {aiName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center transition-colors"
            style={{ color: 'var(--ctrl-icon)', borderRadius: 'var(--radius-md)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          {capabilities.map(({ icon: Icon, label, desc }, i) => (
            <div
              key={label}
              className="flex items-start gap-3 px-3 py-3 transition-colors"
              style={{
                borderRadius: 'var(--radius-md)',
                borderTop: i === 0 ? 'none' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div
                className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}
              >
                <Icon size={13} style={{ color: 'var(--ctrl-icon)' }} />
              </div>
              <div className="min-w-0 pt-0.5">
                <span className="text-[11.5px] font-medium block mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {label}
                </span>
                <span className="text-[10.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
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
  onCreateFolder: () => void;
  onShowSettings: () => void;
  onOpenSearch?: () => void;
  onOpenChat?: () => void;
  onOpenNotebooks?: () => void;
}

export const EmptyEditorState = React.memo(function EmptyEditorState({
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onShowSettings,
  onOpenChat,
  onOpenNotebooks,
}: EmptyEditorStateProps) {
  const ws = useWorkspaceState();
  const { connected, isBusy, getInputAmplitude, getOutputAmplitude, connect } =
    useLiveAPIContext();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const disconnectedBg = theme === 'dark' ? disconnectedBgDark : disconnectedBgLight;

  const [showCapabilities, setShowCapabilities] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  const [recentFiles, setRecentFiles, clearRecentFiles] = useRecentFiles();
  const gitInfo = useGitInfo();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }, []);

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
          const updated = recentFiles.filter((f) => f.path !== filePath);
          setRecentFiles(updated);
          return;
        }
        onOpenFile(filePath);
      } catch {
        onOpenFile(filePath);
      }
    },
    [recentFiles, setRecentFiles, onOpenFile]
  );

  const openCapabilities = useCallback(() => setShowCapabilities(true), []);
  const closeCapabilities = useCallback(() => setShowCapabilities(false), []);
  const openShortcuts = useCallback(() => setShowShortcuts(true), []);
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
  const openSystem = useCallback(() => setShowSystem(true), []);
  const closeSystem = useCallback(() => setShowSystem(false), []);

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

  const [createMode, setCreateMode] = useState<'file' | 'folder'>('file');
  const toggleCreateMode = useCallback(() => {
    setCreateMode((prev) => (prev === 'file' ? 'folder' : 'file'));
  }, []);

  const handleOpenChat = useCallback(() => {
    if (!connected) {
      connect([], 'full');
    }
    if (autoOpenChat) {
      onOpenChat?.();
    }
  }, [connected, connect, onOpenChat, autoOpenChat]);

  const quickLinks = useMemo(
    () => [
      { label: 'Capacités', onClick: openCapabilities },
      { label: 'Raccourcis', onClick: openShortcuts },
      { label: 'Système', onClick: openSystem },
    ],
    [openCapabilities, openShortcuts, openSystem]
  );

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto relative"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* ── Fond ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${disconnectedBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.28,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 65% 60% at 30% 40%, transparent 0%, var(--bg-base) 100%)',
        }}
      />

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
                'radial-gradient(ellipse 45% 35% at 32% 34%, var(--accent-subtle) 0%, transparent 70%)',
            }}
          />
        </>
      )}

      {/* ── Barre méta supérieure : statut, workspace, git ── */}
      <motion.div
        className="relative z-10 flex items-center gap-4 px-8 pt-6 pb-2 text-[10.5px] font-mono"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="w-[6px] h-[6px] rounded-full flex-shrink-0"
            style={{
              backgroundColor: connected ? 'var(--color-success)' : 'var(--color-warning)',
              boxShadow: connected ? '0 0 6px var(--color-success)' : '0 0 6px var(--color-warning)',
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>
            {connected ? 'en ligne' : 'hors ligne'}
          </span>
        </span>

        {ws.workspace && (
          <>
            <span className="w-px h-3" style={{ backgroundColor: 'var(--border-base)' }} />
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-dimmed)' }}>
              <FolderOpen size={11} />
              {ws.workspace.path.split(/[/\\]/).pop()}
            </span>
          </>
        )}

        {gitInfo && (
          <>
            <span className="w-px h-3" style={{ backgroundColor: 'var(--border-base)' }} />
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-dimmed)' }}>
              <GitBranch size={11} />
              {gitInfo.branch}
            </span>
          </>
        )}

        <span className="ml-auto flex items-center gap-3">
          {quickLinks.map(({ label, onClick }, idx) => (
            <React.Fragment key={label}>
              {idx > 0 && <span className="w-px h-3" style={{ backgroundColor: 'var(--border-base)' }} />}
              <button
                onClick={onClick}
                className="transition-colors"
                style={{ color: 'var(--text-dimmed)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dimmed)'; }}
              >
                {label}
              </button>
            </React.Fragment>
          ))}
        </span>
      </motion.div>

      {/* ── Corps principal ── */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 py-10">
        <div className="w-full max-w-[560px] mx-auto md:mx-0 md:ml-[8%]">

          {/* Salutation — grande, ancrée à gauche, asymétrique */}
          <motion.h1
            className="text-[34px] leading-[1.08] font-semibold tracking-[-0.02em] mb-1.5"
            style={{ color: 'var(--text-primary)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
          >
            {profile.userName ? `${greeting}, ${profile.userName}.` : `${greeting}.`}
          </motion.h1>
          <motion.p
            className="text-[13px] mb-9"
            style={{ color: 'var(--text-muted)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
          >
            {profile.aiName || 'Leanna'} est {connected ? 'prête à travailler avec vous' : 'en attente de connexion'}.
          </motion.p>

          {/* ── Actions primaires ── */}
          <motion.div
            className="flex flex-col gap-2.5 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            {/* Chat IA — action mise en avant */}
            <div className="flex">
              <button
                onClick={handleOpenChat}
                className="group relative flex items-center gap-3.5 flex-1 px-4 py-3.5 text-left transition-all duration-200 overflow-hidden"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  borderRadius: 'var(--radius-lg)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
              >
                <div
                  className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 'var(--radius-md)' }}
                >
                  <MessageSquare size={15} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-white">
                    Discuter avec {profile.aiName || 'l\'agent'}
                  </div>
                  <div className="text-[10.5px] text-white/70 truncate">
                    Ouvrir la session vocale et texte
                  </div>
                </div>
                <Kbd>{MOD}+L</Kbd>
                <ChevronRight size={14} className="text-white/50 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleAutoOpenChat(); }}
                title={autoOpenChat ? 'Ouverture auto du panneau : activée' : 'Ouverture auto du panneau : désactivée'}
                className="ml-2 w-[42px] flex items-center justify-center flex-shrink-0 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-base)',
                  borderRadius: 'var(--radius-lg)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-base)'; }}
              >
                <span
                  className="w-[7px] h-[7px] rounded-full transition-colors"
                  style={{ backgroundColor: autoOpenChat ? 'var(--accent-primary)' : 'var(--text-dimmed)' }}
                />
              </button>
            </div>

            {/* Nouveau fichier / dossier — action secondaire */}
            <div className="flex">
              <button
                onClick={createMode === 'file' ? onCreateFile : onCreateFolder}
                className="group flex items-center gap-3.5 flex-1 px-4 py-3.5 text-left transition-all duration-200"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-base)',
                  borderRadius: 'var(--radius-lg)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-base)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                }}
              >
                <div
                  className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-subtle)', borderRadius: 'var(--radius-md)' }}
                >
                  {createMode === 'file' ? (
                    <Plus size={15} style={{ color: 'var(--accent-primary)' }} />
                  ) : (
                    <FolderPlus size={15} style={{ color: 'var(--accent-primary)' }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {createMode === 'file' ? 'Nouveau fichier' : 'Nouveau dossier'}
                  </div>
                  <div className="text-[10.5px] truncate" style={{ color: 'var(--text-muted)' }}>
                    Dans le projet actif
                  </div>
                </div>
                <Kbd>{MOD}+N</Kbd>
              </button>
              <button
                onClick={toggleCreateMode}
                title={createMode === 'file' ? 'Basculer sur dossier' : 'Basculer sur fichier'}
                className="ml-2 w-[42px] flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-base)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--ctrl-icon)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-base)'; }}
              >
                {createMode === 'file' ? <FolderPlus size={13} /> : <FileText size={13} />}
              </button>
            </div>

            {/* Notebooks — accès rapide */}
            <button
              onClick={() => onOpenNotebooks?.()}
              className="group flex items-center gap-3.5 w-full px-4 py-3.5 text-left transition-all duration-200"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-lg)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-base)';
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
            >
              <div
                className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-subtle)', borderRadius: 'var(--radius-md)' }}
              >
                <BookOpen size={15} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Notebooks
                </div>
                <div className="text-[10.5px] truncate" style={{ color: 'var(--text-muted)' }}>
                  Sources, chat IA groundé, résumés et podcasts
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-dimmed)' }} className="flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>

          {/* ── Fichiers récents ── */}
          {recentFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-2 px-0.5">
                <span
                  className="text-[9.5px] font-mono uppercase tracking-[0.14em] font-semibold"
                  style={{ color: 'var(--text-dimmed)' }}
                >
                  Récents
                </span>
                <button
                  onClick={clearRecentFiles}
                  className="flex items-center gap-1 text-[9.5px] px-1.5 py-0.5 transition-colors"
                  style={{ color: 'var(--text-dimmed)', borderRadius: 'var(--radius-sm)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dimmed)'; }}
                >
                  <Trash2 size={9} />
                  Effacer
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {recentFiles.map(({ path, language }, index) => {
                  const fileName = path.split(/[/\\]/).pop() || path;
                  const dirPath = path.split(/[/\\]/).slice(-3, -1).join('/');
                  return (
                    <button
                      key={path}
                      onClick={() => handleOpenRecent(path)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-150 group"
                      style={{ borderRadius: 'var(--radius-md)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--ctrl-hover)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span
                        className="text-[9px] font-mono w-3 flex-shrink-0 text-right"
                        style={{ color: 'var(--text-dimmed)' }}
                      >
                        {index + 1}
                      </span>
                      <FileText size={12} style={{ color: 'var(--ctrl-icon)' }} className="flex-shrink-0" />
                      <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {fileName}
                      </span>
                      <span className="text-[9px] font-mono truncate" style={{ color: 'var(--text-dimmed)' }}>
                        {dirPath}
                      </span>
                      {language && (
                        <span
                          className="ml-auto text-[9px] font-mono px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--bg-input)',
                            color: 'var(--text-muted)',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          {language}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Astuce palette de commandes ── */}
          <motion.div
            className="flex items-center gap-2 mt-8 text-[10.5px]"
            style={{ color: 'var(--text-dimmed)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Command size={11} />
            <span>
              Astuce&nbsp;: <Kbd>{MOD}+,</Kbd> ouvre les réglages à tout moment.
            </span>
          </motion.div>
        </div>
      </div>

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