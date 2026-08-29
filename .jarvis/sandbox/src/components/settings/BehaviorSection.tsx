import { Languages, GitBranch } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext';
import { Section, SectionDivider, Field, ChipGroup, ToggleSwitch, TextInput } from './SettingsPrimitives';
import { LANGUAGES, RESPONSE_STYLES } from './constants';

export function BehaviorSection() {
  const { profile, setField } = useProfile();

  return (
    <Section icon={Languages} title="Comportement" description="Adaptez les réponses à votre façon de travailler">
      <div className="flex flex-col gap-4">
        <Field label="Langue de réponse">
          <ChipGroup options={LANGUAGES} value={profile.language} onChange={v => setField('language', v)} />
        </Field>
        <Field label="Style de réponse">
          <ChipGroup options={RESPONSE_STYLES} value={profile.responseStyle} onChange={v => setField('responseStyle', v)} />
        </Field>

        <SectionDivider label="Raisonnement" />

        <Field label="Raisonnement structuré" hint="Chain of Thought, Tree of Thought, décomposition… Désactivez pour des réponses plus directes et rapides">
          <ToggleSwitch
            value={profile.reasoningEnabled}
            onChange={v => setField('reasoningEnabled', v)}
            label="Raisonnement"
            hint={profile.reasoningEnabled ? 'L\'IA peut réfléchir étape par étape avant de répondre' : 'Raisonnement désactivé — réponses directes uniquement'}
          />
        </Field>

        <Field label="Vocal du raisonnement" hint="Active ou désactive les annonces vocales TTS au début et à la fin du raisonnement structuré">
          <ToggleSwitch
            value={profile.reasoningVoiceEnabled}
            onChange={v => setField('reasoningVoiceEnabled', v)}
            label="Voix raisonnement"
            hint={profile.reasoningVoiceEnabled ? 'Annonces vocales activées pendant le raisonnement' : 'Mode silencieux — texte seul pendant le raisonnement'}
          />
        </Field>
       
        <SectionDivider label="Mode Muet Automatique" />
       
        <Field label="Activer le mode muet automatique" hint="Coupe le micro automatiquement après une période d'inactivité">
          <ToggleSwitch
            value={profile.autoMuteEnabled}
            onChange={v => setField('autoMuteEnabled', v)}
            label="Mode muet auto"
            hint={profile.autoMuteEnabled ? `Micro coupé après ${profile.autoMuteTimeout}s d'inactivité` : 'Désactivé'}
          />
        </Field>
       
        <Field label="Délai avant muet (secondes)" hint="Temps d'inactivité avant de couper le micro (5–300s)">
          <TextInput
            value={String(profile.autoMuteTimeout)}
            onChange={v => setField('autoMuteTimeout', Math.min(300, Math.max(5, parseInt(v) || 40)))}
            placeholder="40"
            type="number"
            min="5"
            max="300"
            style={{ width: '80px' }}
          />
        </Field>
      </div>
    </Section>
  );
}
