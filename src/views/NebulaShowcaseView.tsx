/**
 * NebulaShowcaseView — vitrine interne du design system v3 (route /dev/ui).
 *
 * Montre toutes les primitives Nebula dans le thème courant, avec des
 * raccourcis pour basculer thème et flag uiV3. Hors navigation : sert aux
 * revues de design et aux snapshots visuels (phase 8). Les valeurs affichées
 * sont des exemples statiques, pas des données réelles.
 */
import { useState } from 'react';
import { Palette, Search, ListChecks, Play, ShieldCheck, Wrench } from 'lucide-react';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { Button } from '../components/ui/Button.js';
import { GlowCard } from '../components/ui/GlowCard.js';
import { RingGauge } from '../components/ui/RingGauge.js';
import { ProgressBeam } from '../components/ui/ProgressBeam.js';
import { AgentChip, type AgentChipStatus } from '../components/ui/AgentChip.js';
import { HoloButton } from '../components/ui/HoloButton.js';
import { agentColor } from '../components/ui/agentColors.js';
import { useFeatureFlag, setFeatureFlag } from '../config/featureFlags.js';
import { useProfile } from '../context/UserProfileContext.js';
import { AvatarStage } from '../scene/avatar/AvatarStage.js';
import { AVATAR_MOODS, type AvatarMood } from '../scene/avatar/avatarStateMachine.js';
import { useAvatarLoadStatus, avatarBus } from '../scene/avatar/avatarBus.js';

const THEMES = ['dark', 'light', 'cyberpunk', 'sepia', 'high-contrast'] as const;

const SAMPLE_AGENTS: { role: string; label: string; status: AgentChipStatus }[] = [
  { role: 'architect', label: 'Architecte', status: 'active' },
  { role: 'coder', label: 'Développeur', status: 'active' },
  { role: 'tester', label: 'Testeur', status: 'running' },
  { role: 'performance', label: 'Optimiseur', status: 'active' },
  { role: 'security', label: 'Sécuritaire', status: 'idle' },
  { role: 'writer', label: 'Rédacteur', status: 'error' },
];

const PODS = [
  { label: 'Analyser', icon: Search, color: 'var(--nb-blue)' },
  { label: 'Planifier', icon: ListChecks, color: 'var(--nb-violet)' },
  { label: 'Exécuter', icon: Play, color: 'var(--nb-cyan)' },
  { label: 'Vérifier', icon: ShieldCheck, color: 'var(--nb-amber)' },
  { label: 'Corriger', icon: Wrench, color: 'var(--nb-magenta)' },
];

const SWATCHES = ['violet', 'magenta', 'cyan', 'green', 'amber', 'pink', 'blue'];

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="nb-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{heading}</h2>
      {children}
    </section>
  );
}

