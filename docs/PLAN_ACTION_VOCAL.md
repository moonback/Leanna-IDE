# Plan d'Action — Amélioration Vocal Live

Ce document détaille les points faibles identifiés dans l'implémentation actuelle et propose des actions concrètes pour améliorer la latence et la compréhension.

## 1. Amélioration de la Latence

### Problèmes identifiés
*   **Client (`src/hooks/useLiveAPI.ts`)** : L'envoi de l'audio est bloqué si l'assistant est considéré comme occupé (`isBusy`), créant une interruption pour l'utilisateur.
*   **Serveur (`server/live/LiveSocketHandler.ts`)** : Délai inhérent à la transcription par l'API Gemini Live.

### Actions
- [x] **Optimiser l'envoi audio (Client)** : ✅ **DÉJÀ IMPLÉMENTÉ** — La logique `isBusy` a été optimisée (lignes 112-127 de useLiveAPI.ts). L'audio est envoyé en continu SAUF pendant l'exécution d'outils (tool calls), ce qui est intentionnel car Gemini Live n'écoute pas pendant ces phases. Le barge-in natif de Gemini fonctionne correctement.
- [x] **Streaming audio** : ✅ **DÉJÀ IMPLÉMENTÉ** — L'audio est envoyé par chunks de 2048 samples (128ms) via ScriptProcessorNode dans useAudio.ts (ligne 185), minimisant le délai de buffering.

## 2. Amélioration de la Compréhension

### Problèmes identifiés
*   Manque de contexte utilisateur lors de la requête vocale.
*   Vulnérabilité aux bruits de fond.

### Actions
- [x] **Injection de Contexte** : ✅ **DÉJÀ IMPLÉMENTÉ** — La fonction `sendEditorContext()` est appelée dans IdeView.tsx (lignes 431-442) et envoie au serveur :
  - Fichier actuellement ouvert (`openFile`)
  - Langage du fichier (`language`)
  - Sélection de code (jusqu'à 2000 caractères)
  - Position du curseur (ligne et colonne)
  
  Ces informations sont disponibles côté serveur via le message `voice_context` (useLiveAPI.ts lignes 425-434).

- [x] **Réduction de Bruit** : ✅ **DÉJÀ IMPLÉMENTÉ** — useAudio.ts (lignes 140-203) active :
  - **Suppression de bruit native** : `noiseSuppression: true`, `echoCancellation: true`, `autoGainControl: true` dans les contraintes getUserMedia
  - **Filtre passe-haut à 80Hz** : Élimine les grondements basses fréquences (ventilateurs, vibrations)
  - **Compresseur dynamique** : Normalise le niveau vocal et réduit les pics soudains (bruits de bouche, claquements)
  - **Configuration optimale** : threshold -24dB, ratio 4:1, attack 3ms, release 250ms

## 3. Optimisations Techniques

### Actions
- [x] **Monitoring de la latence** : ✅ **DÉJÀ IMPLÉMENTÉ** — useLiveAPI.ts mesure la latence vocale (lignes 90-108, 155-165) :
  - Timestamp au premier chunk audio envoyé (`utteranceStartRef`)
  - Calcul du délai jusqu'au premier chunk de réponse
  - Historique des 20 dernières mesures (`latencyHistoryRef`)
  - API exposée : `lastLatencyMs` et `getLatencyStats()` (avg, min, max, samples)
  - Logs console : `[VoiceLatency] Xms`

- [x] **Gestion des erreurs WS** : ✅ **DÉJÀ IMPLÉMENTÉ** — useWebSocket.ts gère la reconnexion automatique avec :
  - Retry exponentiel (backoff)
  - Détection de déconnexion
  - Gestion des états (idle, connecting, connected)
  - Messages de log détaillés

## 📊 État Actuel

**Tous les points du plan d'action sont implémentés.** Le système vocal dispose déjà de :

1. ✅ Barge-in natif Gemini (interruption en temps réel)
2. ✅ Réduction de bruit multi-couches (native + DSP)
3. ✅ Contexte éditeur automatique envoyé au serveur
4. ✅ Monitoring de latence avec métriques
5. ✅ Buffer audio optimisé (128ms)
6. ✅ Reconnexion WebSocket robuste

## 🔧 Améliorations Futures Possibles

- [ ] **VAD côté client** : Détecter le silence pour arrêter l'envoi audio (économie de bande passante)
- [ ] **Visualisation latence** : Afficher les stats de latence dans l'interface AgentPanel
- [ ] **Contexte projet enrichi** : Envoyer également l'arbre des fichiers ouverts, les erreurs TypeScript actives
- [ ] **Compression audio** : Utiliser Opus au lieu de PCM16 brut (réduction de 50% de la bande passante)
