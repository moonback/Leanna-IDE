import path from "node:path";

export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

const SUPPORTED_TYPES: Record<string, { mimeTypes: string[]; canonicalMime: string }> = {
  ".pdf": { mimeTypes: ["application/pdf"], canonicalMime: "application/pdf" },
  ".txt": { mimeTypes: ["text/plain"], canonicalMime: "text/plain" },
  ".md": { mimeTypes: ["text/markdown", "text/x-markdown", "text/plain"], canonicalMime: "text/markdown" },
  ".markdown": { mimeTypes: ["text/markdown", "text/x-markdown", "text/plain"], canonicalMime: "text/markdown" },
  ".html": { mimeTypes: ["text/html"], canonicalMime: "text/html" },
  ".htm": { mimeTypes: ["text/html"], canonicalMime: "text/html" },
};

export interface DocumentUploadValidation {
  valid: boolean;
  fileName: string;
  mimeType: string;
  error?: string;
}

/** Validate only formats that ContentExtractor can decode from an upload buffer. */
export function validateDocumentUpload(fileName: string, mimeType: string, buffer: Buffer): DocumentUploadValidation {
  const normalizedName = fileName.replace(/\\/g, "/");
  const safeName = path.basename(normalizedName).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  const extension = path.extname(safeName).toLowerCase();
  const type = SUPPORTED_TYPES[extension];

  if (!safeName || safeName === "." || safeName === "..") {
    return { valid: false, fileName: safeName, mimeType, error: "Nom de fichier invalide." };
  }
  if (buffer.length === 0) {
    return { valid: false, fileName: safeName, mimeType, error: "Le fichier est vide." };
  }
  if (buffer.length > MAX_DOCUMENT_UPLOAD_BYTES) {
    return { valid: false, fileName: safeName, mimeType, error: "Fichier trop volumineux (10 Mio maximum)." };
  }
  if (!type || !type.mimeTypes.includes(mimeType.toLowerCase())) {
    return { valid: false, fileName: safeName, mimeType, error: "Format de document non pris en charge ou MIME incohérent." };
  }
  if (extension === ".pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    return { valid: false, fileName: safeName, mimeType, error: "Le contenu ne correspond pas à un fichier PDF valide." };
  }
  if (extension !== ".pdf" && (buffer.includes(0) || buffer.toString("utf8").includes("\uFFFD"))) {
    return { valid: false, fileName: safeName, mimeType, error: "Le fichier texte contient des données binaires ou un encodage invalide." };
  }

  return { valid: true, fileName: safeName, mimeType: type.canonicalMime };
}

/** Multimodal upload contract for the chat/document analysis endpoint. */
export function validateMultimodalDocumentUpload(fileName: string, mimeType: string, buffer: Buffer): DocumentUploadValidation {
  const extension = path.extname(fileName.replace(/\\/g, "/")).toLowerCase();
  const imageSignatures: Record<string, { mime: string; valid: (data: Buffer) => boolean }> = {
    ".jpg": { mime: "image/jpeg", valid: data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
    ".jpeg": { mime: "image/jpeg", valid: data => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
    ".png": { mime: "image/png", valid: data => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    ".webp": { mime: "image/webp", valid: data => data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP" },
  };
  const image = imageSignatures[extension];
  if (!image) return validateDocumentUpload(fileName, mimeType, buffer);
  const safeName = path.basename(fileName.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  if (!buffer.length) return { valid: false, fileName: safeName, mimeType, error: "Le fichier est vide." };
  if (buffer.length > MAX_DOCUMENT_UPLOAD_BYTES) return { valid: false, fileName: safeName, mimeType, error: "Fichier trop volumineux (10 Mio maximum)." };
  if (mimeType.toLowerCase() !== image.mime || !image.valid(buffer)) {
    return { valid: false, fileName: safeName, mimeType, error: "Le contenu de l'image ne correspond pas à son extension ou à son type MIME." };
  }
  return { valid: true, fileName: safeName, mimeType: image.mime };
}
