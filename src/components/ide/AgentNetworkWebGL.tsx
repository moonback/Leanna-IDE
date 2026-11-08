import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface WebGLAgent {
  role: string;
  name: string;
  status: string;
  busy: boolean;
  /** Libellé court sous la sphère (tâche en cours ou statut). */
  caption: string;
  team: string;
  runningTasks: number;
  queuedTasks: number;
}
export interface WebGLBusMessage { id: string; type: string; from: string; to: string; timestamp: string; summary?: string; }

interface Props {
  agents: WebGLAgent[];
  messages: WebGLBusMessage[];
  selectedRole: string | null;
  hoverRole: string | null;
  orchestrating: boolean;
  paused: boolean;
  reduce: boolean;
  onSelect: (role: string) => void;
  onHover: (role: string | null) => void;
  /** WebGL indisponible : le parent bascule sur la vue CSS. */
  onUnavailable: () => void;
}

function cssColor(el: Element, name: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const color = new THREE.Color();
  try { color.setStyle(raw || fallback); } catch { color.setStyle(fallback); }
  return color;
}

/** Texture de halo radial partagée (sprites additifs). */
function glowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function agentPosition(index: number, count: number, teamIndex: number): THREE.Vector3 {
  const angle = (2 * Math.PI * index) / Math.max(count, 1) + teamIndex * 0.22;
  const radius = 3.0 + teamIndex * 1.15;
  return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(index * 1.7 + teamIndex) * 0.42, Math.sin(angle) * radius);
}
const TEAM_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#2dd4bf'];
function messageColor(type: string): THREE.Color {
  const value = type.toLowerCase();
  return new THREE.Color(value.includes('error') || value.includes('fail') ? '#fb526b' : value.includes('result') || value.includes('complete') || value.includes('response') ? '#34d399' : '#38bdf8');
}
interface NodeObjects { sphere: THREE.Mesh; glow: THREE.Sprite; line: THREE.Line; ring: THREE.Mesh; loadRing: THREE.Mesh; sparks: THREE.Sprite[]; base: THREE.Vector3 }
interface CometObject { mesh: THREE.Mesh; trail: THREE.Line; from: string; to: string; createdAt: number }

