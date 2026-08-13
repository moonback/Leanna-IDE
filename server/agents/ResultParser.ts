/**
 * ResultParser — Stub de compatibilité
 * 
 * Extrait le résumé, les suggestions et normalise la sortie des agents.
 * Ce fichier existe uniquement pour que AgentExecutor.ts continue à fonctionner.
 */

export class ResultParser {
  /**
   * Normalise le résultat brut de reasoning_think en texte exploitable.
   */
  normalizeResult(thinkResult: any): string {
    if (!thinkResult) return "";
    if (typeof thinkResult === "string") return thinkResult;
    // reasoning_think retourne { thought, answer, reasoning }
    return thinkResult.answer || thinkResult.reasoning || thinkResult.thought || JSON.stringify(thinkResult);
  }

  /**
   * Extrait un résumé court de la sortie de l'agent.
   */
  extractSummary(text: string): string {
    // Chercher ## Résumé
    const summaryMatch = text.match(/## Résumé\n([\s\S]*?)(?=\n##|$)/);
    if (summaryMatch) {
      return summaryMatch[1].trim().slice(0, 500);
    }
    // Fallback: premiers paragraphes non vides
    const lines = text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    return lines.slice(0, 3).join(" ").slice(0, 500);
  }

  /**
   * Extrait les suggestions/recommandations de la sortie.
   */
  extractSuggestions(text: string): string[] | undefined {
    const sugMatch = text.match(/## Recommandations([\s\S]*?)(?=\n##|$)/);
    if (!sugMatch) return undefined;

    const lines = sugMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    return lines.length > 0 ? lines : undefined;
  }
}
