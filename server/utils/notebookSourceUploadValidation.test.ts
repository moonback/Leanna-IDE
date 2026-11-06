import test from "node:test";
import assert from "node:assert/strict";
import { validateNotebookSourceUpload, MAX_NOTEBOOK_SOURCE_BYTES, MAX_NOTEBOOK_BATCH_BYTES } from "./notebookSourceUploadValidation.js";

test("notebook source validation accepts supported text, PDF and raster image signatures", () => {
  assert.equal(validateNotebookSourceUpload("notes.md", "text/markdown", Buffer.from("# notes")).valid, true);
  assert.equal(validateNotebookSourceUpload("report.pdf", "application/pdf", Buffer.from("%PDF-1.7")).valid, true);
  assert.equal(validateNotebookSourceUpload("photo.png", "image/png", Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])).valid, true);
  assert.equal(validateNotebookSourceUpload("photo.webp", "image/webp", Buffer.from("RIFF0000WEBP")).valid, true);
});

test("notebook source validation rejects mismatched extensions, MIME and signatures", () => {
  assert.equal(validateNotebookSourceUpload("fake.pdf", "application/pdf", Buffer.from("plain text")).valid, false);
  assert.equal(validateNotebookSourceUpload("fake.png", "image/png", Buffer.from("not an image")).valid, false);
  assert.equal(validateNotebookSourceUpload("archive.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", Buffer.from("PK")).valid, false);
  assert.equal(validateNotebookSourceUpload("notes.txt", "application/pdf", Buffer.from("%PDF-1.7")).valid, false);
});

test("notebook source validation rejects invalid UTF-8, empty and oversized content", () => {
  assert.equal(validateNotebookSourceUpload("notes.txt", "text/plain", Buffer.from([0xc3, 0x28])).valid, false);
  assert.equal(validateNotebookSourceUpload("empty.txt", "text/plain", Buffer.alloc(0)).valid, false);
  assert.equal(validateNotebookSourceUpload("large.txt", "text/plain", Buffer.alloc(MAX_NOTEBOOK_SOURCE_BYTES + 1, 65)).valid, false);
  assert.equal(MAX_NOTEBOOK_BATCH_BYTES, 50 * 1024 * 1024);
});

test("notebook source validation normalizes file paths and control characters", () => {
  const result = validateNotebookSourceUpload("../folder\\notes.txt", "text/plain", Buffer.from("ok"));
  assert.equal(result.valid, true);
  assert.equal(result.fileName, "notes.txt");
});
