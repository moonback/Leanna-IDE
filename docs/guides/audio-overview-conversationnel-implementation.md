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

## Refonte — fichier audio à deux voix (sans Live)

Le mode « Rejoindre le podcast » (Gemini Live) est supprimé. Le podcast est désormais un simple fichier audio :

- Après la génération du script, le client appelle `POST /api/notebooks/:id/audio-overviews/:overviewId/audio` (SSE de progression).
- Le serveur synthétise chaque réplique : Leanna avec `ff_siwis` (la voix de Leanna dans l'app), le co-animateur avec `Puck`.
- Les segments PCM 24 kHz sont assemblés avec 300 ms de silence dans `.Leanna/notebooks/audio/<overviewId>.wav` ; `audioReady` et la durée réelle sont persistés.
- `GET …/audio` sert le fichier (requêtes Range) : lecture, avance, vitesse et téléchargement via le lecteur natif.
- Les anciens podcasts sans fichier affichent un bouton « Générer l'audio ». Supprimer un podcast ou un notebook supprime le `.wav`.
- Si une réplique échoue, aucun fichier n'est écrit : relancer réutilise le cache TTS.

## Limites

- Si Gemini échoue pour `Puck`, `geminiTTS` se replie sur `ff_siwis` : le co-animateur parlerait alors avec la voix de Leanna.
