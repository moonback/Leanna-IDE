/**
 * Video Intelligence — shared platform detection and Gemini transcription primitives.
 *
 * Platform metadata is deliberately kept separate from media acquisition:
 * oEmbed/public page metadata does not grant access to a video's audio stream.
 */
import { generateText } from "../utils/textGeneration.js";

export type VideoPlatform = "youtube" | "tiktok" | "instagram" | "vimeo";

export interface VideoReference {
  platform: VideoPlatform;
  canonicalUrl: string;
  videoId?: string;
}

const PLATFORM_HOSTS: Record<VideoPlatform, string[]> = {
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"],
  tiktok: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  instagram: ["instagram.com", "www.instagram.com", "instagr.am", "www.instagr.am"],
  vimeo: ["vimeo.com", "www.vimeo.com", "player.vimeo.com"],
};

function hostMatches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

/** Accept only public HTTP(S) URLs on supported platform hostnames. */
export function parseVideoUrl(input: string): VideoReference | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as Array<[VideoPlatform, string[]]>) {
    if (!hosts.some(allowed => hostMatches(host, allowed))) continue;
    url.hash = "";
    // Remove tracking parameters while preserving platform-specific identifiers.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|si$|_t$|_r$|igshid$)/i.test(key)) url.searchParams.delete(key);
    }
    const videoId = platform === "youtube"
      ? url.hostname.includes("youtu.be") ? url.pathname.split("/").filter(Boolean)[0]
        : url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1]
      : platform === "vimeo" ? url.pathname.match(/\/(\d+)/)?.[1]
      : platform === "tiktok" ? url.pathname.match(/\/video\/(\d+)/)?.[1]
      : url.pathname.match(/\/(?:reel|reels|p|tv)\/([^/?]+)/)?.[1];
    return { platform, canonicalUrl: url.toString(), ...(videoId ? { videoId } : {}) };
  }
  return null;
}

export interface VideoTranscriptSegment {
  startMs: number;
  endMs?: number;
  speaker?: string;
  text: string;
}

export interface VideoTranscription {
  language: string;
  segments: VideoTranscriptSegment[];
  fullText: string;
}

/**
 * Transcribe an already-authorized audio or video payload with Gemini multimodal input.
 * Acquisition/downloading is intentionally not done here; callers must obtain
 * media through a platform-approved path or an explicit user upload.
 */
export async function transcribeAudioWithGemini(
  audio: Buffer,
  mimeType: string,
  options: { language?: string; title?: string } = {},
): Promise<VideoTranscription> {
  const allowedMimeTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/flac", "audio/aac", "video/mp4", "video/webm", "video/quicktime"]);
  if (!Buffer.isBuffer(audio) || audio.length === 0) throw new Error("Le fichier audio est vide.");
  if (audio.length > 20 * 1024 * 1024) throw new Error("Média trop volumineux pour l'ingestion directe Gemini (20 Mio maximum).");
  if (!allowedMimeTypes.has(mimeType.toLowerCase())) throw new Error("Format audio non pris en charge.");

  const prompt = [
    "Transcris fidèlement le contenu parlé de ce média. Ne résume pas et n'invente aucun passage.",
    `Langue demandée : ${options.language || "détection automatique"}.`,
    `Titre de la source : ${options.title || "Vidéo importée"}.`,
    "Retourne uniquement un JSON valide avec cette forme :",
    '{"language":"fr","segments":[{"startMs":0,"endMs":2400,"speaker":"Intervenant 1","text":"..."}]}',
    "Les temps doivent être en millisecondes depuis le début. Conserve les hésitations utiles, la ponctuation et les changements de locuteur lorsqu'ils sont audibles.",
    "Si un passage est inaudible, indique [inaudible] au lieu de deviner.",
  ].join("\n");

  const result = await generateText({
    prompt,
    forceProvider: "gemini",
    geminiModel: "gemini-3.8-flash",
    maxOutputTokens: 8192,
    geminiParts: [
      { inlineData: { mimeType: mimeType.toLowerCase(), data: audio.toString("base64") } },
      { text: prompt },
    ],
  });

  const raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw) as { language?: string; segments?: VideoTranscriptSegment[] };
  if (!Array.isArray(parsed.segments)) throw new Error("Gemini a renvoyé une transcription au format inattendu.");
  const segments = parsed.segments.filter(segment =>
    typeof segment?.text === "string" &&
    Number.isFinite(segment.startMs) &&
    segment.startMs >= 0,
  ).map(segment => ({
    startMs: Math.round(segment.startMs),
    ...(Number.isFinite(segment.endMs) && segment.endMs! >= segment.startMs ? { endMs: Math.round(segment.endMs!) } : {}),
    ...(typeof segment.speaker === "string" && segment.speaker.trim() ? { speaker: segment.speaker.trim() } : {}),
    text: segment.text.trim(),
  })).filter(segment => segment.text);
  if (segments.length === 0) throw new Error("Aucune parole exploitable détectée dans le média.");
  return {
    language: typeof parsed.language === "string" ? parsed.language : "und",
    segments,
    fullText: segments.map(segment => `[${Math.floor(segment.startMs / 60000).toString().padStart(2, "0")}:${Math.floor((segment.startMs % 60000) / 1000).toString().padStart(2, "0")}] ${segment.speaker ? segment.speaker + ": " : ""}${segment.text}`).join("\n"),
  };
}
