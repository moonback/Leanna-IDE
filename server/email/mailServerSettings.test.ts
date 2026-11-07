import assert from "node:assert/strict";
import test from "node:test";
import { validateServerSettings } from "./GmailService.js";

const valid = {
  receiveEnabled: true,
  sendEnabled: true,
  imapHost: "imap.example.org",
  imapPort: 993,
  imapSecurity: "ssl",
  smtpHost: "smtp.example.org",
  smtpPort: 587,
  smtpSecurity: "starttls",
};

test("accepts valid generic IMAP SSL and SMTP STARTTLS settings", () => {
  assert.deepEqual(validateServerSettings(valid), valid);
});

test("accepts IMAP STARTTLS and implicit SMTP SSL/TLS", () => {
  assert.equal(validateServerSettings({ ...valid, imapPort: 143, imapSecurity: "starttls" }).imapSecurity, "starttls");
  assert.equal(validateServerSettings({ ...valid, smtpPort: 465, smtpSecurity: "ssl" }).smtpSecurity, "ssl");
});

test("rejects missing or invalid hostnames", () => {
  for (const imapHost of ["", "localhost", "127.0.0.1", "mail.local", "bad host", "a..b.example"]) {
    assert.throws(() => validateServerSettings({ ...valid, imapHost }));
  }
});

test("rejects non-TLS IMAP and non-TLS SMTP", () => {
  assert.throws(() => validateServerSettings({ ...valid, imapSecurity: "none" }));
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

test("accepts receive-only configuration without SMTP settings", () => {
  const settings = validateServerSettings({
    receiveEnabled: true, sendEnabled: false,
    imapHost: "imap.example.org", imapPort: 993, imapSecurity: "ssl",
    smtpHost: "", smtpPort: 465,
  });
  assert.equal(settings.receiveEnabled, true);
  assert.equal(settings.sendEnabled, false);
  assert.equal(settings.smtpHost, "");
});

test("accepts send-only configuration without IMAP settings", () => {
  const settings = validateServerSettings({
    receiveEnabled: false, sendEnabled: true,
    imapHost: "", imapPort: 993,
    smtpHost: "smtp.example.org", smtpPort: 587, smtpSecurity: "starttls",
  });
  assert.equal(settings.receiveEnabled, false);
  assert.equal(settings.sendEnabled, true);
  assert.equal(settings.imapHost, "");
});

test("rejects a configuration with both capabilities disabled", () => {
  assert.throws(() => validateServerSettings({
    receiveEnabled: false, sendEnabled: false,
  }), /Activez au moins/);
});

test("validates only the server used by the selected capability", () => {
  assert.doesNotThrow(() => validateServerSettings({
    receiveEnabled: true, sendEnabled: false,
    imapHost: "imap.example.org", imapPort: 993, imapSecurity: "ssl",
    smtpHost: "localhost",
  }));
  assert.doesNotThrow(() => validateServerSettings({
    receiveEnabled: false, sendEnabled: true,
    imapHost: "localhost",
    smtpHost: "smtp.example.org", smtpPort: 587, smtpSecurity: "starttls",
  }));
});
