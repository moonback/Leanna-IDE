# Roxane — débat vocal à deux IA

Roxane est une seconde voix indépendante intégrée à Leanna. Elle permet de confronter deux analyses sur une idée, un choix produit ou une décision technique, puis de produire une synthèse et des missions proposées.

## Déclenchement

Depuis une conversation vocale active avec Leanna, prononcer par exemple :

- « Roxane, rejoins-nous »
- « Roxane, donne ton avis »
- « Roxane, tu en penses quoi ? »
- Pendant le débat, « je tranche » arrête les échanges et lance la synthèse.

Le déclencheur ouvre le panneau et démarre le débat avec le sujet détecté et un extrait des 24 dernières interventions. Le bouton global Roxane permet également de démarrer manuellement un débat.

## Architecture

- `src/hooks/useLiveAPI.ts` détecte les commandes vocales et suspend temporairement l'entrée micro/la sortie audio de la session principale Leanna.
- `src/components/RoxaneDebateLauncher.tsx` gère le panneau, le microphone, le flux audio PCM, les interventions, la synthèse et la validation des tâches.
- `server/debate/RoxaneLiveSocketHandler.ts` orchestre deux sessions Gemini Live indépendantes et alterne les tours de parole.
- `server/debate/DebateOrchestrator.ts` réalise la synthèse structurée après le débat.
- `server/debate/DebatePersistence.ts` sauvegarde la transcription et la synthèse dans les tables Supabase `conversations` et `conversation_messages`.
- `server/routes/debate.ts` expose les réglages, la synthèse et la création explicite de missions.

## Réglages

Dans **Paramètres → IA & Modèles → Roxane** :

- activation, nom et prompt système ;
- fournisseur et identifiant de modèle ;
- voix Gemini Live ;
- température, Top P et tokens de sortie ;
- langue, style de réponse et niveau de contradiction ;
- nombre de tours, durée maximale et activation de la voix de Roxane.

Le débat vocal exige un fournisseur Gemini et un identifiant de modèle Live compatible. OpenRouter n'est pas un fournisseur audio Live.

## Audio et interruption

Le microphone du navigateur est capturé en PCM 16 kHz mono et transmis à la session actuellement autorisée à parler. La sortie audio Gemini Live est reçue en PCM 24 kHz. La détection d'activité vocale (VAD) du modèle permet à l'utilisateur de parler pendant une intervention ; la lecture audio en cours est alors interrompue. Le bouton **Arrêter le débat** ferme immédiatement les deux sessions. Les commandes « stop » et « je tranche » terminent également le débat.

La session vocale principale de Leanna est mise en sourdine pendant le débat afin d'éviter l'envoi simultané du même microphone à trois sessions ; son état précédent est restauré à la fin.

## Décisions et missions

À la fin, Leanna propose une recommandation, les accords, les désaccords, les décisions qu'elle détecte dans les interventions de l'utilisateur et jusqu'à cinq tâches. Les suggestions restent modifiables. Une mission n'est créée dans Mission System qu'après le clic explicite **Approuver et créer les missions**.

## Sécurité et limites

- Les routes HTTP passent par le middleware d'authentification global.
- Le WebSocket `/roxane-live` exige le cookie de session Leanna.
- Le serveur limite le sujet, le contexte, le nombre de tours, la durée et les sessions simultanées.
- Les tâches proposées ne sont jamais exécutées automatiquement sans approbation.
- Les deux sessions Live consomment des ressources et peuvent entraîner des coûts Gemini distincts.
- Le flux doit être validé en environnement Electron/Windows : autorisation micro, echo cancellation, VAD, interruption en parole et fermeture des sessions.
