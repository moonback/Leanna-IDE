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

## Passe suivante — interaction vocale en direct

Le mode interactif est maintenant raccordé au transport Notebook Live existant :

- Le bouton « Rejoindre le podcast » ouvre une session micro/WebSocket depuis le lecteur Audio Overview.
- Le serveur reçoit `mode=podcast` et adapte l'instruction système avec les noms et la personnalité du co-animateur.
- Le participant peut parler au micro ou envoyer un message texte ; la transcription est affichée dans le panneau.
- Le RAG du notebook et les citations restent actifs pendant la session.
- La session se ferme lors du changement d'épisode ou à la demande ; la lecture TTS pré-générée est arrêtée avant l'ouverture du micro pour éviter le chevauchement audio.
- Les interruptions vocales sont gérées par le protocole Live existant.

## Limites explicites

- Le mode Live actuel utilise une seule voix Gemini Live. Le co-animateur intervient dans la structure conversationnelle générée, mais ne dispose pas encore d'une deuxième voix TTS indépendante pendant la session temps réel.
- Le flux TTS pré-généré à deux voix reste distinct de la session Live. La reprise automatique à la position exacte du podcast après une intervention n'est pas encore implémentée.
- Les tests et le typecheck doivent être exécutés dans l'environnement local du dépôt avant fusion.
