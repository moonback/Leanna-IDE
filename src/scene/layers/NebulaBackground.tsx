/**
 * NebulaBackground — fond de nébuleuse (shader fBm à domaine déformé) et champ
 * de particules, réactifs à l'énergie de sceneBus.
 *
 * Tout est calculé sur le GPU : la boucle JS ne met à jour que 3 uniforms
 * par frame (temps, énergie, résolution). Les couleurs sont lues dans les
 * tokens CSS Nebula (--nb-*) : la scène suit le thème clair/sombre.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneBus } from '../sceneBus.js';

export interface NebulaPalette {
  void: THREE.Color;
  violet: THREE.Color;
  magenta: THREE.Color;
  cyan: THREE.Color;
  light: boolean;
}

/** Lit la palette dans les variables CSS courantes de <html>. */
export function readPalette(): NebulaPalette {
  const cs = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => new THREE.Color((cs.getPropertyValue(name).trim() || fallback));
  return {
    // Replis (variable absente) : couleurs nommées proches des tokens Nebula.
    void: color('--nb-void', 'black'),
    violet: color('--nb-violet', 'mediumpurple'),
    magenta: color('--nb-magenta', 'orchid'),
    cyan: color('--nb-cyan', 'darkturquoise'),
    light: document.documentElement.getAttribute('data-theme') === 'light',
  };
}

/**
 * État partagé de la frame courante (écrit par SceneClock, lu par les
 * calques). Un seul canvas existe dans l'app : un objet module suffit et
 * évite tout contexte React dans la boucle de rendu.
 */
const frame = { sceneTime: 0, energy: 0 };

// ── Nébuleuse plein écran ──────────────────────────────────────────────────

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uEnergy;
  uniform vec2 uRes;
  uniform vec3 uVoid;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  uniform float uLight;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0) * 2.2;
    float t = uTime * 0.04;

    // Déformation de domaine : volutes lentes
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 1.3), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t));
    float d = fbm(p + 2.5 * r);

    vec3 col = mix(uC1, uC2, clamp(q.x * 1.4, 0.0, 1.0));
    col = mix(col, uC3, clamp(r.y * r.y * 1.6, 0.0, 1.0));

    // Halo plus dense en haut à droite et au centre droit (comme la maquette)
    float glow = smoothstep(1.25, 0.0, length(uv - vec2(0.8, 0.85)));
    float core = smoothstep(0.75, 0.0, length((uv - vec2(0.62, 0.42)) * vec2(1.6, 1.0)));
    float density = smoothstep(0.38, 0.95, d) * (0.2 + 0.8 * max(glow, core * 0.7));
    float strength = mix(0.42, 0.7, uEnergy);
    if (uLight > 0.5) strength *= 0.3;

    vec3 outCol = mix(uVoid, col, clamp(density * strength, 0.0, 1.0));
    // Lueur diffuse violette indépendante du bruit (profondeur de champ)
    outCol += uC1 * glow * (uLight > 0.5 ? 0.02 : 0.05);
    gl_FragColor = vec4(outCol, 1.0);
    // Les couleurs three.js sont en espace linéaire : reconversion en sRGB.
    #include <colorspace_fragment>
  }
`;

function NebulaQuad({ palette }: { palette: NebulaPalette }) {
  const size = useThree(s => s.size);
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: NEBULA_FRAG,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uVoid: { value: new THREE.Color() },
      uC1: { value: new THREE.Color() },
      uC2: { value: new THREE.Color() },
      uC3: { value: new THREE.Color() },
      uLight: { value: 0 },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const u = material.uniforms;
    u.uVoid.value.copy(palette.void);
    u.uC1.value.copy(palette.violet);
    u.uC2.value.copy(palette.magenta);
    u.uC3.value.copy(palette.cyan);
    u.uLight.value = palette.light ? 1 : 0;
  }, [material, palette]);

  useEffect(() => { material.uniforms.uRes.value.set(size.width, size.height); }, [material, size]);

  useFrame(() => {
    material.uniforms.uTime.value = frame.sceneTime;
    material.uniforms.uEnergy.value = frame.energy;
  });

  return (
    <mesh renderOrder={-1} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

// ── Particules ─────────────────────────────────────────────────────────────

const POINTS_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // Dérive verticale cyclique + légère ondulation, vitesse liée à l'énergie
    p.y = mod(p.y + uTime * (0.04 + 0.05 * aSeed) + 5.0, 10.0) - 5.0;
    p.x += sin(uTime * 0.3 + aSeed * 6.283) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 40.0);
    gl_PointSize = (1.8 + aSeed * 3.2) * (1.0 + uEnergy * 0.8) * uPixelRatio * (6.0 / -mv.z);
    vColor = aColor;
    vAlpha = twinkle * (0.65 + 0.35 * uEnergy) * smoothstep(-10.0, -2.5, mv.z);
  }
`;

const POINTS_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
    #include <colorspace_fragment>
  }
`;

function ParticleField({ count, palette }: { count: number; palette: NebulaPalette }) {
  const dpr = useThree(s => s.viewport.dpr);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const choices = [palette.violet, palette.magenta, palette.cyan];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = -2 - Math.random() * 7;
      const c = choices[i % 3];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      seed[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count, palette]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: palette.light ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uPixelRatio: { value: 1 } },
  }), [palette.light]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => { material.uniforms.uPixelRatio.value = dpr; }, [material, dpr]);

  useFrame(() => {
    material.uniforms.uTime.value = frame.sceneTime;
    material.uniforms.uEnergy.value = frame.energy;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ── Horloge de scène ───────────────────────────────────────────────────────

/**
 * Fait avancer le temps de scène (vitesse modulée par l'énergie) et lisse
 * l'énergie, dans `frame`. Priorité -1 : s'exécute avant les calques.
 */
function SceneClock({ frozen }: { frozen: boolean }) {
  const energy = useRef(0);
  const time = useRef(Math.random() * 100);
  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.1);
    const target = sceneBus.energy();
    energy.current += (target - energy.current) * Math.min(1, dt * 2.5);
    if (!frozen) time.current += dt * (0.6 + energy.current * 2.2);
    frame.sceneTime = time.current;
    frame.energy = energy.current;
  }, -1);
  return null;
}

export function NebulaBackground({ particles, palette, frozen }: {
  particles: number; palette: NebulaPalette; frozen: boolean;
}) {
  return (
    <>
      <SceneClock frozen={frozen} />
      <NebulaQuad palette={palette} />
      {particles > 0 && <ParticleField count={particles} palette={palette} />}
    </>
  );
}
