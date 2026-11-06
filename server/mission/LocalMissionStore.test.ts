import test from "node:test";
import assert from "node:assert/strict";
import type { MissionState } from "./types.js";
import { CompositeMissionStore, type MissionStatePort } from "./LocalMissionStore.js";

function replica(state: MissionState | null): MissionStatePort {
  return {
    isEnabled: () => true,
    save: async () => undefined,
    load: async () => state,
    listByStatus: async () => state ? [state] : [],
    delete: async () => undefined,
  };
}

const snapshot = (updatedAt: string, title: string) => ({
  id: "mission-1",
  title,
  updatedAt,
} as MissionState);

test("CompositeMissionStore.load returns the newest replica, not the first configured store", async () => {
  const stale = snapshot("2026-11-06T10:00:00.000Z", "stale");
  const fresh = snapshot("2026-11-06T10:05:00.000Z", "fresh");
  const store = new CompositeMissionStore(replica(stale), replica(fresh));

  assert.equal((await store.load("mission-1"))?.title, "fresh");
});

test("CompositeMissionStore.load falls back when a replica is unavailable", async () => {
  const fresh = snapshot("2026-11-06T10:05:00.000Z", "available");
  const failing: MissionStatePort = {
    isEnabled: () => true,
    save: async () => undefined,
    load: async () => { throw new Error("replica unavailable"); },
    listByStatus: async () => [],
    delete: async () => undefined,
  };
  const store = new CompositeMissionStore(failing, replica(fresh));

  assert.equal((await store.load("mission-1"))?.title, "available");
});
