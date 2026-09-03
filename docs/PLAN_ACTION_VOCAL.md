# Plan d'Action — Amélioration Vocal Live

Ce document détaille les points faibles identifiés dans l'implémentation actuelle et propose des actions concrètes pour améliorer la latence et la compréhension.

## 1. Amélioration de la Latence

### Problèmes identifiés
*   **Client (`src/hooks/useLiveAPI.ts`)** : L'envoi de l'audio est bloqué si l'assistant est considéré comme occupé (`isBusy`), créant une interruption pour l'utilisateur.
*   **Serveur (`server/live/LiveSocketHandler.ts`)** : Délai inhérent à la transcription par l'API Gemini Live.

### Actions
- [ ] **Optimiser l'envoi audio (Client)** : Revoir la logique `isBusy` pour permettre l'envoi en continu, en gérant l'interruption côté serveur si nécessaire (barge-in).
- [ ] **Streaming audio** : S'assurer que l'audio est envoyé par petits "chunks" réguliers pour minimiser le délai de buffering.

## 2. Amélioration de la Compréhension

### Problèmes identifiés
*   Manque de contexte utilisateur lors de la requête vocale.
*   Vulnérabilité aux bruits de fond.

### Actions
- [ ] **Injection de Contexte** : Envoyer au serveur des informations sur le contexte actuel de l'utilisateur (fichier ouvert, sélection de code, etc.) en même temps que le flux audio.
- [ ] **Réduction de Bruit** : Configurer la capture audio côté client pour activer la suppression de bruit si disponible via Web Audio API.

## 3. Optimisations Techniques

### Actions
- [ ] **Monitoring de la latence** : Ajouter des métriques pour mesurer le temps entre l'envoi de l'audio et la réception de la réponse.
- [ ] **Gestion des erreurs WS** : Renforcer la logique de reconnexion du WebSocket pour éviter les coupures.
