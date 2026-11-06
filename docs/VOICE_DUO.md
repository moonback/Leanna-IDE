# Duo vocal multi-IA

## Fonctionnement

La page `/voice-duo` propose une conversation vocale entre l'assistant principal et une seconde IA configurable (nom et voix). Le navigateur capture la parole avec Web Speech API, puis appelle `POST /api/voice-duo/turn`. Le serveur génère un échange alterné et synthétise chaque intervention en PCM 24 kHz mono. Le client lit les segments dans l'ordre et conserve un historique court partagé.

## Configuration

Dans **Paramètres → Assistant IA** :
- Nom et voix de Leanna : configuration existante.
- Nom et voix de la seconde IA : `duoName` et `duoVoice`.
- Valeurs par défaut : Roxane / Kore.

Les deux champs sont stockés dans le profil local et synchronisés avec `/api/profile`.

## Limites et sécurité

- Les échanges autonomes sont bornés à quatre interventions par prise de parole utilisateur. Cela évite une boucle infinie et borne les coûts LLM/TTS.
- Le microphone utilise la reconnaissance vocale native du navigateur (Chrome/Edge recommandés). Sa disponibilité et sa qualité dépendent du navigateur et de ses autorisations.
- L'audio généré est PCM 24 kHz ; si le TTS échoue, le client utilise SpeechSynthesis comme solution de secours.
- Les requêtes passent par l'authentification API existante. Les prompts et historiques sont bornés en taille.
- L'interruption arrête la lecture en cours ; le contrôle **Terminer** coupe la reconnaissance vocale et la lecture.
- La page n'utilise pas une seconde session Gemini Live persistante : les tours sont générés par appels texte puis TTS. Le mode libre est donc un dialogue alterné borné, et non deux flux audio simultanés.

## API

`POST /api/voice-duo/turn`

```json
{
  "message": "Que penses-tu de cette idée ?",
  "history": [],
  "maxTurns": 4,
  "includeAudio": true,
  "language": "fr"
}
```

Chaque message retourné contient `speaker`, `name`, `text` et `audio` (base64 PCM, éventuellement null si le TTS est indisponible).
