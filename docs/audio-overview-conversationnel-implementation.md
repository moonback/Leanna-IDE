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


## Décision validée — deux voix Live réellement distinctes

Le mode conversationnel doit évoluer vers **deux workers Gemini Live indépendants**, un par personnalité. Une seule session Live avec des noms de locuteurs différents ne satisfait pas le besoin : elle ne produit qu'un seul timbre vocal.

### Architecture retenue

- **Worker Leanna** : session Live dédiée, prompt de présentatrice, voix Live A.
- **Worker co-animateur** : seconde session Live indépendante, prompt et personnalité propres, voix Live B.
- **Orchestrateur serveur** : arbitre les tours, transmet le contexte entre les deux sessions et empêche les réponses simultanées ou les boucles de dialogue.
- **Capture audio unique** : le client capture le micro une seule fois ; le serveur route les trames vers le worker qui détient le tour.
- **Sortie audio attribuée** : chaque chunk est associé à un `speakerId`, afin que l'interface affiche le bon locuteur et puisse interrompre précisément le flux courant.

### Cycle de conversation

`waiting_user → leanna_turn → cohost_turn → leanna_turn → waiting_user`

Leanna reçoit le script comme conducteur éditorial et les sources sélectionnées. Elle ouvre et mène le sujet sans lire le script mot à mot. À la fin de son tour, sa transcription est transmise au worker du co-animateur, qui formule une réaction avec sa propre voix. Leanna peut ensuite conclure ou relancer avant de rendre la main à l'utilisateur. Le nombre de tours autonomes est borné.

Une intervention utilisateur interrompt immédiatement le locuteur courant, annule les tours en attente devenus obsolètes et donne la priorité à la parole de l'utilisateur. Les messages texte suivent le même ordonnanceur.

### Contrat WebSocket cible

Le protocole doit transporter des événements typés : `ready`, `speaker_started`, `speaker_finished`, `transcript`, `audio_chunk`, `interrupted`, `busy`, `citations` et `error`. Les événements audio et transcription portent un `speakerId` et un identifiant de tour. Le client conserve une file audio ordonnée et purge les chunks du tour interrompu.

### Réglages et exploitation

Ajouter deux choix de voix indépendants et valider les identifiants contre les voix réellement supportées par le modèle Live. Persister les voix, noms et personnalités dans l'AudioOverview. Chaque session doit être inscrite et retirée individuellement de `activeGeminiSessions`. Si l'une des deux connexions échoue, fermer l'autre et afficher une erreur explicite : ne pas basculer silencieusement vers une voix unique.

Deux sessions augmentent le coût, la consommation et les connexions simultanées. La télémétrie doit distinguer les deux workers. Les outils RAG restent côté serveur, avec le même périmètre de sources et les mêmes protections contre les injections de prompt.

### Étapes de réalisation

1. Contrats de données, persistance rétrocompatible et sélection des deux voix.
2. Orchestrateur serveur à deux sessions, machine à états et gestion des interruptions.
3. Protocole audio/transcription avec attribution des locuteurs.
4. Client audio avec capture unique, file de lecture et affichage des trois rôles.
5. Interface de configuration et de contrôle des deux personnalités.
6. Tests simulés de l'alternance, du barge-in, des erreurs partielles, du nettoyage et de l'absence de boucle.
7. Validation réelle dans Electron : timbres distincts, latence, reprise et coût.

### Critères d'acceptation

- Deux sessions Live indépendantes et deux configurations vocales distinctes.
- Leanna et le co-animateur émettent chacun leur propre audio Live.
- L'utilisateur peut interrompre les deux intervenants à tout moment.
- Le script guide une discussion spontanée au lieu d'être lu ligne par ligne.
- La transcription identifie Leanna, le co-animateur et l'utilisateur.
- Les deux sessions sont nettoyées à la déconnexion et en cas d'échec partiel.

**État : décision d'architecture validée ; double worker non encore implémenté.** Le code courant utilise toujours une session Live et le TTS pré-généré reste un mécanisme distinct.
