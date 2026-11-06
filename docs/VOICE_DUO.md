# Duo vocal multi-IA — Gemini Live

## Architecture

La page `/voice-duo` ouvre un WebSocket authentifié sur `/voice-duo-live`. Le serveur crée **deux sessions Gemini Live indépendantes** sur `gemini-3.8-live` :

- **Leanna** : persona principale, voix `aiVoice`.
- **Roxane** : persona critique et complémentaire, voix `duoVoice`.

Chaque session conserve son propre état conversationnel côté Gemini. L'orchestrateur maintient un transcript partagé borné et transmet à chaque IA les interventions récentes de l'utilisateur et de l'autre IA avant de lui donner la parole. Une seule session est autorisée à produire de l'audio vers le client à un instant donné : les sorties ne se chevauchent donc pas.

## Flux audio temps réel

- Micro navigateur → AudioWorklet / pipeline `useAudio` → PCM16 mono 16 kHz → WebSocket.
- Serveur → session Gemini Live du speaker actif via `sendRealtimeInput`.
- Gemini Live → PCM audio 24 kHz → WebSocket binaire → `useAudio.playAudioChunk`.
- Transcriptions d'entrée/sortie → événements JSON étiquetés par speaker → transcript UI.
- Le microphone reste actif pendant la lecture. L’echo cancellation et le VAD réduisent le retour acoustique. Le VAD local déclenche un barge-in immédiat : le client vide sa file audio avant d’envoyer le prochain paquet micro, puis Gemini Live confirme l’interruption avec `interrupted`. L’orchestrateur invalide le tour autonome en cours et donne la priorité à l’utilisateur.

## Mode libre et arbitrage

Après la réponse de l'IA active, l'orchestrateur donne la parole à l'autre session en lui injectant le contexte commun. Les deux sessions peuvent ainsi se répondre, nuancer ou contredire leurs analyses. Le contenu est libre, mais l’audio est arbitré et sérialisé : une seule voix est diffusée à la fois. Les tours autonomes sont limités à quatre par prise de parole utilisateur ; une nouvelle intervention humaine interrompt la chaîne et réinitialise ce budget. Cette borne évite une boucle autonome et des coûts illimités.

## Configuration

Dans **Paramètres → Assistant IA** :
- Nom et voix de Leanna : `aiName`, `aiVoice`.
- Nom et voix de la seconde IA : `duoName`, `duoVoice`.
- Valeurs initiales : Leanna / Aoede et Roxane / Kore.

Les noms et voix sont chargés depuis le profil courant. Les voix doivent appartenir au catalogue Gemini Live accepté par le modèle sélectionné.

## Sécurité et cycle de vie

- WebSocket `/voice-duo-live` authentifié avec le cookie `Leanna_token`, comme `/live` et `/notebook-live`.
- Les deux sessions sont enregistrées dans `activeGeminiSessions` et fermées au disconnect ou au shutdown.
- Le bouton **Réinitialiser** ferme les deux sessions et le prochain démarrage en crée deux nouvelles, ce qui purge aussi le contexte conservé côté Gemini.
- Le serveur limite le transcript à 24 entrées et tronque chaque intervention.
- Les événements de connexion, erreurs, fermeture, durée de session et usage modèle sont journalisés sans exposer les clés API ni les données audio brutes.

## API et compatibilité

- WebSocket temps réel : `/voice-duo-live` (protocole audio binaire PCM16 16 kHz entrant / PCM 24 kHz sortant ; événements JSON `ready`, `speaker`, `transcript`, `interrupted`, `turn_complete`, `session_error`).
- L'ancien endpoint `POST /api/voice-duo/turn` est conservé temporairement pour compatibilité, mais la nouvelle interface ne l'utilise plus.

## Validation

À exécuter dans le dépôt :
- `npm run typecheck`
- `npm test`
- `npm run build`
- Test manuel Chrome/Edge : démarrage des deux sessions, prise de parole de chaque IA, interruption pendant chaque voix, reprise utilisateur, reset, déconnexion et shutdown.
