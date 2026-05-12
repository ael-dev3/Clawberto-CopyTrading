import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "../..");

export function parseArgs(argv) {
  const args = {
    once: false,
    dryRun: false,
    interval: 15000,
    limit: 12
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--once") args.once = true;
    else if (value === "--dry-run") args.dryRun = true;
    else if (value === "--config") args.config = argv[++index];
    else if (value === "--out") args.out = argv[++index];
    else if (value === "--state") args.state = argv[++index];
    else if (value === "--interval") args.interval = Number(argv[++index]);
    else if (value === "--limit") args.limit = Number(argv[++index]);
    else if (value === "--help" || value === "-h") args.help = true;
  }

  if (!Number.isFinite(args.interval) || args.interval < 5000) args.interval = 15000;
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 12;
  return args;
}

export function resolveFromRoot(inputPath) {
  if (!inputPath) return undefined;
  return path.isAbsolute(inputPath) ? inputPath : path.join(repoRoot, inputPath);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function loadConfig(args = {}) {
  const preferred = resolveFromRoot(args.config ?? "config/wallets.json");
  const fallback = path.join(repoRoot, "config/wallets.example.json");
  const configPath = (await pathExists(preferred)) ? preferred : fallback;
  const config = await readJson(configPath);

  config.configPath = configPath;
  config.rpcUrl = process.env.SOLANA_RPC_URL || config.rpcUrl || "https://api.mainnet-beta.solana.com";
  config.priceUrl = process.env.JUPITER_PRICE_URL || config.priceUrl || "https://lite-api.jup.ag/price/v3";
  config.jupiterApiKey = process.env.JUPITER_API_KEY || config.jupiterApiKey || "";
  config.wallets = Array.isArray(config.wallets) ? config.wallets : [];
  config.tokens = config.tokens ?? {};
  config.designatedAddress = config.designatedAddress ?? "";

  if (!config.designatedAddress) {
    throw new Error("config.designatedAddress is required");
  }

  if (config.wallets.length === 0) {
    throw new Error("config.wallets must include at least one Hermes/source wallet");
  }

  return config;
}

export function outputPaths(args = {}) {
  return {
    statePath: resolveFromRoot(args.state ?? "data/state.json"),
    snapshotPath: resolveFromRoot(args.out ?? "docs/data/snapshot.json")
  };
}

export function printHelp() {
  console.log(`Clawberto Hermes watcher

Usage:
  npm run watch -- [--config config/wallets.json] [--interval 15000] [--limit 12]

Flags:
  --once          Run one scan and exit
  --dry-run       Render current local state without Solana RPC calls
  --config PATH   Wallet config JSON
  --out PATH      Dashboard snapshot output path
  --state PATH    Persistent state path
  --interval MS   Poll interval, minimum 5000
  --limit N       Signatures fetched per watched address
`);
}
