import test from "node:test";
import assert from "node:assert/strict";
import { applyEventToState, createEmptyState } from "../src/lib/pnl.js";

const wallet = "Wallet111111111111111111111111111111111111";
const mint = "Mint11111111111111111111111111111111111111";
const config = {
  profileName: "Test",
  network: "mainnet-beta",
  designatedAddress: "Destination11111111111111111111111111111111",
  wallets: [{ label: "Hermes", address: wallet, role: "source" }],
  tokens: {
    [mint]: { symbol: "TST", name: "Test Token", decimals: 6 }
  }
};

function event(id, delta, price) {
  return {
    id,
    signature: id,
    timestamp: "2026-05-12T10:00:00.000Z",
    type: "wallet_activity",
    involvedWallets: [{ address: wallet, label: "Hermes", role: "source" }],
    tokenDeltas: [{ owner: wallet, mint, delta, decimals: 6 }],
    routedTransfers: [],
    transfers: [],
    tokens: {
      [mint]: {
        mint,
        symbol: "TST",
        name: "Test Token",
        decimals: 6,
        usdPrice: price,
        priceBlockId: 1
      }
    },
    prices: {
      [mint]: { usdPrice: price, blockId: 1, decimals: 6 }
    }
  };
}

test("applyEventToState estimates average-cost realized and unrealized PnL", () => {
  const state = createEmptyState(config);
  applyEventToState(state, event("buy", 10, 2), config);
  applyEventToState(state, event("sell", -4, 3), config);

  const position = state.wallets[wallet].positions[mint];
  assert.equal(position.quantity, 6);
  assert.equal(position.costBasisUsd, 12);
  assert.equal(position.realizedPnlUsd, 4);
  assert.equal(position.unrealizedPnlUsd, 6);
  assert.equal(position.totalPnlUsd, 10);
  assert.equal(state.stats.estimatedPnlUsd, 10);
});

test("applyEventToState ignores duplicate signatures", () => {
  const state = createEmptyState(config);
  applyEventToState(state, event("same", 10, 2), config);
  applyEventToState(state, event("same", 10, 2), config);

  assert.equal(state.wallets[wallet].positions[mint].quantity, 10);
  assert.equal(state.events.length, 1);
});
