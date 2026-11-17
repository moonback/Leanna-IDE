import test from "node:test";
import assert from "node:assert/strict";
import { parseVideoUrl } from "./videoIntelligence.js";

test("parseVideoUrl detects supported platforms and stable identifiers", () => {
  assert.deepEqual(parseVideoUrl("https://www.tiktok.com/@creator/video/7351234567890123456"), {
    platform: "tiktok",
    canonicalUrl: "https://www.tiktok.com/@creator/video/7351234567890123456",
    videoId: "7351234567890123456",
  });
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=abcdefghijk")?.platform, "youtube");
  assert.equal(parseVideoUrl("https://www.instagram.com/reel/ABC123/")?.videoId, "ABC123");
  assert.equal(parseVideoUrl("https://vimeo.com/123456789")?.videoId, "123456789");
});

test("parseVideoUrl strips tracking parameters without dropping video identity", () => {
  const parsed = parseVideoUrl("https://youtu.be/abcdefghijk?si=tracking&utm_source=share");
  assert.equal(parsed?.canonicalUrl, "https://youtu.be/abcdefghijk");
  assert.equal(parsed?.videoId, "abcdefghijk");
});

test("parseVideoUrl rejects unsupported hosts, credentials and unsafe protocols", () => {
  assert.equal(parseVideoUrl("https://example.com/video/123"), null);
  assert.equal(parseVideoUrl("javascript:alert(1)"), null);
  assert.equal(parseVideoUrl("https://user:pass@tiktok.com/@x/video/123"), null);
  assert.equal(parseVideoUrl("https://tiktok.com.evil.example/@x/video/123"), null);
  assert.equal(parseVideoUrl("https://evil.tiktok.com/@x/video/123"), null);
  assert.equal(parseVideoUrl("https://nested.youtube.com/watch?v=abcdefghijk"), null);
  assert.equal(parseVideoUrl("x".repeat(2049)), null);
});
