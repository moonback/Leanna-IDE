/**
 * PodcastAudioRenderer — produit un fichier WAV continu à partir d'un dialogue
 * à deux voix. Les segments PCM sont synthétisés avec une voix dédiée puis
 * assemblés côté serveur ; le navigateur ne réalise plus le mixage du podcast.
 */
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { generateSpeech } from "../utils/geminiTTS.js";
import { getSandboxRoot } from "../utils/sandbox.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("PodcastAudioRenderer");
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export interface PodcastRenderOptions {
  hostName: string;
  coHostName: string;
  hostVoice?: string;
  coHostVoice?: string;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, speaker: "host" | "cohost") => void;
}

export interface PodcastRenderResult {
  filePath: string;
  relativePath: string;
  durationSeconds: number;
  sizeBytes: number;
  segmentCount: number;
}

function parseDialogue(script: string, hostName: string, coHostName: string) {
  const lines = script.split(/\r?\n/);
  const result: Array<{ speaker: "host" | "cohost"; text: string }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const label = line.slice(0, separator).trim().toLocaleLowerCase();
    const text = line.slice(separator + 1).trim();
    if (!text) continue;
    if (label === hostName.toLocaleLowerCase() || label === "alex") {
      result.push({ speaker: "host", text });
    } else if (label === coHostName.toLocaleLowerCase() || label === "sam") {
      result.push({ speaker: "cohost", text });
    }
  }
  return result;
}

function makeWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8, 28);
  header.writeUInt16LE(CHANNELS * BITS_PER_SAMPLE / 8, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const activeRenders = new Map<string, Promise<PodcastRenderResult>>();

export function renderPodcastAudio(
  script: string,
  overviewId: string,
  options: PodcastRenderOptions,
): Promise<PodcastRenderResult> {
  const active = activeRenders.get(overviewId);
  if (active) return active;
  const job = renderPodcastAudioInternal(script, overviewId, options).finally(() => {
    activeRenders.delete(overviewId);
  });
  activeRenders.set(overviewId, job);
  return job;
}

async function renderPodcastAudioInternal(
  script: string,
  overviewId: string,
  options: PodcastRenderOptions,
): Promise<PodcastRenderResult> {
  if (options.hostVoice && options.coHostVoice && options.hostVoice === options.coHostVoice) {
    throw new Error("Les deux voix du podcast doivent être différentes.");
  }
  const dialogue = parseDialogue(script, options.hostName, options.coHostName);
  if (dialogue.length === 0) throw new Error("Aucune réplique attribuable aux deux animateurs.");
  const pcmSegments: Buffer[] = [];
  const interTurnSilence = Buffer.alloc(Math.round(SAMPLE_RATE * 0.18) * (BITS_PER_SAMPLE / 8));
  let totalBytes = 0;

  for (let index = 0; index < dialogue.length; index++) {
    if (options.signal?.aborted) throw new Error("Génération audio annulée.");
    const segment = dialogue[index];
    const voice = segment.speaker === "host"
      ? (options.hostVoice || "ff_siwis")
      : (options.coHostVoice || "am_adam");
    const base64 = await generateSpeech(segment.text, {
      voiceName: voice,
      provider: "auto",
      noCache: false,
    });
    if (!base64) {
      throw new Error(`Échec TTS à la réplique ${index + 1} (${segment.speaker}). Aucun fichier incomplet ne sera publié.`);
    }
    const pcm = Buffer.from(base64, "base64");
    if (pcm.length === 0 || pcm.length % 2 !== 0) {
      throw new Error(`Segment audio invalide à la réplique ${index + 1}.`);
    }
    if (pcmSegments.length > 0) {
      pcmSegments.push(interTurnSilence);
      totalBytes += interTurnSilence.length;
    }
    pcmSegments.push(pcm);
    totalBytes += pcm.length;
    options.onProgress?.(index + 1, dialogue.length, segment.speaker);
  }

  const pcm = Buffer.concat(pcmSegments, totalBytes);
  const wav = makeWav(pcm);
  const directory = path.join(getSandboxRoot(), "podcasts");
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${overviewId}.wav`;
  const filePath = path.join(directory, filename);
  const temporaryPath = path.join(directory, `.${overviewId}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, wav, { flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    throw error;
  }

  const durationSeconds = pcm.length / (SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8));
  log.info(`Piste podcast rendue: ${overviewId}, ${dialogue.length} répliques, ${durationSeconds.toFixed(1)}s, ${wav.length} octets`);
  return {
    filePath,
    relativePath: `podcasts/${filename}`,
    durationSeconds,
    sizeBytes: wav.length,
    segmentCount: dialogue.length,
  };
}
