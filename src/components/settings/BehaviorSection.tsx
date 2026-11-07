import { AnimatePresence, motion } from 'motion/react';
import { Languages } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext.js';
import { Section, SectionDivider, Field, ChipGroup, ToggleSwitch, RangeSlider } from './SettingsPrimitives.js';
import { LANGUAGES, RESPONSE_STYLES } from './constants.js';

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

        <SectionDivider label="Présence vocale" />

        <Field
          label="Présence vocale continue"
          hint="Ouvre la session vocale au démarrage et la rétablit automatiquement si elle se ferme. Leanna reste à l'écoute et peut parler d'elle-même."
        >
          <ToggleSwitch
            value={profile.voiceAlwaysOn}
            onChange={v => setField('voiceAlwaysOn', v)}
            label="Toujours active"
            hint={profile.voiceAlwaysOn ? 'La session vocale se connecte et se maintient seule' : 'Connexion vocale manuelle'}
          />
        </Field>

        <SectionDivider label="Veille automatique" />
       
        <Field label="Activer la veille automatique" hint="Leanna se met en veille après une période sans activité (la session reste ouverte)">
          <ToggleSwitch
            value={profile.autoMuteEnabled}
            onChange={v => setField('autoMuteEnabled', v)}
            label="Veille auto"
            hint={profile.autoMuteEnabled ? `En veille après ${profile.autoMuteTimeout}s d'inactivité` : 'Désactivé'}
          />
        </Field>
       
        <AnimatePresence initial={false}>
          {profile.autoMuteEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
            >
              <Field label="Délai avant veille" hint="Temps sans activité avant la mise en veille (5–300s)">
                <RangeSlider
                  value={profile.autoMuteTimeout}
                  onChange={v => setField('autoMuteTimeout', v)}
                  min={5}
                  max={300}
                  step={5}
                  format={v => `${v} s`}
                />
              </Field>
              <Field label="Réveil par le nom" hint="En veille, dire « Leanna » la réveille (reconnaissance locale, hors ligne)">
                <ToggleSwitch
                  value={profile.wakeWordEnabled}
                  onChange={v => setField('wakeWordEnabled', v)}
                  label="Réveil vocal"
                  hint={profile.wakeWordEnabled ? 'Dites « Leanna »' : 'Réveil par clic uniquement'}
                />
              </Field>
              <AnimatePresence initial={false}>
                {profile.wakeWordEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                    className="flex flex-col gap-4"
                  >
                    <Field
                      label="Certitude requise"
                      hint="Plus haut = moins de réveils intempestifs en conversation, mais il faut bien articuler « Leanna »"
                    >
                      <RangeSlider
                        value={Math.round(profile.wakeMinConfidence * 100)}
                        onChange={v => setField('wakeMinConfidence', v / 100)}
                        min={50}
                        max={99}
                        step={1}
                        format={v => `${v} %`}
                      />
                    </Field>
                    <Field
                      label="Durée minimale du nom"
                      hint="Ignore les mots trop brefs (« là », « Léa ») confondus avec « Leanna » (100–800 ms)"
                    >
                      <RangeSlider
                        value={profile.wakeMinDurationMs}
                        onChange={v => setField('wakeMinDurationMs', v)}
                        min={100}
                        max={800}
                        step={25}
                        format={v => `${v} ms`}
                      />
                    </Field>
                    <Field
                      label="Position du nom dans la phrase"
                      hint="Le nom doit être parmi les premiers mots, comme quand on interpelle quelqu'un"
                    >
                      <RangeSlider
                        value={profile.wakeMaxWordIndex}
                        onChange={v => setField('wakeMaxWordIndex', v)}
                        min={0}
                        max={3}
                        step={1}
                        format={v => (v === 0 ? '1er mot' : `${v + 1} premiers mots`)}
                      />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <SectionDivider label="Détecteur d'Activité Vocale (VAD)" />

        <Field label="Activer la détection de voix" hint="Économise la bande passante en ne transmettant que la voix">
          <ToggleSwitch
            value={profile.vadEnabled}
            onChange={v => setField('vadEnabled', v)}
            label="VAD"
            hint={profile.vadEnabled ? 'Transmet uniquement pendant la parole' : 'Transmet en continu'}
          />
        </Field>

        <AnimatePresence initial={false}>
          {profile.vadEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: 'hidden' }}
              className="flex flex-col gap-4"
            >
              <Field label="Seuil d'activation de la voix" hint="Sensibilité minimale pour détecter la voix humaine (0–100)">
                <RangeSlider
                  value={profile.vadThreshold}
                  onChange={v => setField('vadThreshold', v)}
                  min={0}
                  max={100}
                  step={1}
                />
              </Field>

              <Field label="Durée de silence avant coupure" hint="Temps de silence avant d'arrêter la transmission (300–2000 ms)">
                <RangeSlider
                  value={profile.vadSilenceDuration}
                  onChange={v => setField('vadSilenceDuration', v)}
                  min={300}
                  max={2000}
                  step={50}
                  format={v => `${v} ms`}
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
        <SectionDivider label="Interface de Chat" />

        <Field label="Suggestions proactives" hint="Affiche au-dessus du champ des amorces au démarrage, puis les prochaines étapes déduites du contexte (corriger une erreur, vérifier les fichiers modifiés, répondre à une question de l'assistante…)">
          <ToggleSwitch
            value={profile.showChatSuggestions}
            onChange={v => setField('showChatSuggestions', v)}
            label="Suggestions proactives"
            hint={profile.showChatSuggestions ? 'Amorces au démarrage, puis prochaines étapes proposées selon le contexte' : 'Suggestions masquées'}
          />
        </Field>
      </div>
    </Section>
  );
}