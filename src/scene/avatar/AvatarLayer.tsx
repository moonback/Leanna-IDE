/**
 * AvatarLayer — rendu du modèle VRM de Leanna dans le canvas WebGL unique.
 *
 * L'avatar a sa propre scène et sa propre caméra. Il est dessiné en seconde
 * passe, dans le rectangle de l'élément DOM d'ancrage (AvatarStage), via
 * viewport + scissor : une seule surface WebGL pour toute l'app (plan §3.3).
 *
 * Chargement : fetch + vérification de la signature glTF (le serveur de dev
 * renvoie index.html pour un fichier absent), puis GLTFLoader + plugin VRM.
 * En cas d'absence ou d'erreur, avatarBus passe en `missing`/`error` et le
 * DOM affiche la mascotte 2D.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as ThreeVRM from '@pixiv/three-vrm';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import { avatarBus, AVATAR_URL, isGlbBuffer } from './avatarBus.js';
import {
  MOOD_POSES, blinkWeight, combineExpressions, damp, lipSync, nextBlinkDelay,
  type AvatarPose, type VrmExpression,
} from './avatarStateMachine.js';
import { registerRenderPass } from '../renderPasses.js';

/**
 * Les types de three-vrm 3.5.5 réexportent `./VRMUtils` (un dossier), que la
 * résolution NodeNext du projet ne suit pas. La classe existe bien à
 * l'exécution : on retype localement les utilitaires employés.
 */
interface VrmUtilsApi {
  removeUnnecessaryVertices(root: THREE.Object3D): void;
  combineSkeletons(root: THREE.Object3D): void;
  rotateVRM0(vrm: VRM): void;
  deepDispose(root: THREE.Object3D): void;
}
const VRMUtils = (ThreeVRM as unknown as { VRMUtils: VrmUtilsApi }).VRMUtils;

const ALL_EXPRESSIONS: VrmExpression[] = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink'];

/** Bras le long du corps en pose normalisée VRM (le modèle est en T-pose). */
const ARM_DOWN = 1.2;

/**
 * Cadrage en buste, calé sur la hauteur de l'os de la tête (indépendant de
 * la taille du modèle) : de juste au-dessus des cheveux jusqu'à la taille.
 */
const FRAME = { cameraBelowHead: 0.1, targetBelowHead: 0.2, distance: 1.55 };

export function frameCamera(camera: THREE.PerspectiveCamera, headY: number): void {
  camera.position.set(0, headY - FRAME.cameraBelowHead, FRAME.distance);
  camera.lookAt(0, headY - FRAME.targetBelowHead, 0);
}

async function loadVrm(url: string, signal: AbortSignal): Promise<VRM> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { missing: res.status === 404 });
  const buf = await res.arrayBuffer();
  if (!isGlbBuffer(buf)) throw Object.assign(new Error('Fichier absent ou non VRM'), { missing: true });
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(buf, '');
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error('Le fichier glTF ne contient pas d’extension VRM');
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // les VRM 0.x regardent -Z
  vrm.scene.traverse((o: THREE.Object3D) => { o.frustumCulled = false; });
  return vrm;
}

