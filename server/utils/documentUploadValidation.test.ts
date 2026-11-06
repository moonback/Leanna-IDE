import test from "node:test";
import assert from "node:assert/strict";
import { validateDocumentUpload, MAX_DOCUMENT_UPLOAD_BYTES } from "./documentUploadValidation.js";

test("document upload validation accepts supported plain-text formats", () => {
  for (const [name, mime] of [["notes.txt", "text/plain"], ["notes.md", "text/markdown"], ["page.html", "text/html"]]) {
    const result = validateDocumentUpload(name, mime, Buffer.from("Contenu documentaire"));
    assert.equal(result.valid, true, name);
  }
});

test("document upload validation requires PDF signature", () => {
  assert.equal(validateDocumentUpload("rapport.pdf", "application/pdf", Buffer.from("%PDF-1.7")).valid, true);
  assert.equal(validateDocumentUpload("rapport.pdf", "application/pdf", Buffer.from("not a pdf")).valid, false);
});

test("document upload validation rejects mismatched MIME, unsupported formats and binary text", () => {
  assert.equal(validateDocumentUpload("payload.pdf", "text/plain", Buffer.from("%PDF-1.7")).valid, false);
  assert.equal(validateDocumentUpload("archive.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK")).valid, false);
  assert.equal(validateDocumentUpload("payload.txt", "text/plain", Buffer.from([0, 1, 2])).valid, false);
});

test("document upload validation rejects empty and oversized files", () => {
  assert.equal(validateDocumentUpload("empty.txt", "text/plain", Buffer.alloc(0)).valid, false);
  assert.equal(validateDocumentUpload("large.txt", "text/plain", Buffer.alloc(MAX_DOCUMENT_UPLOAD_BYTES + 1, 65)).valid, false);
});

test("document upload validation strips path components and control characters", () => {
  const result = validateDocumentUpload("../rapport\u0000.txt", "text/plain", Buffer.from("safe"));
  assert.equal(result.valid, true);
  assert.equal(result.fileName, "rapport.txt");
});


test("multimodal upload validation checks raster image signatures and MIME", async () => {
  const { validateMultimodalDocumentUpload } = await import("./documentUploadValidation.js");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(validateMultimodalDocumentUpload("photo.png", "image/png", png).valid, true);
  assert.equal(validateMultimodalDocumentUpload("photo.png", "image/png", Buffer.from("not png")).valid, false);
  assert.equal(validateMultimodalDocumentUpload("photo.png", "image/jpeg", png).valid, false);
  assert.equal(validateMultimodalDocumentUpload("photo.svg", "image/svg+xml", Buffer.from("<svg/>")).valid, false);
});
