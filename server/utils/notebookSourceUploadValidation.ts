import path from "node:path";

export const MAX_NOTEBOOK_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_NOTEBOOK_BATCH_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES: Record<string, { mime: string; signature: (buffer: Buffer) => boolean }> = {
  ".jpg": { mime: "image/jpeg", signature: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".jpeg": { mime: "image/jpeg", signature: b => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".png": { mime: "image/png", signature: b => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  ".webp": { mime: "image/webp", signature: b => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
};

export interface NotebookSourceValidation {
  valid: boolean;
  fileName: string;
  mimeType: string;
  error?: string;
}

export function validateNotebookSourceUpload(fileName: string, mimeType: string, buffer: Buffer): NotebookSourceValidation {
  const safeName = path.basename(fileName.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  const extension = path.extname(safeName).toLowerCase();
  const imageType = IMAGE_TYPES[extension];

  if (!safeName || safeName === "." || safeName === "..") return { valid: false, fileName: safeName, mimeType, error: "Nom de fichier invalide." };
  if (!buffer.length) return { valid: false, fileName: safeName, mimeType, error: "Le fichier est vide." };
  if (buffer.length > MAX_NOTEBOOK_SOURCE_BYTES) return { valid: false, fileName: safeName, mimeType, error: "Fichier trop volumineux (10 Mio maximum par fichier)." };

  if (imageType) {
    if (mimeType.toLowerCase() !== imageType.mime || !imageType.signature(buffer)) {
      return { valid: false, fileName: safeName, mimeType, error: "Le contenu de l'image ne correspond pas à son extension ou à son type MIME." };
    }
    return { valid: true, fileName: safeName, mimeType: imageType.mime };
  }

  const textTypes: Record<string, { mime: string; accepted: string[] }> = {
    ".pdf": { mime: "application/pdf", accepted: ["application/pdf"] },
    ".txt": { mime: "text/plain", accepted: ["text/plain"] },
    ".md": { mime: "text/markdown", accepted: ["text/markdown", "text/x-markdown", "text/plain"] },
    ".markdown": { mime: "text/markdown", accepted: ["text/markdown", "text/x-markdown", "text/plain"] },
    ".html": { mime: "text/html", accepted: ["text/html"] },
    ".htm": { mime: "text/html", accepted: ["text/html"] },
  };
  const type = textTypes[extension];
  if (!type || !type.accepted.includes(mimeType.toLowerCase())) {
    return { valid: false, fileName: safeName, mimeType, error: "Format non pris en charge. Utilisez PDF, TXT, Markdown, HTML, PNG, JPEG ou WebP." };
  }
  if (extension === ".pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return { valid: false, fileName: safeName, mimeType, error: "Signature PDF invalide." };
  }
  if (extension !== ".pdf") {
    try { new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { return { valid: false, fileName: safeName, mimeType, error: "Le fichier texte n'est pas un UTF-8 valide." }; }
    if (buffer.includes(0)) return { valid: false, fileName: safeName, mimeType, error: "Le fichier texte contient des données binaires." };
  }
  return { valid: true, fileName: safeName, mimeType: type.mime };
}
