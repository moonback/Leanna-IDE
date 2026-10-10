/**
 * Tests pour contractNetConfig (Node test runner)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getContractNetConfig, DEFAULT_CONTRACT_NET_CONFIG } from "./contractNetConfig.js";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("contractNetConfig", () => {
  it("applique les valeurs par défaut (mode on, fenêtre 500, marge 0.1, preuve 3)", () => {
    const cfg = getContractNetConfig(env({}));
    assert.deepEqual(cfg, DEFAULT_CONTRACT_NET_CONFIG);
    assert.equal(cfg.mode, "on");
  });

  it("reconnaît off / shadow / on (insensible à la casse et aux espaces)", () => {
    assert.equal(getContractNetConfig(env({ LEANNA_CONTRACT_NET: "off" })).mode, "off");
    assert.equal(getContractNetConfig(env({ LEANNA_CONTRACT_NET: " Shadow " })).mode, "shadow");
    assert.equal(getContractNetConfig(env({ LEANNA_CONTRACT_NET: "ON" })).mode, "on");
  });

  it("retombe sur 'on' quand le mode est invalide", () => {
    assert.equal(getContractNetConfig(env({ LEANNA_CONTRACT_NET: "banana" })).mode, "on");
  });

  it("borne la fenêtre d'enchères entre 20 et 5000 ms", () => {
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_BIDDING_WINDOW_MS: "1" })).biddingWindowMs, 20);
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_BIDDING_WINDOW_MS: "999999" })).biddingWindowMs, 5000);
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_BIDDING_WINDOW_MS: "250" })).biddingWindowMs, 250);
  });

  it("ignore les nombres invalides et garde le défaut", () => {
    const cfg = getContractNetConfig(
      env({ CONTRACT_NET_BIDDING_WINDOW_MS: "abc", CONTRACT_NET_SWITCH_MARGIN: "", CONTRACT_NET_MIN_EVIDENCE: "NaN" })
    );
    assert.equal(cfg.biddingWindowMs, 500);
    assert.equal(cfg.switchMargin, 0.1);
    assert.equal(cfg.minEvidence, 3);
  });

  it("borne la marge entre 0 et 1 et la preuve minimale entre 1 et 100", () => {
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_SWITCH_MARGIN: "-2" })).switchMargin, 0);
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_SWITCH_MARGIN: "7" })).switchMargin, 1);
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_MIN_EVIDENCE: "0" })).minEvidence, 1);
    assert.equal(getContractNetConfig(env({ CONTRACT_NET_MIN_EVIDENCE: "500" })).minEvidence, 100);
  });

  it("lit process.env à chaque appel (lecture paresseuse)", () => {
    const previous = process.env.LEANNA_CONTRACT_NET;
    try {
      process.env.LEANNA_CONTRACT_NET = "shadow";
      assert.equal(getContractNetConfig().mode, "shadow");
      process.env.LEANNA_CONTRACT_NET = "off";
      assert.equal(getContractNetConfig().mode, "off");
    } finally {
      if (previous === undefined) delete process.env.LEANNA_CONTRACT_NET;
      else process.env.LEANNA_CONTRACT_NET = previous;
    }
  });
});
