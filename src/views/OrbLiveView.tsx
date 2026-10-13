import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Mic, MicOff, Power, PhoneOff, Send, Loader2, Radio,
  MonitorUp, MonitorX, Activity, MessageSquare, Captions, CaptionsOff, Keyboard, Smile, Circle, Gauge,
} from 'lucide-react';
import { useLiveAPIContext } from '../context/LiveAPIContext.js';
import { useOrbState } from '../hooks/useOrbState.js';
import { useScreenShare } from '../context/ScreenShareContext.js';
import { useProfile } from '../context/UserProfileContext.js';
import {
  initActivityStore, destroyActivityStore, subscribe,
  getAgentTasks, getToolActivities,
} from '../stores/agentActivityStore.js';
import { useMissionActivity } from './orb/useMissionActivity.js';
import { AudioBars } from './orb/AudioBars.js';
import { Orb } from './orb/Orb.js';
import { Mascot } from './orb/Mascot.js';
import { AmbientBackground } from './orb/AmbientBackground.js';
import { LiveCaption } from './orb/LiveCaption.js';
import { QuickPrompts } from './orb/QuickPrompts.js';
import { LiveDrawer, type LivePanel } from './orb/LiveDrawer.js';
import { HeaderButton, isTypingTarget, readStorage, useMediaQuery, writeStorage } from './orb/liveUi.js';
import { ShortcutsOverlay } from './orb/ShortcutsOverlay.js';
import { CircleButton } from './orb/CircleButton.js';

/**
 * OrbLiveView — Fenêtre « présence vocale » (/orb-live).
 * Session live INDÉPENDANTE de la fenêtre principale.
 *
 * Mise en page :
 *   - Fond d'ambiance animé teinté selon l'état de l'assistant.
 *   - Barre de titre draggable (identité, minuteur, statut, latence, panneaux).
 *   - Scène centrale : mascotte expressive (ou orbe classique), sous-titres en
 *     direct, dock de contrôles flottant.
 *   - Zone de saisie avec suggestions rapides.
 *   - Drawer à onglets (Activité / Conversation) — MASQUÉ PAR DÉFAUT. Panneau
 *     latéral sur grand écran, superposé sur fenêtre étroite.
 *   - Raccourcis clavier (« ? » pour l'aide).
 *
 * Les composants de présentation sont extraits dans ./orb/*.
 */

const PANEL_KEY = 'Leanna_orb_activity_open';
const AVATAR_KEY = 'Leanna_orb_avatar';
const CAPTIONS_KEY = 'Leanna_orb_captions';

type Panel = LivePanel;
type Avatar = 'mascot' | 'orb';

export default function OrbLiveView() {
  const reduceMotion = useReducedMotion() ?? false;
  const { profile } = useProfile();
  const aiName = profile.aiName || 'Leanna';
  const orb = useOrbState();
  const {
    status, connect, disconnect, muted, toggleMute, sendTextMessage,
    transcript, clearTranscript, lastLatencyMs,
  } = useLiveAPIContext();
  const { isSharing, toggleScreenShare } = useScreenShare();
  const wide = useMediaQuery('(min-width: 900px)');
  const inputRef = useRef<HTMLInputElement>(null);

  // Store d'activité : écoute les événements agents/outils de CETTE fenêtre.
  useEffect(() => {
    initActivityStore();
    return () => destroyActivityStore();
  }, []);

  const agentTasks = useSyncExternalStore(subscribe, getAgentTasks, getAgentTasks);
  const toolActivities = useSyncExternalStore(subscribe, getToolActivities, getToolActivities);
  const missions = useMissionActivity();

  const [mode, setMode] = useState<'full' | 'ask'>(() => (readStorage('Leanna_mode') as 'full' | 'ask') || 'full');
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [avatar, setAvatar] = useState<Avatar>(() => (readStorage(AVATAR_KEY) === 'orb' ? 'orb' : 'mascot'));
  const [captions, setCaptions] = useState<boolean>(() => readStorage(CAPTIONS_KEY) !== '0');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Drawer — MASQUÉ PAR DÉFAUT (l'ancienne valeur « 1 » rouvre l'onglet Activité).
  const [panel, setPanel] = useState<Panel | null>(() => {
    const v = readStorage(PANEL_KEY);
    return v === '1' || v === 'activity' ? 'activity' : v === 'conversation' ? 'conversation' : null;
  });
  const openPanel = useCallback((next: Panel | null) => {
    setPanel(prev => {
      const value = prev === next ? null : next;
      writeStorage(PANEL_KEY, value ?? '0');
      return value;
    });
  }, []);

  const toggleAvatar = useCallback(() => {
    setAvatar(prev => {
      const next = prev === 'mascot' ? 'orb' : 'mascot';
      writeStorage(AVATAR_KEY, next);
      return next;
    });