export function AvatarLayer() {
  const vrmRef = useRef<VRM | null>(null);

  // Scène, caméra et lumières propres à l'avatar.
  const { scene, camera } = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
    frameCamera(camera, 1.4); // provisoire, recalé sur la tête au chargement
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(0.8, 1.8, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color('mediumpurple'), 1.1);
    rim.position.set(-1.5, 1.6, -1.5);
    scene.add(rim);
    return { scene, camera };
  }, []);

  // Chargement du modèle.
  useEffect(() => {
    const ctrl = new AbortController();
    avatarBus.setLoadStatus('loading');
    loadVrm(AVATAR_URL, ctrl.signal)
      .then(vrm => {
        vrmRef.current = vrm;
        scene.add(vrm.scene);
        vrm.scene.updateMatrixWorld(true);
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
          const headY = head.getWorldPosition(new THREE.Vector3()).y;
          const raw = vrm.humanoid.getRawBoneNode('head')?.getWorldPosition(new THREE.Vector3()).y;
          const box = new THREE.Box3().setFromObject(vrm.scene);
          console.info('[avatar-debug]', { headY, raw, boxMin: box.min.y, boxMax: box.max.y });
          anim.current.headY = headY;
          anim.current.gaze.set(0, headY, 2);
          frameCamera(camera, headY);
        }
        avatarBus.setLoadStatus('ready');
      })
      .catch((e: Error & { missing?: boolean }) => {
        if (ctrl.signal.aborted) return;
        avatarBus.setLoadStatus(e.missing ? 'missing' : 'error', e.message);
      });
    return () => {
      ctrl.abort();
      const vrm = vrmRef.current;
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        vrmRef.current = null;
      }
    };
  }, [scene, camera]);

  // Animation : humeur, lip-sync, clignements, regard, posture.
  const anim = useRef({
    t: 0,
    blinkAt: performance.now() + nextBlinkDelay(),
    weights: Object.fromEntries(ALL_EXPRESSIONS.map(k => [k, 0])) as Record<VrmExpression, number>,
    pose: { ...MOOD_POSES.idle } as AvatarPose,
    gaze: new THREE.Vector3(0, 1.4, 2),
    /** Hauteur de l'os de la tête (m), mesurée au chargement. */
    headY: 1.4,
  });

  useFrame((_state, delta) => {
    const vrm = vrmRef.current;
    if (!vrm || !avatarBus.isVisible()) return;
    const a = anim.current;
    const dt = Math.min(delta, 0.1);
    a.t += dt;
    const now = performance.now();
    const mood = avatarBus.mood;

    // Expressions
    let blink = 0;
    if (now >= a.blinkAt) {
      blink = blinkWeight(now - a.blinkAt);
      if (now - a.blinkAt > 150) a.blinkAt = now + nextBlinkDelay();
    }
    const target = combineExpressions(mood, mood === 'sleep' ? {} : lipSync(avatarBus.amp(), a.t), blink);
    const em = vrm.expressionManager;
    for (const k of ALL_EXPRESSIONS) {
      // Le clignement est instantané ; le reste est lissé.
      a.weights[k] = k === 'blink' ? (target[k] ?? 0) : damp(a.weights[k], target[k] ?? 0, 10, dt);
      em?.setValue(k, a.weights[k]);
    }

    // Posture
    const p = MOOD_POSES[mood];
    for (const key of Object.keys(p) as (keyof AvatarPose)[]) a.pose[key] = damp(a.pose[key], p[key], 4, dt);
    const h = vrm.humanoid;
    const breathe = Math.sin(a.t * 1.6);
    const spine = h.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.z = Math.sin(a.t * 0.7) * a.pose.sway;
      spine.rotation.x = breathe * 0.01;
    }
    const head = h.getNormalizedBoneNode('head');
    if (head) {
      head.rotation.x = a.pose.headPitch + breathe * 0.01;
      head.rotation.z = a.pose.headRoll;
    }
    const lUpper = h.getNormalizedBoneNode('leftUpperArm');
    const rUpper = h.getNormalizedBoneNode('rightUpperArm');
    const rLower = h.getNormalizedBoneNode('rightLowerArm');
    if (lUpper) lUpper.rotation.z = -ARM_DOWN + a.pose.armsUp * 0.9;
    if (rUpper) {
      rUpper.rotation.z = ARM_DOWN - a.pose.armsUp * 0.9 - a.pose.rightArmRaise * 0.5;
      rUpper.rotation.y = -a.pose.rightArmRaise * 0.9; // vers l'avant
    }
    if (rLower) rLower.rotation.y = -a.pose.rightArmRaise * 0.3;

    // Regard : suit le curseur (amorti), un peu au-dessus de la caméra.
    const g = avatarBus.gaze;
    a.gaze.x = damp(a.gaze.x, g.x * 0.6, 6, dt);
    a.gaze.y = damp(a.gaze.y, a.headY - g.y * 0.35, 6, dt);
    if (vrm.lookAt) vrm.lookAt.lookAt(a.gaze);

    vrm.update(dt);
  });

  // Seconde passe : dessin dans le rectangle de l'ancre.
  useEffect(() => registerRenderPass((renderer) => {
    const r = avatarBus.anchor;
    if (!vrmRef.current || !r || r.width <= 0 || r.height <= 0) return;
    const canvas = renderer.domElement.getBoundingClientRect();
    const x = r.left - canvas.left;
    const y = canvas.bottom - (r.top + r.height); // origine WebGL en bas
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvas.width, canvas.height);
    renderer.autoClear = prevAutoClear;
  }), [camera, scene]);

  return null;
}
