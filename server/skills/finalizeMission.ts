import { Skill, validateArgs } from "./base.js";
import { z } from "zod";

export interface FinalizationEvidence {
  missionId: string;
  integrity: boolean;
  compilation: boolean;
  tests: boolean;
  behavior: boolean;
  source: "evidence-engine";
}

export type FinalizationEvidenceProvider = (missionId: string) => Promise<FinalizationEvidence | null>;

let evidenceProvider: FinalizationEvidenceProvider | null = null;

/** Injecte le lecteur de preuves factuelles du runtime. Sans provider, la clôture est refusée. */
export function setFinalizeMissionEvidenceProvider(provider: FinalizationEvidenceProvider): void {
  evidenceProvider = provider;
}

const verificationSchema = z.object({
  integrity: z.boolean(),
  compilation: z.boolean(),
  tests: z.boolean(),
  behavior: z.boolean(),
});

const finalizeMissionInputSchema = z.object({
  mission_id: z.string().min(1).max(200).describe("ID exact de la mission enregistrée dans l'EvidenceEngine."),
  title: z.string().min(1).max(80),
  summary: z.string().min(1),
  files_changed: z.array(z.string()).min(1),
  verification: verificationSchema,
  next_step: z.string().optional(),
});

export const finalizeMissionSkill: Skill = {
  name: "finalize_mission",
  permissions: ["read"],
  declarations: [{
    name: "finalize_mission",
    description:
      "Clôture une mission uniquement lorsque les quatre niveaux sont confirmés par les preuves persistées du runtime. " +
      "Les booléens fournis par le modèle sont des déclarations et ne constituent jamais une preuve. " +
      "Fournir mission_id retourné par le runtime. En l'absence de preuves ou de provider, la clôture est refusée.",
    parameters: {
      type: "OBJECT",
      properties: {
        mission_id: { type: "STRING", description: "ID exact de la mission persistée." },
        title: { type: "STRING", description: "Titre court de la mission." },
        summary: { type: "STRING", description: "Synthèse factuelle en 3 phrases maximum." },
        files_changed: { type: "ARRAY", items: { type: "STRING" }, description: "Fichiers modifiés." },
        verification: {
          type: "OBJECT",
          description: "Déclarations de statut, recoupées avec les preuves du runtime.",
          properties: {
            integrity: { type: "BOOLEAN" },
            compilation: { type: "BOOLEAN" },
            tests: { type: "BOOLEAN" },
            behavior: { type: "BOOLEAN" },
          },
          required: ["integrity", "compilation", "tests", "behavior"],
        },
        next_step: { type: "STRING" },
      },
      required: ["mission_id", "title", "summary", "files_changed", "verification"],
    },
  }],
  inputSchemas: { finalize_mission: finalizeMissionInputSchema },
  handleToolCall: async (name, args) => {
    if (name !== "finalize_mission") return undefined;
    const validated = validateArgs(finalizeMissionSkill.inputSchemas!["finalize_mission"], args);

    if (!evidenceProvider) {
      return {
        ok: false,
        error: "Clôture refusée : le lecteur de preuves factuelles n'est pas branché. Aucune déclaration du modèle ne peut remplacer les preuves persistées.",
        code: "EVIDENCE_PROVIDER_UNAVAILABLE",
      };
    }

    let evidence: FinalizationEvidence | null;
    try {
      evidence = await evidenceProvider(validated.mission_id);
    } catch (error) {
      return {
        ok: false,
        error: `Clôture refusée : lecture des preuves impossible (${error instanceof Error ? error.message : String(error)}).`,
        code: "EVIDENCE_READ_FAILED",
      };
    }
    if (!evidence || evidence.missionId !== validated.mission_id || evidence.source !== "evidence-engine") {
      return {
        ok: false,
        error: "Clôture refusée : aucune preuve runtime correspondante à cette mission.",
        code: "EVIDENCE_NOT_FOUND",
      };
    }

    const failedLevels = (["integrity", "compilation", "tests", "behavior"] as const)
      .filter((level) => !evidence![level] || !validated.verification[level]);

    if (failedLevels.length > 0) {
      return {
        ok: false,
        error: `Clôture refusée — preuves manquantes ou déclarations négatives : ${failedLevels.join(", ")}. Revenir en phase VERIFY/RECOVER.`,
        failedLevels,
        code: "VERIFICATION_INCOMPLETE",
      };
    }

    const timestamp = new Date().toISOString();
    console.log(`[finalize_mission] Mission clôturée à ${timestamp} — "${validated.title}" (${validated.mission_id})`);
    return {
      ok: true,
      timestamp,
      mission_id: validated.mission_id,
      title: validated.title,
      summary: validated.summary,
      files_changed: validated.files_changed,
      verification: evidence,
      ...(validated.next_step ? { next_step: validated.next_step } : {}),
      message: "Mission clôturée avec preuves runtime persistées. Les modifications restent en sandbox jusqu'à synchronisation.",
    };
  },
};