/** Scène WebGL du réseau multi-agents : sphères lumineuses, halo du cœur, bloom, brouillard de profondeur, caméra orbitale. */
export default function AgentNetworkWebGL({ agents, messages, selectedRole, hoverRole, orchestrating, paused, reduce, onSelect, onHover, onUnavailable }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  // État lu par la boucle de rendu sans relancer l'effet de construction de la scène.
  const live = useRef({ agents, messages, selectedRole, hoverRole, orchestrating, paused, reduce, onSelect, onHover });
  live.current = { agents, messages, selectedRole, hoverRole, orchestrating, paused, reduce, onSelect, onHover };
  const rebuildRef = useRef<() => void>(() => {});

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      onUnavailable();
      return;
    }
    const accent = cssColor(host, '--accent-primary', '#22d3ee');
    const success = cssColor(host, '--color-success', '#22c55e');
    const danger = cssColor(host, '--color-error', '#ef4444');
    const dimmed = cssColor(host, '--text-dimmed', '#8592a6');
    const background = cssColor(host, '--bg', '#060814');
    const statusColor = (status: string) => status === 'busy' ? accent : status === 'overloaded' ? danger : status === 'idle' ? success : dimmed;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.prepend(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = background;
    scene.fog = new THREE.Fog(background, 10, 22);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 5.4, 11);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.target.set(0, -0.5, 0);
    controls.minDistance = 7;
    controls.maxDistance = 17;
    controls.minPolarAngle = 0.5;
    controls.maxPolarAngle = 1.45;
    controls.autoRotateSpeed = 0.6;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.4, 0.55);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const coreLight = new THREE.PointLight(accent, 12, 14);
    scene.add(coreLight);

    // Sol holographique et orbite.
    const grid = new THREE.GridHelper(26, 26, accent, accent);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.12;
    grid.position.y = -1.6;
    scene.add(grid);
    const orbit = new THREE.Mesh(new THREE.RingGeometry(RING - 0.015, RING + 0.015, 128), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    orbit.rotation.x = -Math.PI / 2;
    scene.add(orbit);

    // Cœur Leanna : sphère émissive, anneaux et halo.
    const glowMap = glowTexture();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 48), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 }));
    scene.add(core);
    const coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: accent, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.45 }));
    coreHalo.scale.setScalar(3.2);
    scene.add(coreHalo);
    const coreRings = [0, 1].map(k => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + k * 0.35, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7 - k * 0.25 }));
      ring.rotation.x = k ? 1.1 : -0.9;
      scene.add(ring);
      return ring;
    });

    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);
    let nodes = new Map<string, NodeObjects>();
    let comets: CometObject[] = [];

    const disposeNodes = () => {
      comets = [];
      nodesGroup.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        (mesh.material as THREE.Material | undefined)?.dispose?.();
      });
      nodesGroup.clear();
      nodes = new Map();
    };

    const rebuild = () => {
      disposeNodes();
      const list = live.current.agents;
      const teams = [...new Set(list.map(agent => agent.team || 'Autres'))];
      teams.forEach((team, teamIndex) => {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(3.0 + teamIndex * 1.15, 0.012, 6, 160),
          new THREE.MeshBasicMaterial({ color: TEAM_COLORS[teamIndex % TEAM_COLORS.length], transparent: true, opacity: 0.32 }));
        halo.rotation.x = -Math.PI / 2;
        nodesGroup.add(halo);
      });
      const teamPositions = new Map<string, { index: number; count: number }>();
      teams.forEach(team => {
        const members = list.filter(agent => (agent.team || 'Autres') === team);
        members.forEach((agent, index) => teamPositions.set(agent.role, { index, count: members.length }));
      });
      list.forEach((agent, index) => {
        const color = statusColor(agent.status);
        const teamIndex = Math.max(0, teams.indexOf(agent.team || 'Autres'));
        const slot = teamPositions.get(agent.role)!;
        const base = agentPosition(slot.index, slot.count, teamIndex);
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: agent.busy ? 1.1 : 0.35, roughness: 0.3, metalness: 0.2, transparent: true }));
        sphere.position.copy(base);
        sphere.userData.role = agent.role;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: agent.busy ? 0.6 : 0.2 }));
        glow.scale.setScalar(agent.busy ? 1.7 : 1.1);
        glow.position.copy(base);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), base]),
          new THREE.LineBasicMaterial({ color: agent.busy ? accent : dimmed, transparent: true, opacity: agent.busy ? 0.9 : 0.22 }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 8, 64), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0 }));
        ring.position.copy(base);
        const load = Math.min(1, (agent.runningTasks + agent.queuedTasks * 0.5) / 3);
        const overloaded = agent.status === 'overloaded' || agent.runningTasks + agent.queuedTasks > 3;
        const loadRing = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.035, 8, 64, Math.max(0.08, Math.PI * 2 * load)),
          new THREE.MeshBasicMaterial({ color: overloaded ? '#fb526b' : TEAM_COLORS[teamIndex % TEAM_COLORS.length], transparent: true, opacity: 0.95 }));
        loadRing.position.copy(base);
        const sparks = agent.busy ? [0, 1, 2].map(() => {
          const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: accent, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
          spark.scale.setScalar(0.32);
          nodesGroup.add(spark);
          return spark;
        }) : [];
        nodesGroup.add(line, sphere, glow, ring, loadRing);
        nodes.set(agent.role, { sphere, glow, line, ring, loadRing, sparks, base });
      });
      const now = Date.now();
      const roles = new Set(list.map(agent => agent.role));
      live.current.messages.slice(-40).forEach(message => {
        const createdAt = Date.parse(message.timestamp);
        if (!roles.has(message.from) || !roles.has(message.to) || message.from === message.to || !Number.isFinite(createdAt) || now - createdAt > 12000) return;
        const color = messageColor(message.type);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), new THREE.MeshBasicMaterial({ color, transparent: true }));
        const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }));
        nodesGroup.add(mesh, trail);
        comets.push({ mesh, trail, from: message.from, to: message.to, createdAt });
      });
    };
    rebuildRef.current = rebuild;
    rebuild();

    // Taille : suit le conteneur (carte du dashboard ou plein écran).
    let width = 1, height = 1;
    const resize = () => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      composer.setSize(width, height);
      bloom.resolution.set(width, height);
      camera.aspect = width / height;
      camera.position.setLength(width < 640 ? 14.5 : 12);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Survol et clic par raycasting ; un glisser (rotation caméra) n'est pas un clic.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...nodes.values()].map(node => node.sphere))[0];
      return (hit?.object.userData.role as string | undefined) ?? null;
    };
    let downAt: { x: number; y: number } | null = null;
    let hovered: string | null = null;
    const onMove = (event: PointerEvent) => {
      const role = pick(event);
      renderer.domElement.style.cursor = role ? 'pointer' : 'grab';
      if (role !== hovered) { hovered = role; live.current.onHover(role); }
    };
    const onDown = (event: PointerEvent) => { downAt = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: PointerEvent) => {
      const start = downAt;
      downAt = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const role = pick(event);
      if (role) live.current.onSelect(role);
    };
    const onContextMenu = (event: MouseEvent) => {
      const role = pick(event);
      if (role) { event.preventDefault(); live.current.onSelect(role); }
    };
    const onLeave = () => { if (hovered) { hovered = null; live.current.onHover(null); } };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const projected = new THREE.Vector3();
    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const state = live.current;
      const t = clock.getElapsedTime();
      const motion = !state.reduce;
      controls.autoRotate = motion && !state.paused && !state.hoverRole && !state.selectedRole;
      controls.update();

      // Cœur : respiration, anneaux, halo renforcé pendant l'orchestration.
      const beat = motion ? 1 + Math.sin(t * (state.orchestrating ? 4 : 1.6)) * (state.orchestrating ? 0.06 : 0.025) : 1;
      core.scale.setScalar(beat);
      coreHalo.scale.setScalar((state.orchestrating ? 4 : 3.2) * beat);
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity = state.orchestrating ? 1.4 : 0.9;
      coreLight.intensity = state.orchestrating ? 20 : 12;
      if (motion) {
        coreRings[0].rotation.z += state.orchestrating ? 0.02 : 0.006;
        coreRings[1].rotation.z -= state.orchestrating ? 0.014 : 0.004;
        core.position.y = Math.sin(t * 0.8) * 0.08;
        coreHalo.position.y = core.position.y;
      }
      bloom.strength = state.orchestrating ? 0.8 : 0.55;

      state.agents.forEach((agent, index) => {
        const node = nodes.get(agent.role);
        if (!node) return;
        const focused = !state.hoverRole || state.hoverRole === agent.role;
        const selected = state.selectedRole === agent.role;
        const float = motion ? Math.sin(t * 1.2 + index) * 0.12 : 0;
        node.sphere.position.set(node.base.x, node.base.y + float, node.base.z);
        node.glow.position.copy(node.sphere.position);
        node.ring.position.copy(node.sphere.position);
        node.ring.lookAt(camera.position);
        node.loadRing.position.copy(node.sphere.position);
        node.loadRing.lookAt(camera.position);
        const pulse = agent.busy && motion ? 1 + Math.sin(t * 5 + index) * 0.12 : 1;
        const grow = (selected || state.hoverRole === agent.role) ? 1.25 : 1;
        node.sphere.scale.setScalar(pulse * grow);
        (node.sphere.material as THREE.MeshStandardMaterial).opacity = focused ? 1 : 0.3;
        (node.glow.material as THREE.SpriteMaterial).opacity = focused ? (agent.busy ? 0.6 : 0.2) : 0.05;
        (node.line.material as THREE.LineBasicMaterial).opacity = focused ? (agent.busy || state.hoverRole === agent.role ? 0.9 : 0.22) : 0.06;
        (node.ring.material as THREE.MeshBasicMaterial).opacity = selected ? 0.9 : 0;
        const positions = node.line.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(1, node.sphere.position.x, node.sphere.position.y, node.sphere.position.z);
        positions.needsUpdate = true;
        node.sparks.forEach((spark, k) => {
          const p = motion ? ((t * 0.6 + k / node.sparks.length) % 1) : (k + 1) / (node.sparks.length + 1);
          spark.position.lerpVectors(core.position, node.sphere.position, p);
          (spark.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI);
        });

        // Étiquette HTML projetée sous la sphère, estompée selon la profondeur.
        const label = labelRefs.current.get(agent.role);
        if (label) {
          projected.copy(node.sphere.position);
          projected.y -= 0.42;
          projected.project(camera);
          const visible = projected.z < 1;
          const x = (projected.x + 1) / 2 * width;
          const y = (1 - projected.y) / 2 * height;
          const depth = THREE.MathUtils.clamp(1 - (camera.position.distanceTo(node.sphere.position) - 5) / 9, 0.35, 1);
          label.style.transform = `translate(-50%, 0) translate(${x}px, ${y}px) scale(${0.8 + depth * 0.2})`;
          label.style.opacity = visible ? String(focused ? 0.55 + depth * 0.45 : 0.2) : '0';
          label.style.zIndex = String(Math.round(depth * 100));
        }
      });
      comets = comets.filter(comet => {
        const age = (Date.now() - comet.createdAt) / 1000;
        const from = nodes.get(comet.from), to = nodes.get(comet.to);
        if (!from || !to || age > 12) {
          nodesGroup.remove(comet.mesh, comet.trail);
          comet.mesh.geometry.dispose(); (comet.mesh.material as THREE.Material).dispose();
          comet.trail.geometry.dispose(); (comet.trail.material as THREE.Material).dispose();
          return false;
        }
        const progress = (age % 2.4) / 2.4;
        const start = from.sphere.position, end = to.sphere.position;
        const point = new THREE.Vector3().lerpVectors(start, end, progress);
        point.y += Math.sin(progress * Math.PI) * 0.85;
        comet.mesh.position.copy(point);
        const positions = comet.trail.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, start.x, start.y, start.z); positions.setXYZ(1, point.x, point.y, point.z); positions.needsUpdate = true;
        return true;
      });
      composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      disposeNodes();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        (mesh.material as THREE.Material | undefined)?.dispose?.();
      });
      glowMap.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onUnavailable]);

  // Reconstruit les sphères quand la composition ou l'état des agents change.
  const signature = agents.map(agent => `${agent.role}:${agent.status}:${agent.busy}:${agent.runningTasks}:${agent.queuedTasks}:${agent.team}`).join('|');
  const messageSignature = messages.map(message => `${message.id}:${message.timestamp}`).join('|');
  useEffect(() => { rebuildRef.current(); }, [signature, messageSignature]);

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden rounded-lg">
      {/* Étiquettes accessibles au clavier, positionnées à chaque image par la boucle de rendu. */}
      {agents.map(agent => (
        <button key={agent.role} type="button"
          ref={element => { if (element) labelRefs.current.set(agent.role, element); else labelRefs.current.delete(agent.role); }}
          onClick={() => onSelect(agent.role)}
          onContextMenu={event => { event.preventDefault(); onSelect(agent.role); }}
          onFocus={() => onHover(agent.role)} onBlur={() => onHover(null)}
          onPointerEnter={() => onHover(agent.role)} onPointerLeave={() => onHover(null)}
          aria-label={`${agent.name} — ${agent.caption}. Ouvrir le détail`}
          className="absolute left-0 top-0 max-w-[140px] rounded-md px-1.5 py-0.5 text-center leading-tight focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2"
          style={{ background: 'color-mix(in srgb, var(--bg-panel) 90%, transparent)', border: '1px solid var(--border-base)', backdropFilter: 'blur(6px)', opacity: 0, willChange: 'transform' }}>
          <span className="block truncate text-[10px] font-semibold" style={{ color: 'var(--text-primary)' }}>{agent.name}</span>
          <span className="block truncate text-[9px]" style={{ color: agent.busy ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{agent.caption}</span>
          <span className="block text-[8px] font-mono" style={{ color: agent.runningTasks + agent.queuedTasks > 3 ? '#fb526b' : 'var(--text-dimmed)' }}>{agent.runningTasks} actifs · {agent.queuedTasks} attente</span>
        </button>
      ))}
    </div>
  );
}
