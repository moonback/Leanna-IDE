import path from "node:path";

const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

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

/**
 * Validates formats that ContentExtractor can actually decode from a Buffer.
 * The client-provided MIME type is never treated as proof of file content.
 */
export function validateDocumentUpload(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): DocumentUploadValidation {
  const safeName = path.basename(fileName.replace(/\\\\/g, "/")).replace(/[\\u0000-\\u001f\\u007f]/g, "").slice(0, 180);
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
  if (extension !== ".pdf" && (buffer.includes(0) || buffer.toString("utf8").includes("\\uFFFD"))) {
    return { valid: false, fileName: safeName, mimeType, error: "Le fichier texte contient des données binaires ou un encodage invalide." };
  }

  return { valid: true, fileName: safeName, mimeType: type.canonicalMime };
}

export { MAX_DOCUMENT_UPLOAD_BYTES };
