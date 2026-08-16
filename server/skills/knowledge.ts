import { Skill, validateArgs } from "./base";
import { z } from "zod";
import path from "path";
import {
  understandingEngine,
  semanticSearch,
  projectMemory,
  impactAnalyzer,
  knowledgeGraph,
} from "../knowledge";
import type { ContextStrategy, ContextDetailLevel } from "../knowledge/UnderstandingEngine";
import type { ImpactMode, RiskLevel } from "../knowledge/ImpactAnalyzer";
import type { ProjectKnowledgeCategory } from "../knowledge/types";

const CATEGORY_VALUES: ProjectKnowledgeCategory[] = [
  "architecture",
  "convention",
  "pattern",
  "decision",
  "known-bug",
  "api",
  "module",
  "workflow",
  "security",
  "stack",
  "refactoring",
  "todo",
  "document",
  "style-guide",
  "glossary",
  "template",
  "editorial",
  "structure",
];

const STRATEGY_VALUES: ContextStrategy[] = [
  "balanced",
  "document_first",
  "memory_first",
  "links_first",
  "code_first",
  "graph_first",
  "minimal",
];

const DETAIL_VALUES: ContextDetailLevel[] = ["compact", "standard", "verbose"];

const IMPACT_MODES: ImpactMode[] = ["quick", "standard", "deep", "reverse"];

