# Audio Overview conversationnel — implémentation

## Objectif

Faire évoluer l'Audio Overview vers un podcast à deux personnalités, avec Leanna comme présentatrice principale et un co-animateur configurable.

## Livré dans cette passe

- Configuration du nom de la présentatrice (Leanna par défaut).
- Configuration du nom du co-animateur (Noah par défaut).
- Champ de personnalité libre pour définir son rôle, son tempérament et son angle d'analyse.
- Injection des deux identités et de leurs comportements dans le prompt de génération.
- Consigne explicite de produire un véritable échange : questions, relances, réactions, nuances et transitions, plutôt que deux monologues juxtaposés.
- Persistance des noms et de la personnalité dans chaque AudioOverview.
- Routage TTS vers deux voix distinctes ; les paramètres historiques alexVoice/samVoice restent acceptés.
- Affichage des bulles et export Markdown avec les noms configurés.
- Compatibilité descendante : les anciens scripts Alex/Sam et les AudioOverview sans métadonnées conservent leurs valeurs de repli.
- Refus de deux noms identiques et nettoyage des préfixes pour préserver le format de dialogue.

## Fichiers concernés

- `server/notebooks/types.ts`
- `server/notebooks/ContentGenerator.ts`
- `server/routes/notebooks/audioRouter.ts`
- `src/components/notebooks/audio/types.ts`
- `src/components/notebooks/audio/AudioGenerator.tsx`
- `src/components/notebooks/audio/AudioPlayer.tsx`
- `src/components/notebooks/AudioOverviewPanel.tsx`

## Vérifications à effectuer localement

Depuis la racine du dépôt :

```bash
npm run typecheck
npm run lint:eslint:notebooks
npm run test
npm run test:ui
```

Puis générer un podcast de test avec les identités « Leanna » et « Noah », écouter les deux voix, exporter le script et rouvrir un ancien podcast Alex/Sam.

## Limite connue / étape suivante

Cette passe livre le podcast préparé à deux voix et sa lecture TTS. Elle ne livre pas encore le mode où l'utilisateur interrompt le podcast à la voix et dialogue en direct avec les deux personnalités. Cette fonction doit être raccordée séparément au transport live Notebook existant (session, interruption, reprise de lecture, tour de parole et état de session), sans mélanger le flux TTS pré-généré avec la session temps réel.
