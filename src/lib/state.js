import fs from "node:fs/promises";
import path from "node:path";
import { createEmptyState, recomputeStats } from "./pnl.js";

export async function loadState(statePath, config) {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    recomputeStats(state);
    return state;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return createEmptyState(config);
  }
}

export async function saveState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function writeSnapshot(snapshotPath, state, config) {
  const snapshot = {
    ...state,
    config: {
      profileName: config.profileName,
      network: config.network,
      designatedAddress: config.designatedAddress,
      wallets: config.wallets,
      metadata: config.metadata ?? {}
    }
  };

  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
