/**
 * Audio d'un podcast (Audio Overview) : découpage du script en répliques et
 * assemblage PCM16 24 kHz mono en WAV. Module pur (aucune E/S).
 */

export const SAMPLE_RATE = 24000;
/** Octets par seconde : 24 kHz × 16 bits × mono. */
export const BYTES_PER_SECOND = SAMPLE_RATE * 2;
const GAP_BYTES = Math.round(BYTES_PER_SECOND * 0.3);

export interface DialogueLine {
  speaker: "host" | "cohost";
  text: string;
}

/** Les anciens podcasts utilisent Alex/Sam ; une ligne sans préfixe revient à l'hôte. */
export function parseDialogue(script: string, hostName = "Alex", coHostName = "Sam"): DialogueLine[] {
  const lines: DialogueLine[] = [];
  for (const raw of script.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const label = separator > 0 ? trimmed.slice(0, separator).trim().toLowerCase() : "";
    const body = separator > 0 ? trimmed.slice(separator + 1).trim() : trimmed;
    if (label === coHostName.toLowerCase() || label === "sam") {
      lines.push({ speaker: "cohost", text: body });
    } else if (label === hostName.toLowerCase() || label === "alex") {
      lines.push({ speaker: "host", text: body });
    } else {
      lines.push({ speaker: "host", text: trimmed });
    }
  }
  return lines.filter(l => l.text);
}

/** Concatène des segments PCM16 avec 300 ms de silence entre eux et ajoute l'en-tête WAV. */
export function buildWav(segments: Buffer[]): Buffer {
  const parts: Buffer[] = [];
  segments.forEach((segment, i) => {
    if (i > 0) parts.push(Buffer.alloc(GAP_BYTES));
    parts.push(segment);
  });
  const data = Buffer.concat(parts);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