export default function NebulaShowcaseView() {
  const uiV3 = useFeatureFlag('uiV3');
  const { profile, setField } = useProfile();
  const [pressedPod, setPressedPod] = useState('Exécuter');
  const [selectedCard, setSelectedCard] = useState(1);
  const [mood, setMood] = useState<AvatarMood | 'auto'>('auto');
  const avatarStatus = useAvatarLoadStatus();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewHeader
        title="Nebula — design system v3"
        icon={Palette}
        description="Vitrine interne des primitives de la refonte Cockpit"
        badge={uiV3 ? 'uiV3 actif' : 'interface classique'}
        actions={
          <Button size="sm" variant={uiV3 ? 'secondary' : 'primary'} onClick={() => setFeatureFlag('uiV3', !uiV3)}>
            {uiV3 ? 'Désactiver uiV3' : 'Activer uiV3'}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-6 lg:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <Section heading="Thème">
            <div role="radiogroup" aria-label="Thème" className="flex flex-wrap gap-2">
              {THEMES.map(t => (
                <Button
                  key={t}
                  size="sm"
                  role="radio"
                  aria-checked={profile.theme === t}
                  variant={profile.theme === t ? 'primary' : 'secondary'}
                  onClick={() => setField('theme', t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </Section>

          <Section heading="Palette">
            <div className="flex flex-wrap gap-3">
              {SWATCHES.map(s => (
                <div key={s} className="flex flex-col items-center gap-1">
                  <span
                    className="nb-glow-md h-12 w-12 rounded-full"
                    style={{ background: `var(--nb-${s})`, '--nb-glow-color': `var(--nb-${s})` } as React.CSSProperties}
                    aria-hidden="true"
                  />
                  <code className="text-xs" style={{ color: 'var(--text-muted)' }}>--nb-{s}</code>
                </div>
              ))}
            </div>
            <p className="nb-display nb-gradient-text text-2xl font-bold">Je suis Leanna, prête à accomplir tes missions.</p>
          </Section>

          <Section heading="Verre">
            <div className="grid gap-4 sm:grid-cols-3">
              {([1, 2, 3] as const).map(level => (
                <div key={level} className={`nb-glass-${level} p-4`}>
                  <p className="nb-display font-semibold" style={{ color: 'var(--nb-text)' }}>glass {level}</p>
                  <p className="text-sm" style={{ color: 'var(--nb-text-soft)' }}>
                    {level === 1 ? 'Panneaux' : level === 2 ? 'Cartes' : 'Popovers'}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section heading="HoloButton : pods d'action">
            <div className="flex flex-wrap gap-3">
              {PODS.map(({ label, icon: Icon, color }) => (
                <HoloButton
                  key={label}
                  size="lg"
                  color={color}
                  icon={<Icon className="h-5 w-5" />}
                  pressed={pressedPod === label}
                  onClick={() => setPressedPod(label)}
                >
                  {label}
                </HoloButton>
              ))}
              <HoloButton disabled>Désactivé</HoloButton>
            </div>
          </Section>

          <Section heading="AgentChip">
            <div className="flex flex-wrap gap-2">
              {SAMPLE_AGENTS.map(a => <AgentChip key={a.role} agentRole={a.role} label={a.label} status={a.status} />)}
            </div>
          </Section>

          <Section heading="GlowCard">
            <div className="grid gap-4 sm:grid-cols-3">
              {SAMPLE_AGENTS.slice(0, 3).map((a, i) => (
                <GlowCard
                  key={a.role}
                  color={agentColor(a.role)}
                  active={selectedCard === i}
                  onClick={() => setSelectedCard(i)}
                  aria-pressed={selectedCard === i}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="nb-display font-semibold">{a.label}</span>
                    <AgentChip agentRole={a.role} label={a.status === 'running' ? 'En cours' : 'Actif'} status={a.status} />
                  </div>
                  <p className="mt-2 text-sm" style={{ color: 'var(--nb-text-soft)' }}>Carte interactive : cliquer ou Entrée.</p>
                </GlowCard>
              ))}
            </div>
          </Section>

          <Section heading="ProgressBeam">
            <GlowCard glass={1} className="flex flex-col gap-4">
              <ProgressBeam label="Refonte interface" value={78} running color="var(--nb-green)" />
              <ProgressBeam label="Correction des bugs" value={45} running color="var(--nb-amber)" />
              <ProgressBeam label="Optimisation tokens" value={30} color="var(--nb-cyan)" />
              <ProgressBeam label="Audit sécurité" value={12} color="var(--nb-magenta)" />
            </GlowCard>
          </Section>

          <Section heading="Avatar Leanna">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Modèle : {avatarStatus === 'ready' ? 'VRM chargé (rendu WebGL)' : avatarStatus === 'loading' ? 'chargement…' : avatarStatus === 'missing' ? 'absent, mascotte 2D affichée (voir public/avatar/LISEZMOI.txt)' : avatarStatus === 'error' ? `erreur : ${avatarBus.loadError}` : 'en attente de la scène 3D (mascotte 2D)'}
            </p>
            <div role="radiogroup" aria-label="Humeur de l'avatar" className="flex flex-wrap gap-2">
              {(['auto', ...AVATAR_MOODS] as const).map(m => (
                <Button
                  key={m}
                  size="xs"
                  role="radio"
                  aria-checked={mood === m}
                  variant={mood === m ? 'primary' : 'secondary'}
                  onClick={() => setMood(m)}
                >
                  {m === 'auto' ? 'auto (réel)' : m}
                </Button>
              ))}
            </div>
            <div className="flex justify-center">
              <AvatarStage height={420} moodOverride={mood === 'auto' ? undefined : mood} />
            </div>
          </Section>

          <Section heading="RingGauge">
            <GlowCard glass={1} className="flex flex-wrap items-center justify-around gap-6">
              <RingGauge label="CPU" value={12} color="var(--nb-green)" />
              <RingGauge label="RAM" value={48} color="var(--nb-cyan)" />
              <RingGauge label="Tokens" value={32} color="var(--nb-magenta)" />
              <RingGauge label="Disque" value={1.2} max={4} display="1,2 Go" size={110} color="var(--nb-violet)" />
            </GlowCard>
          </Section>
        </div>
      </div>
    </div>
  );
}
