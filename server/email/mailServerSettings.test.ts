import assert from "node:assert/strict";
import test from "node:test";
import { validateServerSettings } from "./GmailService.js";

const valid = {
  imapHost: "imap.example.org",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.example.org",
  smtpPort: 587,
  smtpSecurity: "starttls",
};

test("accepts valid generic IMAP SSL and SMTP STARTTLS settings", () => {
  assert.deepEqual(validateServerSettings(valid), valid);
});

test("accepts implicit SMTP SSL/TLS", () => {
  assert.equal(validateServerSettings({ ...valid, smtpPort: 465, smtpSecurity: "ssl" }).smtpSecurity, "ssl");
});

test("rejects missing or invalid hostnames", () => {
  for (const imapHost of ["", "localhost", "127.0.0.1", "mail.local", "bad host", "a..b.example"]) {
    assert.throws(() => validateServerSettings({ ...valid, imapHost }));
  }
});

test("rejects non-TLS IMAP and non-TLS SMTP", () => {
  assert.throws(() => validateServerSettings({ ...valid, imapSecure: false }));
  assert.throws(() => validateServerSettings({ ...valid, smtpSecurity: "none" }));
});

test("rejects invalid ports", () => {
  for (const imapPort of [0, -1, 65536, 993.5, "993"]) {
    assert.throws(() => validateServerSettings({ ...valid, imapPort }));
  }
  for (const smtpPort of [0, 65536, 587.1]) {
    assert.throws(() => validateServerSettings({ ...valid, smtpPort }));
  }
});
