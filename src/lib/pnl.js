import { tokenMetadata } from "./prices.js";

export function createEmptyState(config = {}) {
  return {
    version: 1,
    profileName: config.profileName ?? "Hermes Copy-Trade Watch",
    network: config.network ?? "mainnet-beta",
    designatedAddress: config.designatedAddress ?? "",
    generatedAt: new Date().toISOString(),
    processedSignatures: [],
    wallets: {},
    tokens: {},
    events: [],
    stats: {
      totalEvents: 0,
      routedEvents: 0,
      walletsObserved: 0,
      tokensObserved: 0,
      estimatedPnlUsd: 0
    }
  };
}

export function applyEventToState(state, event, config) {
  const next = state ?? createEmptyState(config);
  const signature = event.signature || event.id;
  if (signature && next.processedSignatures.includes(signature)) return next;

  if (signature) next.processedSignatures.unshift(signature);
  next.processedSignatures = next.processedSignatures.slice(0, 2000);
  next.generatedAt = new Date().toISOString();
  next.profileName = config.profileName ?? next.profileName;
  next.network = config.network ?? next.network;
  next.designatedAddress = config.designatedAddress ?? next.designatedAddress;

  for (const wallet of event.involvedWallets ?? []) {
    ensureWallet(next, wallet.address, wallet.label, wallet.role);
  }

  for (const delta of event.tokenDeltas ?? []) {
    if (!delta.owner || delta.owner === "unknown") continue;
    const meta = event.tokens?.[delta.mint] ?? tokenMetadata(delta.mint, config, event.prices);
    ensureToken(next, meta);
    ensureWallet(next, delta.owner, delta.owner, "observed");
    applyDelta(next.wallets[delta.owner], delta, meta);

    const token = next.tokens[delta.mint];
    token.netAmount = roundMoney((token.netAmount ?? 0) + delta.delta);
    token.absoluteVolume = roundMoney((token.absoluteVolume ?? 0) + Math.abs(delta.delta));
    token.lastObservedAt = event.timestamp;
    token.lastSignature = event.signature;
    token.usdPrice = meta.usdPrice;
    token.priceChange24h = meta.priceChange24h;
    token.priceBlockId = meta.priceBlockId;
  }

  const compactEvent = compactForHistory(event);
  next.events.unshift(compactEvent);
  next.events = next.events.slice(0, 120);
  recomputeStats(next);
  return next;
}

export function recomputeStats(state) {
  let totalPnl = 0;
  for (const wallet of Object.values(state.wallets)) {
    let walletPnl = 0;
    let walletValue = 0;
    for (const position of Object.values(wallet.positions ?? {})) {
      const price = position.usdPrice ?? 0;
      position.valueUsd = roundMoney(position.quantity * price);
      position.unrealizedPnlUsd = roundMoney(position.valueUsd - position.costBasisUsd);
      position.totalPnlUsd = roundMoney(position.realizedPnlUsd + position.unrealizedPnlUsd);
      walletPnl += position.totalPnlUsd;
      walletValue += position.valueUsd;
    }
    wallet.estimatedPnlUsd = roundMoney(walletPnl);
    wallet.currentValueUsd = roundMoney(walletValue);
    totalPnl += wallet.estimatedPnlUsd;
  }

  state.stats = {
    totalEvents: state.events.length,
    routedEvents: state.events.filter((event) => event.type === "token_to_designated").length,
    walletsObserved: Object.keys(state.wallets).length,
    tokensObserved: Object.keys(state.tokens).length,
    estimatedPnlUsd: roundMoney(totalPnl)
  };
}

function ensureWallet(state, address, label = address, role = "observed") {
  if (!address || address === "unknown") return;
  state.wallets[address] ??= {
    address,
    label,
    role,
    currentValueUsd: 0,
    estimatedPnlUsd: 0,
    positions: {}
  };

  if (label && state.wallets[address].label === address) state.wallets[address].label = label;
  if (role && state.wallets[address].role === "observed") state.wallets[address].role = role;
}

function ensureToken(state, meta) {
  state.tokens[meta.mint] ??= {
    mint: meta.mint,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    netAmount: 0,
    absoluteVolume: 0,
    usdPrice: meta.usdPrice,
    priceChange24h: meta.priceChange24h,
    priceBlockId: meta.priceBlockId,
    lastObservedAt: null,
    lastSignature: null
  };
}

function ensurePosition(wallet, meta) {
  wallet.positions[meta.mint] ??= {
    mint: meta.mint,
    symbol: meta.symbol,
    name: meta.name,
    quantity: 0,
    costBasisUsd: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    totalPnlUsd: 0,
    valueUsd: 0,
    usdPrice: meta.usdPrice,
    lastPriceBlockId: meta.priceBlockId
  };
  return wallet.positions[meta.mint];
}

function applyDelta(wallet, delta, meta) {
  const position = ensurePosition(wallet, meta);
  const price = Number(meta.usdPrice);
  position.usdPrice = Number.isFinite(price) ? price : position.usdPrice;
  position.lastPriceBlockId = meta.priceBlockId ?? position.lastPriceBlockId;

  if (!Number.isFinite(price) || price <= 0) {
    position.quantity = roundMoney(position.quantity + delta.delta);
    return;
  }

  if (delta.delta > 0) {
    position.quantity = roundMoney(position.quantity + delta.delta);
    position.costBasisUsd = roundMoney(position.costBasisUsd + delta.delta * price);
    return;
  }

  const amountOut = Math.abs(delta.delta);
  const proceeds = amountOut * price;
  const averageCost = position.quantity > 0 ? position.costBasisUsd / position.quantity : price;
  const costRemoved = Math.min(amountOut, Math.max(position.quantity, 0)) * averageCost;

  position.quantity = roundMoney(position.quantity - amountOut);
  position.costBasisUsd = roundMoney(Math.max(0, position.costBasisUsd - costRemoved));
  position.realizedPnlUsd = roundMoney(position.realizedPnlUsd + proceeds - costRemoved);
}

function compactForHistory(event) {
  return {
    id: event.id,
    signature: event.signature,
    slot: event.slot,
    timestamp: event.timestamp,
    type: event.type,
    status: event.status,
    feeSol: event.feeSol,
    accountCount: event.accountCount,
    instructionCount: event.instructionCount,
    watchedTouches: event.watchedTouches,
    routedTransfers: event.routedTransfers,
    transfers: event.transfers.slice(0, 20),
    involvedWallets: event.involvedWallets,
    tokens: event.tokens
  };
}

function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(8));
}
