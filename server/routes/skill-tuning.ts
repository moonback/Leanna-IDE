import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  createSupabaseSkillTraceStore,
  type SkillTuningStore,
} from "../runtime/SkillTraceStore.js";
import { generateSkillTuningProposals } from "../runtime/SkillTuning.js";
import {
  createSupabaseCustomSkillVersionStore,
  type CustomSkillUpdate,
  type CustomSkillVersionStore,
} from "../runtime/CustomSkillVersioning.js";

const FeedbackSchema = z.object({
  callId: z.string().min(1).max(200),
  label: z.enum(["correct", "incorrect", "needs_improvement"]),
  correction: z.string().max(10_000).optional(),
  comment: z.string().max(5_000).optional(),
});

const ProposalStatusSchema = z.enum(["proposed", "approved", "rejected"]);
const CustomSkillUpdateSchema = z.object({
  description: z.string().max(10_000).optional(),
  parameters: z.array(z.unknown()).max(100).optional(),
  instruction: z.string().max(50_000).optional(),
  category: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
  icon: z.string().max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, "Au moins un champ doit être fourni.");

function parseLimit(value: unknown, fallback = 100): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 500) : fallback;
}

export function createSkillTuningRouter(
  store: SkillTuningStore | undefined = createSupabaseSkillTraceStore(),
  versionStore: CustomSkillVersionStore | undefined = createSupabaseCustomSkillVersionStore(),
): Router {
  const router = Router();

  router.get("/metrics", async (req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des traces n'est pas configurée." });
    try {
      const metrics = await store.getMetrics({
        toolName: typeof req.query.toolName === "string" ? req.query.toolName : undefined,
        limit: parseLimit(req.query.limit),
      });
      return res.json({ status: "success", metrics });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.get("/interactions", async (req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des traces n'est pas configurée." });
    try {
      const interactions = await store.listRecent({
        toolName: typeof req.query.toolName === "string" ? req.query.toolName : undefined,
        limit: parseLimit(req.query.limit),
      });
      return res.json({ status: "success", interactions });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.post("/feedback", async (req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des feedbacks n'est pas configurée." });
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: "error", error: parsed.error.issues[0]?.message ?? "Feedback invalide." });
    }
    try {
      await store.recordFeedback(parsed.data);
      return res.status(201).json({ status: "success" });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.get("/proposals", async (req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des propositions n'est pas configurée." });
    try {
      const parsedStatus = req.query.status === undefined
        ? { success: true as const, data: undefined }
        : ProposalStatusSchema.safeParse(req.query.status);
      if (!parsedStatus.success) return res.status(400).json({ status: "error", error: "Statut de proposition invalide." });
      const status = parsedStatus.data;
      const proposals = await store.listProposals({ status, limit: parseLimit(req.query.limit) });
      return res.json({ status: "success", proposals });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.post("/proposals/generate", async (_req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des propositions n'est pas configurée." });
    try {
      const proposals = await generateSkillTuningProposals(store);
      return res.status(201).json({ status: "success", proposals });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.patch("/proposals/:id", async (req: Request, res: Response) => {
    if (!store) return res.status(503).json({ status: "error", error: "La persistance Supabase des propositions n'est pas configurée." });
    const parsed = z.object({ status: z.enum(["approved", "rejected"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ status: "error", error: "Le statut doit être approved ou rejected." });
    try {
      const proposal = await store.updateProposalStatus(req.params.id, parsed.data.status);
      return res.json({ status: "success", proposal });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.get("/revisions", async (req: Request, res: Response) => {
    if (!versionStore) return res.status(503).json({ status: "error", error: "Le versionnement Supabase des custom skills n'est pas configuré." });
    try {
      const revisions = await versionStore.listRevisions(typeof req.query.skillId === "string" ? req.query.skillId : undefined);
      return res.json({ status: "success", revisions });
    } catch (error: any) {
      return res.status(500).json({ status: "error", error: error.message });
    }
  });

  router.post("/proposals/:id/apply", async (req: Request, res: Response) => {
    if (!versionStore) return res.status(503).json({ status: "error", error: "Le versionnement Supabase des custom skills n'est pas configuré." });
    const parsed = z.object({
      skillId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime().optional(),
      updates: CustomSkillUpdateSchema,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ status: "error", error: parsed.error.issues[0]?.message ?? "Mise à jour invalide." });
    try {
      if (store) {
        const proposals = await store.listProposals({ limit: 500 });
        const proposal = proposals.find((item) => item.id === req.params.id);
        if (!proposal) return res.status(404).json({ status: "error", error: "Proposition introuvable." });
        if (proposal.status !== "approved") return res.status(409).json({ status: "error", error: "La proposition doit être approuvée avant application." });
      }
      const result = await versionStore.applyUpdate({
        skillId: parsed.data.skillId,
        updates: parsed.data.updates as CustomSkillUpdate,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt,
        sourceProposalId: req.params.id,
      });
      if (store) await store.markProposalApplied(req.params.id, result.revision.id);
      return res.json({ status: "success", ...result });
    } catch (error: any) {
      return res.status(409).json({ status: "error", error: error.message });
    }
  });

  router.post("/revisions/:id/rollback", async (req: Request, res: Response) => {
    if (!versionStore) return res.status(503).json({ status: "error", error: "Le versionnement Supabase des custom skills n'est pas configuré." });
    try {
      const result = await versionStore.rollback(req.params.id);
      return res.json({ status: "success", ...result });
    } catch (error: any) {
      return res.status(409).json({ status: "error", error: error.message });
    }
  });

  return router;
}

export default createSkillTuningRouter();