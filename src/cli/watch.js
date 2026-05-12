#!/usr/bin/env node
import { loadConfig, outputPaths, parseArgs, printHelp } from "../lib/config.js";
import { applyEventToState } from "../lib/pnl.js";
import { fetchPrices } from "../lib/prices.js";
import { getSignatures, getTransaction, watchedAddresses } from "../lib/rpc.js";
import { loadState, saveState, writeSnapshot } from "../lib/state.js";
import { parseTransactionEvent } from "../lib/parser.js";
import { renderTerminal } from "../lib/render.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = await loadConfig(args);
  const paths = outputPaths(args);
  let state = await loadState(paths.statePath, config);

  if (args.dryRun) {
    process.stdout.write(renderTerminal(state, config, { rpcStatus: "dry-run", priceStatus: "dry-run" }));
    process.stdout.write("\n");
    return;
  }

  let keepRunning = true;
  process.on("SIGINT", () => {
    keepRunning = false;
  });

  while (keepRunning) {
    const cycle = {
      rpcStatus: "scanning",
      priceStatus: "pending"
    };

    try {
      const scan = await scanOnce(config, state, args.limit);
      state = scan.state;
      cycle.rpcStatus = `${scan.transactions.length} tx`;
      cycle.priceStatus = `${Object.keys(scan.prices).length} tokens`;
      await saveState(paths.statePath, state);
      await writeSnapshot(paths.snapshotPath, state, config);
    } catch (error) {
      cycle.rpcStatus = `error: ${error.message}`;
      cycle.priceStatus = "skipped";
    }

    process.stdout.write("\x1Bc");
    process.stdout.write(renderTerminal(state, config, cycle));
    process.stdout.write("\n");

    if (args.once) break;
    await sleep(args.interval);
  }
}

export async function scanOnce(config, state, limit = 12) {
  const signatures = await collectSignatures(config, state, limit);
  const transactions = [];
  const mints = new Set();

  for (const signature of signatures.reverse()) {
    const transaction = await getTransaction(config.rpcUrl, signature);
    if (!transaction) continue;
    const event = parseTransactionEvent(transaction, config, {}, signature);
    for (const mint of Object.keys(event.tokens ?? {})) mints.add(mint);
    transactions.push({ signature, transaction });
  }

  const prices = await fetchPrices([...mints], config);

  for (const item of transactions) {
    const event = parseTransactionEvent(item.transaction, config, prices, item.signature);
    applyEventToState(state, event, config);
  }

  return {
    state,
    transactions,
    prices
  };
}

async function collectSignatures(config, state, limit) {
  const processed = new Set(state.processedSignatures ?? []);
  const unique = new Set();

  for (const address of watchedAddresses(config)) {
    const signatures = await getSignatures(config.rpcUrl, address, limit);
    for (const item of signatures ?? []) {
      if (!item.signature || item.err) continue;
      if (processed.has(item.signature)) continue;
      unique.add(item.signature);
    }
  }

  return [...unique];
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
