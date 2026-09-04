import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  createSupabaseSkillTraceStore,
  type SkillTuningStore,
} from "../runtime/SkillTraceStore.js";
import { generateSkillTuningProposals } from "../runtime/SkillTuning.js";

const FeedbackSchema = z.object({
  callId: z.string().min(1).max(200),
  label: z.enum(["correct", "incorrect", "needs_improvement"]),
  correction: z.string().max(10_000).optional(),
  comment: z.string().max(5_000).optional(),
});

const ProposalStatusSchema = z.enum(["proposed", "approved", "rejected"]);

function parseLimit(value: unknown, fallback = 100): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 500) : fallback;
}

export function createSkillTuningRouter(store: SkillTuningStore | undefined = createSupabaseSkillTraceStore()): Router {
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

  return router;
}

export default createSkillTuningRouter();