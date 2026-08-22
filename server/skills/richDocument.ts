/**
 * RichDocument Skill — Création et affichage de documents riches par Leanna
 *
 * Permet à Leanna de créer des documents structurés contenant :
 *   • Tableaux de données
 *   • Graphiques en barres (simples, groupés, empilés)
 *   • Courbes / lignes (line chart, area chart)
 *   • Camemberts / donuts (pie chart)
 *   • Fiches info (card avec champs clé/valeur)
 *   • Listes structurées (ordonnées ou non)
 *   • Blocs de texte libre
 *
 * Le document est transmis au client via `emitIdeAction` de type `open-rich-document`
 * et affiché dans le RichDocumentViewer React.
 */

import { Skill } from "./base";

// ─── Types partagés avec le front (miroir de RichDocumentViewer.tsx) ──────────

type RichBlockType =
  | "table" | "bar_chart" | "line_chart" | "area_chart"
  | "pie_chart" | "card" | "list" | "text";

interface RichBlock {
  type: RichBlockType;
  [key: string]: any;
}

interface RichDocument {
  title: string;
  subtitle?: string;
  createdAt: string;
  blocks: RichBlock[];
}

// ─── Validation des blocs ─────────────────────────────────────────────────────

function validateBlock(block: any, index: number): { ok: boolean; error?: string } {
  if (!block || typeof block !== "object") {
    return { ok: false, error: `Bloc ${index}: doit être un objet` };
  }
  const validTypes: RichBlockType[] = [
    "table", "bar_chart", "line_chart", "area_chart",
    "pie_chart", "card", "list", "text",
  ];
  if (!validTypes.includes(block.type)) {
    return {
      ok: false,
      error: `Bloc ${index}: type "${block.type}" invalide. Types valides: ${validTypes.join(", ")}`,
    };
  }

  switch (block.type as RichBlockType) {
    case "table":
      if (!Array.isArray(block.columns) || block.columns.length === 0)
        return { ok: false, error: `Bloc ${index} (table): "columns" requis (tableau non vide)` };
      if (!Array.isArray(block.rows))
        return { ok: false, error: `Bloc ${index} (table): "rows" requis (tableau de tableaux)` };
      break;

    case "bar_chart":
    case "line_chart":
    case "area_chart":
      if (!Array.isArray(block.data) || block.data.length === 0)
        return { ok: false, error: `Bloc ${index} (${block.type}): "data" requis (tableau non vide avec champ "label")` };
      if (!Array.isArray(block.series) || block.series.length === 0)
        return { ok: false, error: `Bloc ${index} (${block.type}): "series" requis (ex: [{"key":"valeur"}])` };
      break;

    case "pie_chart":
      if (!Array.isArray(block.data) || block.data.length === 0)
        return { ok: false, error: `Bloc ${index} (pie_chart): "data" requis (tableau avec "label" et "value")` };
      break;

    case "card":
      if (!Array.isArray(block.fields) || block.fields.length === 0)
        return { ok: false, error: `Bloc ${index} (card): "fields" requis (tableau avec "label" et "value")` };
      break;

    case "list":
      if (!Array.isArray(block.items) || block.items.length === 0)
        return { ok: false, error: `Bloc ${index} (list): "items" requis (tableau avec "text")` };
      break;

    case "text":
      if (typeof block.content !== "string" || !block.content.trim())
        return { ok: false, error: `Bloc ${index} (text): "content" requis (chaîne non vide)` };
      break;
  }

  return { ok: true };
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export const richDocumentSkill: Skill = {
  name: "richDocument",

  declarations: [
    {
      name: "create_rich_document",
      description: [
        "📊 Crée et affiche immédiatement un document riche interactif dans l'interface.",
        "Utilise cet outil pour présenter des données sous forme de tableaux, graphiques,",
        "courbes, camemberts, fiches ou listes structurées — bien plus lisible qu'un message texte.",
        "",
        "Types de blocs disponibles :",
        "• 'table'       — Tableau avec colonnes et lignes",
        "• 'bar_chart'   — Graphique en barres (groupé ou empilé)",
        "• 'line_chart'  — Courbe / graphique linéaire",
        "• 'area_chart'  — Graphique en aires (empilable)",
        "• 'pie_chart'   — Camembert ou donut",
        "• 'card'        — Fiche avec champs clé/valeur (KPI, stats)",
        "• 'list'        — Liste structurée avec sous-textes et badges",
        "• 'text'        — Bloc de texte libre",
        "",
        "Un document peut combiner plusieurs blocs de types différents (type 'mixed').",
      ].join("\n"),
      parameters: {
        type: "OBJECT",
        properties: {
          title: {
            type: "STRING",
            description: "Titre principal du document (ex: 'Rapport des ventes Q3', 'Analyse des performances').",
          },
          subtitle: {
            type: "STRING",
            description: "Sous-titre optionnel (ex: 'Données du 1er janvier au 30 septembre 2024').",
          },
          blocks: {
            type: "ARRAY",
            description: [
              "Tableau de blocs de contenu. Chaque bloc a un champ 'type' obligatoire.",
              "",
              "Exemples par type :",
              "",
              "TABLE:",
              '  { "type":"table", "title":"Ventes", "columns":["Produit","Q1","Q2"], "rows":[["Alpha",120,145],["Beta",89,110]] }',
              "",
              "BAR_CHART:",
              '  { "type":"bar_chart", "title":"CA mensuel", "data":[{"label":"Jan","ca":1200},{"label":"Fév","ca":1450}], "series":[{"key":"ca","label":"Chiffre d\'affaires","color":"#6366f1"}] }',
              "",
              "LINE_CHART (smooth):",
              '  { "type":"line_chart", "title":"Évolution", "smooth":true, "data":[{"label":"S1","users":200},{"label":"S2","users":340}], "series":[{"key":"users","label":"Utilisateurs"}] }',
              "",
              "AREA_CHART:",
              '  { "type":"area_chart", "title":"Traffic", "data":[{"label":"Lun","visits":500},{"label":"Mar","visits":620}], "series":[{"key":"visits","color":"#22d3ee"}] }',
              "",
              "PIE_CHART (donut):",
              '  { "type":"pie_chart", "title":"Parts de marché", "donut":true, "data":[{"label":"Produit A","value":45},{"label":"Produit B","value":30},{"label":"Autres","value":25}] }',
              "",
              "CARD (fiche KPI):",
              '  { "type":"card", "title":"Indicateurs clés", "badge":{"text":"✓ Objectif atteint","color":"#34d399"}, "fields":[{"label":"CA Total","value":"124 500 €","highlight":true},{"label":"Clients","value":"1 247"}] }',
              "",
              "LIST:",
              '  { "type":"list", "title":"Actions prioritaires", "ordered":true, "items":[{"text":"Optimiser les coûts","sub":"Réduction estimée: 15%","badge":"Urgent"},{"text":"Former l\'équipe"}] }',
              "",
              "TEXT:",
              '  { "type":"text", "title":"Contexte", "content":"Ce rapport couvre la période..." }',
            ].join("\n"),
            items: { type: "OBJECT" },
          },
        },
        required: ["title", "blocks"],
      },
    },
  ],

  handleToolCall: async (name: string, args: any, context?: any) => {
    if (name !== "create_rich_document") {
      return { error: `Outil inconnu: ${name}` };
    }

    // ── Validation de base ────────────────────────────────────────────────────
    const title = String(args.title || "").trim();
    if (!title) {
      return { error: "Le champ 'title' est requis." };
    }

    const blocks: RichBlock[] = Array.isArray(args.blocks) ? args.blocks : [];
    if (blocks.length === 0) {
      return { error: "Le document doit contenir au moins un bloc dans 'blocks'." };
    }

    // Valider chaque bloc
    const blockErrors: string[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const result = validateBlock(blocks[i], i);
      if (!result.ok && result.error) blockErrors.push(result.error);
    }
    if (blockErrors.length > 0) {
      return {
        error: `Erreurs de validation dans les blocs :\n${blockErrors.join("\n")}`,
        hint: "Corrige les blocs indiqués et réessaie.",
      };
    }

    // ── Construction du document ──────────────────────────────────────────────
    const doc: RichDocument = {
      title,
      subtitle: args.subtitle ? String(args.subtitle).trim() : undefined,
      createdAt: new Date().toISOString(),
      blocks,
    };

    // ── Émission vers le client via ide-action ────────────────────────────────
    if (context?.emitIdeAction) {
      context.emitIdeAction({
        type: "open-rich-document",
        document: doc,
      });
      console.log(
        `[RichDocument] Document émis: "${title}" (${blocks.length} bloc(s): ${blocks.map((b) => b.type).join(", ")})`
      );
    } else {
      console.warn("[RichDocument] emitIdeAction non disponible — document non affiché.");
    }

    return {
      status: "success",
      title,
      blocks_count: blocks.length,
      block_types: blocks.map((b) => b.type),
      message: `Document "${title}" créé avec ${blocks.length} bloc(s) et affiché dans l'interface.`,
    };
  },
};