export const knowledgeSkill: Skill = {
  name: "knowledge",
  declarations: [
    {
      name: "knowledge_build_context",
      description:
        "🔎 Outil PRINCIPAL de compréhension des documents et du projet. Combine en un appel : recherche sémantique, mémoire projet, graphe de liens documentaires, score de compréhension et recommandations. " +
        "À utiliser en début de mission (≥ 2 fichiers ou documentation inconnue). " +
        "Retourne un ContextBatch réutilisable pour toutes les sous-tâches — ne pas rappeler pour chaque fichier.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description:
              "La requête / tâche / objectif pour lequel tu as besoin de contexte (ex: 'Rédiger le cahier des charges', 'Revoir l'orthographe du rapport').",
          },
          strategy: {
            type: "STRING",
            description:
              "Stratégie de collecte : 'balanced' (défaut) = documents + faits + liens ; " +
              "'document_first' = priorise documents/sections ; 'memory_first' = priorise décisions/style ; " +
              "'links_first' = priorise liens/références ; 'minimal' = ultra-condensé.",
            enum: STRATEGY_VALUES,
          },
          detail: {
            type: "STRING",
            description:
              "Niveau de détail du contexte retourné : 'compact' (résumé), 'standard' (défaut), 'verbose' (complet).",
            enum: DETAIL_VALUES,
          },
          max_files: {
            type: "NUMBER",
            description: "Nombre max de fichiers pertinents à retourner (défaut: 15, max: 30).",
          },
          max_facts: {
            type: "NUMBER",
            description: "Nombre max de faits mémoire projet à retourner (défaut: 10, max: 30).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "knowledge_semantic_search",
      description:
        "🔍 Recherche sémantique dans les documents du projet : combine titres de sections, métadonnées et contenu textuel (TF-IDF). " +
        "Plus efficace que search_in_files pour un concept dont tu ignores les mots exacts. " +
        "Lance en parallèle avec knowledge_search_entities si les deux sont pertinents.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Terme ou concept à rechercher (ex: 'guide de style', 'spécifications techniques').",
          },
          max_results: {
            type: "NUMBER",
            description: "Nombre max de résultats (défaut: 10, max: 30).",
          },
          min_score: {
            type: "NUMBER",
            description: "Score minimum de pertinence 0-1 (défaut: 0.1). Augmenter pour plus de précision.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "knowledge_search_entities",
      description:
        "🔎 Recherche des ENTITÉS DOCUMENTAIRES (sections H1-H6, métadonnées YAML, todos, alertes, blocs de code...) " +
        "dans le graphe de connaissance. Utilise ceci plutôt que knowledge_semantic_search quand tu cherches " +
        "une section ou un titre spécifique dans les documents.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Nom ou partie du nom de l'entité recherchée.",
          },
          type_filter: {
            type: "STRING",
            description:
              "Filtrer par type d'entité. Valeurs possibles : class, function, interface, enum, type, constant, variable, component, method, import, export.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "knowledge_memory_search",
      description:
        "🧠 Recherche dans la MÉMOIRE PROJET locale. Cette mémoire stocke les faits spécifiques AU PROJET : " +
        "architecture, conventions de nommage, décisions techniques, bugs connus, patterns, signatures API, " +
        "workflows, sécurité. Ce n'est PAS la mémoire utilisateur (save_memory / search_memory).",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Terme à chercher dans les faits projet.",
          },
          category: {
            type: "STRING",
            description:
              "Filtrer par catégorie : architecture, convention, pattern, decision, known-bug, api, module, workflow, security, stack, refactoring, todo.",
            enum: CATEGORY_VALUES,
          },
          max_results: {
            type: "NUMBER",
            description: "Nombre max de résultats (défaut: 10, max: 50).",
          },
        },
        required: [],
      },
    },
    {
      name: "knowledge_memory_add",
      description:
        "📝 Ajoute un FAIT dans la MÉMOIRE PROJET locale (ProjectMemory.json). " +
        "Utilise ceci quand tu apprends quelque chose de durable sur le projet : une convention à respecter, " +
        "une décision d'architecture, un bug/workaround connu, un pattern de code récurrent. " +
        "Ces faits seront automatiquement réinjectés aux prochaines sessions via knowledge_build_context.",
      parameters: {
        type: "OBJECT",
        properties: {
          content: {
            type: "STRING",
            description: "Le fait à enregistrer. Sois précis, concis et actionnable (1-3 phrases).",
          },
          category: {
            type: "STRING",
            description:
              "Catégorie du fait : architecture, convention, pattern, decision, known-bug, api, module, workflow, security, stack, refactoring, todo.",
            enum: CATEGORY_VALUES,
          },
          tags: {
            type: "ARRAY",
            description: "Tags complémentaires pour faciliter la recherche ultérieure.",
            items: { type: "STRING" },
          },
          confidence: {
            type: "NUMBER",
            description: "Niveau de confiance en ce fait 0-1 (1 = certain, défaut: 0.85).",
          },
          source_file: {
            type: "STRING",
            description: "Chemin du fichier source qui a inspiré ce fait (optionnel).",
          },
        },
        required: ["content", "category"],
      },
    },
    {
      name: "knowledge_memory_list",
      description:
        "📋 Liste les faits de la mémoire projet, avec filtrage optionnel par catégorie. " +
        "Utile pour auditer l'état de la connaissance ou faire le ménage.",
      parameters: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            description:
              "Filtrer par catégorie. Valeurs : architecture, convention, pattern, decision, known-bug, api, module, workflow, security, stack, refactoring, todo.",
            enum: CATEGORY_VALUES,
          },
          limit: {
            type: "NUMBER",
            description: "Nombre max de faits à retourner (défaut: 50, max: 200).",
          },
        },
        required: [],
      },
    },
    {
      name: "knowledge_impact_analyze",
      description:
        "⚠️ Analyse D'IMPACT d'une modification avant de l'effectuer. Identifie : fichiers dépendants, " +
        "modules critiques, chaînes d'impact, risques associés, recommandations de tests et ordre de validation. " +
        "À UTILISER OBLIGATOIREMENT avant toute modification non triviale (≥ 2 fichiers) ou touchant " +
        "à un module central.",
      parameters: {
        type: "OBJECT",
        properties: {
          files: {
            type: "ARRAY",
            description: "Chemin(s) de(s) fichier(s) que tu envisages de modifier.",
            items: { type: "STRING" },
          },
          mode: {
            type: "STRING",
            description:
              "Profondeur d'analyse : 'quick' (rapide ~1 fichier), 'standard' (défaut), 'deep' (exhaustif lent), 'reverse' (quels fichiers affecteraient ce fichier).",
            enum: IMPACT_MODES,
          },
          min_score: {
            type: "NUMBER",
            description:
              "Seuil minimal de score 0-100 pour inclure un fichier impacté (quick:5, standard:1, deep:0). " +
              "Plus bas = plus de fichiers listés.",
          },
          include_tests: {
            type: "BOOLEAN",
            description: "Inclure les fichiers de test dans l'analyse (défaut: false).",
          },
        },
        required: ["files"],
      },
    },
    {
      name: "knowledge_status",
      description:
        "📊 Retourne l'état de santé du Knowledge System : nombre de fichiers indexés, entités, " +
        "cycles de dépendances, faits mémorisés, fraîcheur de l'index, warnings. Utile pour " +
        "diagnostiquer si le graphe est à jour avant une recherche.",
      parameters: {
        type: "OBJECT",
        properties: {
          include_warnings: {
            type: "BOOLEAN",
            description: "Inclure la liste des warnings (défaut: true).",
          },
        },
        required: [],
      },
    },
    {
      name: "knowledge_reindex",
      description:
        "🔄 Force une ré-indexation COMPLÈTE du projet par ProjectIndexer. Tous les fichiers sont rescannés, " +
        "le KnowledgeGraph est reconstruit. Lent (~1-10s selon taille projet) mais nécessaire si " +
        "l'index est obsolète ou que knowledge_status signale des warnings.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: [],
      },
    },
  ],
  inputSchemas: {
    knowledge_build_context: z.object({
      query: z.string().min(1, "La requête ne peut être vide").trim(),
      strategy: z.enum(STRATEGY_VALUES as [string, ...string[]]).optional().default("balanced"),
      detail: z.enum(DETAIL_VALUES as [string, ...string[]]).optional().default("standard"),
      max_files: z.number().int().positive().max(30).optional().default(6),
      max_facts: z.number().int().positive().max(30).optional().default(7),
    }),
    knowledge_semantic_search: z.object({
      query: z.string().min(1, "La requête ne peut être vide").trim(),
      max_results: z.number().int().positive().max(30).optional().default(10),
      min_score: z.number().min(0).max(1).optional().default(0.1),
    }),
    knowledge_search_entities: z.object({
      query: z.string().min(1, "La requête ne peut être vide").trim(),
      type_filter: z
        .enum([
          "class",
          "function",
          "interface",
          "enum",
          "type",
          "constant",
          "variable",
          "component",
          "method",
          "import",
          "export",
        ])
        .optional(),
    }),
    knowledge_memory_search: z.object({
      query: z.string().optional().default(""),
      category: z.enum(CATEGORY_VALUES as [string, ...string[]]).optional(),
      max_results: z.number().int().positive().max(50).optional().default(10),
    }),
    knowledge_memory_add: z.object({
      content: z.string().min(1, "Le contenu ne peut être vide").trim(),
      category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
      tags: z.array(z.string().trim()).optional().default([]),
      confidence: z.number().min(0).max(1).optional().default(0.85),
      source_file: z.string().trim().optional(),
    }),
    knowledge_memory_list: z.object({
      category: z.enum(CATEGORY_VALUES as [string, ...string[]]).optional(),
      limit: z.number().int().positive().max(200).optional().default(50),
    }),
    knowledge_impact_analyze: z.object({
      files: z
        .array(z.string().trim())
        .min(1, "Au moins un fichier doit être spécifié")
        .max(50, "Trop de fichiers spécifiés (max 50)"),
      mode: z.enum(IMPACT_MODES as [string, ...string[]]).optional().default("standard"),
      min_score: z.number().int().min(0).max(100).optional(),
      include_tests: z.boolean().optional().default(false),
    }),
    knowledge_status: z.object({
      include_warnings: z.boolean().optional().default(true),
    }),
    knowledge_reindex: z.object({}),
  },
  handleToolCall: async (name, args) => {
    const log = (msg: string) => console.log(`[KnowledgeSkill] ${msg}`);

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_build_context
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_build_context") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_build_context, args);
        log(`buildContext query='${validated.query}' strategy=${validated.strategy} detail=${validated.detail}`);

        const ctx = understandingEngine.buildContext(validated.query, {
          strategy: validated.strategy as ContextStrategy,
          detail: validated.detail as ContextDetailLevel,
          maxFiles: validated.max_files,
          maxFacts: validated.max_facts,
        });

        return {
          status: "success",
          summary: {
            understanding_score: ctx.score.contextFound,
            confidence: ctx.score.confidence,
            global_risk: ctx.score.risk,
            files_found: ctx.batch.files.length,
            facts_found: ctx.batch.facts.length,
            missing_actions: ctx.missingActions.length,
            recommendations: ctx.recommendations.length,
            entities_found: ctx.relevantEntities?.length ?? 0,
          },
          score: ctx.score,
          health: ctx.health,
          batch: {
            query: ctx.batch.query,
            files: ctx.batch.files.slice(0, validated.max_files).map((f) => ({
              path: f.filePath,
              relevance: f.relevance,
              reason: f.reason?.substring(0, 300) ?? null,
              sections: (f.relevantSections ?? []).slice(0, 3).map((s) => ({
                line_start: s.lineStart,
                line_end: s.lineEnd,
                relevance: s.relevance,
                snippet: s.content?.substring(0, 300) ?? null,
              })),
            })),
            facts: ctx.batch.facts.slice(0, validated.max_facts).map((f) => ({
              id: f.id,
              content: f.content.substring(0, 400),
              category: f.category,
              tags: f.tags,
              confidence: f.confidence,
            })),
            primary_file: ctx.batch.primaryFile ?? null,
            quality: ctx.batch.quality,
          },
          missing_actions: ctx.missingActions.slice(0, 10),
          recommendations: ctx.recommendations.slice(0, 8),
          relevant_entities: (ctx.relevantEntities ?? []).slice(0, 10),
          risky_cycles: (ctx.riskyCycles ?? []).slice(0, 5),
          one_line_summary: ctx.oneLineSummary,
          system_prompt_inject: ctx.systemPromptInject?.substring(0, 3000) ?? null,
          computation_ms: ctx.computationMs,
          _tip:
            "Ce contexte est déjà structuré. Utilise read_project_file sur les fichiers listés pour approfondir, et knowledge_impact_analyze avant de modifier.",
        };
      } catch (e: any) {
        log(`ERROR buildContext: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_semantic_search
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_semantic_search") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_semantic_search, args);
        log(`semanticSearch query='${validated.query}' max=${validated.max_results}`);

        const files = semanticSearch.searchAll(validated.query);
        const filtered = files
          .filter((f) => f.relevance >= validated.min_score)
          .slice(0, validated.max_results);

        const batch = semanticSearch.generateContextBatch(validated.query);

        return {
          status: "success",
          count: filtered.length,
          files: filtered.map((f) => ({
            path: f.filePath,
            relevance: f.relevance,
            reason: f.reason?.substring(0, 300) ?? null,
            sections_count: f.relevantSections?.length ?? 0,
            sections_preview: (f.relevantSections ?? []).slice(0, 3).map((s) => ({
              line_start: s.lineStart,
              line_end: s.lineEnd,
              relevance: s.relevance,
              snippet: s.content?.substring(0, 300) ?? null,
            })),
          })),
          context_quality: batch.quality,
        };
      } catch (e: any) {
        log(`ERROR semanticSearch: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_search_entities
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_search_entities") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_search_entities, args);
        log(`searchEntities query='${validated.query}' filter=${validated.type_filter ?? "none"}`);

        let entities = knowledgeGraph.searchEntities(validated.query);
        if (validated.type_filter) {
          entities = entities.filter((e) => e.type === validated.type_filter);
        }
        entities = entities.slice(0, 30);

        return {
          status: "success",
          count: entities.length,
          entities: entities.map((e) => ({
            name: e.name,
            type: e.type,
            file: e.filePath,
            line: e.lineStart,
            signature: e.signature?.substring(0, 200) ?? null,
            modifiers: e.modifiers ?? [],
            description: e.description?.substring(0, 200) ?? null,
          })),
        };
      } catch (e: any) {
        log(`ERROR searchEntities: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_memory_search
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_memory_search") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_memory_search, args);
        log(
          `memorySearch query='${validated.query}' category=${validated.category ?? "all"} limit=${validated.max_results}`
        );

        let facts;
        if (validated.query && validated.query.length > 0) {
          facts = projectMemory.searchFacts(validated.query, validated.max_results * 2);
        } else {
          facts = projectMemory.getAllFacts(validated.category as any);
        }

        if (validated.category) {
          facts = facts.filter((f) => f.category === validated.category);
        }
        facts = facts.slice(0, validated.max_results);

        return {
          status: "success",
          count: facts.length,
          facts: facts.map((f) => ({
            id: f.id,
            content: f.content,
            category: f.category,
            tags: f.tags,
            confidence: f.confidence,
            source_file: f.sourceFile ?? null,
            usage_count: f.usageCount,
            created_at: f.createdAt,
            updated_at: f.updatedAt,
          })),
        };
      } catch (e: any) {
        log(`ERROR memorySearch: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_memory_add
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_memory_add") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_memory_add, args);
        log(
          `memoryAdd category=${validated.category} confidence=${validated.confidence} content='${validated.content.substring(0, 80)}...'`
        );

        const id = projectMemory.addFact({
          content: validated.content,
          category: validated.category as any,
          tags: validated.tags,
          confidence: validated.confidence,
          sourceFile: validated.source_file,
        });
        projectMemory.save();

        return {
          status: "success",
          message: "Fait ajouté à la mémoire projet",
          fact_id: id,
          tip: "Ce fait sera automatiquement réinjecté aux prochaines sessions via knowledge_build_context.",
        };
      } catch (e: any) {
        log(`ERROR memoryAdd: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_memory_list
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_memory_list") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_memory_list, args);
        log(`memoryList category=${validated.category ?? "all"} limit=${validated.limit}`);

        let facts = projectMemory.getAllFacts(validated.category as any);
        facts = facts
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
          .slice(0, validated.limit);

        return {
          status: "success",
          count: facts.length,
          facts: facts.map((f) => ({
            id: f.id,
            content: f.content.substring(0, 300),
            category: f.category,
            tags: f.tags,
            confidence: f.confidence,
            usage_count: f.usageCount,
            source_file: f.sourceFile ?? null,
            updated_at: f.updatedAt,
          })),
        };
      } catch (e: any) {
        log(`ERROR memoryList: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_impact_analyze
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_impact_analyze") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_impact_analyze, args);
        log(
          `impactAnalyze files=${JSON.stringify(validated.files)} mode=${validated.mode} minScore=${validated.min_score ?? "auto"}`
        );

        const normalizedFiles = validated.files.map((f: string) => f.split(path.sep).join("/").replace(/^(\.\/|\/)+/, ""));
        const filesCount = normalizedFiles.length;
        const ANY_CRITICAL_FILE = normalizedFiles.some((fp: string) =>
          /(^|\/)(server\.ts|security\.ts|selfRoot\.ts|\.env|package\.json|tsconfig\.json)/.test(fp) ||
          /^server\/(knowledge|mission|agents|skills|orchestration|utils)\/(tokenOptimizer)?/.test(fp) ||
          fp.endsWith(".config.ts") || fp.endsWith(".config.js") || fp.endsWith(".config.mjs")
        );

        // ⚡ FAST-PATH (Optimisation Leanna: skip compute when <3 non-critical files
        // Compute-intensive 6-criteria analysis is wasted on tiny changes.
        // Still return a formally valid report so downstream code never breaks.
        const modeUsedForced = validated.mode as any;
        if (
          filesCount === 1 && !ANY_CRITICAL_FILE && modeUsedForced !== "deep" && modeUsedForced !== "reverse") {
          const lightReport = impactAnalyzer.analyze(validated.files, {
            mode: "quick",
            minScore: validated.min_score ?? 5,
            includeTests: validated.include_tests,
          });

          log(`impactAnalyze FAST-PATH: ${filesCount} fichiers non-critiques → mode quick (skipped standard)`);
          return {
            status: "success",
            summary: {
              overall_risk: lightReport.overallRisk,
              risk_score: lightReport.riskScore,
              files_modified: lightReport.modifiedFiles?.length ?? (lightReport.filePath ? 1 : 0),
              files_impacted: lightReport.impactedFiles?.length ?? lightReport.totalImpacted ?? 0,
              direct_impacts: lightReport.directImpacts?.length ?? 0,
              indirect_impacts: lightReport.indirectImpacts?.length ?? 0,
              cycles_found: lightReport.affectedCycles?.length ?? 0,
              critical_modules: lightReport.criticalModulesAffected?.length ?? 0,
              tests_recommended: lightReport.testRecommendations?.length ?? 0,
              mode_used: "quick",
              computation_ms: lightReport.computationMs,
              _note: "FAST-PATH: <3 fichiers non-critiques — analyse rapide appliquée",
            },
            modified_files: lightReport.modifiedFiles ?? [lightReport.filePath],
            risk_breakdown: lightReport.riskBreakdown ?? null,
            criteria_weights: lightReport.criteriaWeights ?? null,
            impacted_files: (lightReport.impactedFiles ?? []).slice(0, 30).map((f) => ({
              path: f.filePath,
              impact_score: f.impactScore,
              risk_level: f.risk,
              distance: f.distance,
              is_critical: f.isCritical ?? false,
              criteria_breakdown: f.criteria,
              reasons: (f.reasons ?? []).slice(0, 3).map((r: string) => r.substring(0, 200)),
            })),
            affected_cycles: (lightReport.affectedCycles ?? []).slice(0, 10).map((c) => ({
              files: c.files,
              length: c.length,
            })),
            critical_modules_affected: lightReport.criticalModulesAffected ?? [],
            test_recommendations: (lightReport.testRecommendations ?? []).slice(0, 15).map((t) => ({
              priority: t.priority,
              kind: t.kind,
              scope: t.scope,
              description: t.description.slice(0, 300),
              rationale: t.rationale.slice(0, 300),
            })),
            validation_order: (lightReport.validationOrder ?? []).slice(0, 10).map((s) => ({
              step: s.step,
              label: s.label,
              required: s.required,
              commands: s.commands?.slice(0, 5) ?? [],
              estimated_risk_reduction: s.estimatedRiskReduction ?? 0,
            })),
            markdown_report: lightReport.markdownReport?.substring?.(0, 8000) ?? null,
          };
        }

        const report =
          validated.mode === "quick"
            ? impactAnalyzer.quickAnalyze(validated.files[0])
            : validated.mode === "deep"
              ? impactAnalyzer.deepAnalyze(validated.files)
              : validated.mode === "reverse"
                ? impactAnalyzer.analyze(validated.files, { mode: "reverse", minScore: validated.min_score, includeTests: validated.include_tests })
                : impactAnalyzer.analyze(validated.files, {
                    mode: validated.mode as any,
                    minScore: validated.min_score,
                    includeTests: validated.include_tests,
                  });

        return {
          status: "success",
          summary: {
            overall_risk: report.overallRisk,
            risk_score: report.riskScore,
            files_modified: report.modifiedFiles?.length ?? (report.filePath ? 1 : 0),
            files_impacted: report.impactedFiles?.length ?? report.totalImpacted ?? 0,
            direct_impacts: report.directImpacts?.length ?? 0,
            indirect_impacts: report.indirectImpacts?.length ?? 0,
            cycles_found: report.affectedCycles?.length ?? 0,
            critical_modules: report.criticalModulesAffected?.length ?? 0,
            tests_recommended: report.testRecommendations?.length ?? 0,
            mode_used: report.mode,
            computation_ms: report.computationMs,
          },
          modified_files: report.modifiedFiles ?? [report.filePath],
          risk_breakdown: report.riskBreakdown ?? null,
          criteria_weights: report.criteriaWeights ?? null,
          impacted_files: (report.impactedFiles ?? []).slice(0, 30).map((f) => ({
            path: f.filePath,
            impact_score: f.impactScore,
            risk_level: f.risk,
            distance: f.distance,
            is_critical: f.isCritical ?? false,
            criteria_breakdown: f.criteria,
            reasons: (f.reasons ?? []).slice(0, 3).map((r: string) => r.substring(0, 200)),
          })),
          affected_cycles: (report.affectedCycles ?? []).slice(0, 10).map((c) => ({
            files: c.files,
            length: c.length,
          })),
          critical_modules_affected: report.criticalModulesAffected ?? [],
          test_recommendations: (report.testRecommendations ?? []).slice(0, 15).map((t) => ({
            priority: t.priority,
            kind: t.kind,
            scope: t.scope,
            description: t.description,
            rationale: t.rationale?.substring(0, 200) ?? null,
          })),
          validation_order: (report.validationOrder ?? []).slice(0, 10),
          markdown_report_preview: report.markdownReport?.substring(0, 2000) ?? null,
          generated_at: report.generatedAt,
        };
      } catch (e: any) {
        log(`ERROR impactAnalyze: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_status
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_status") {
      try {
        const validated = validateArgs(knowledgeSkill.inputSchemas!.knowledge_status, args);
        log("status");

        const stats = knowledgeGraph.getStats();
        const health = understandingEngine.scanKnowledgeHealth();
        const initialized = knowledgeGraph.isInitialized();
        const lastIndexed = knowledgeGraph.getLastIndexed();

        return {
          status: "success",
          initialized,
          knowledge_graph: {
            files: stats.totalFiles,
            lines: stats.totalLines,
            entities: stats.totalEntities,
            exports: stats.totalExports,
            imports: stats.totalImports,
            avg_file_size: stats.averageFileSize,
            entities_by_type: stats.entitiesByType,
            files_by_extension: stats.filesByExtension,
            last_indexed: lastIndexed,
          },
          dependency_graph: {
            critical_modules: health.criticalModuleCount,
            cycles: health.cycleCount,
          },
          project_memory: {
            facts: health.factCount,
          },
          freshness: health.freshness,
          warnings: validated.include_warnings ? health.warnings : undefined,
          _tip:
            !initialized || health.freshness < 0.6 || health.warnings.length > 3
              ? "⚠️ Fraîcheur faible, warnings, ou pas encore initialisé. Utilise knowledge_reindex pour rescanner le projet."
              : "✅ Knowledge System en bon état.",
        };
      } catch (e: any) {
        log(`ERROR status: ${e.message}`);
        return { error: e.message };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // knowledge_reindex
    // ─────────────────────────────────────────────────────────────────────────
    if (name === "knowledge_reindex") {
      try {
        validateArgs(knowledgeSkill.inputSchemas!.knowledge_reindex, args);
        log("reindex (scanAll)...");

        const start = Date.now();
        const mod = await import("../knowledge/ProjectIndexer");
        await mod.projectIndexer.scanAll();
        const duration = ((Date.now() - start) / 1000).toFixed(2);

        const stats = knowledgeGraph.getStats();
        const lastIndexed = knowledgeGraph.getLastIndexed();
        log(`reindex done in ${duration}s — ${stats.totalFiles} fichiers, ${stats.totalEntities} entités`);

        return {
          status: "success",
          message: "Ré-indexation terminée",
          duration_seconds: Number(duration),
          files_indexed: stats.totalFiles,
          lines_total: stats.totalLines,
          entities_found: stats.totalEntities,
          last_indexed: lastIndexed,
        };
      } catch (e: any) {
        log(`ERROR reindex: ${e.message}`);
        return { error: e.message };
      }
    }

    return { error: `Outil inconnu : ${name}` };
  },
};
