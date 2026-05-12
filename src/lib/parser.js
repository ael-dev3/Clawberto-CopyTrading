import { tokenMetadata } from "./prices.js";

const LAMPORTS_PER_SOL = 1_000_000_000;

export function accountKeys(transaction) {
  const keys = transaction?.transaction?.message?.accountKeys ?? [];
  return keys
    .map((key) => {
      if (typeof key === "string") return key;
      return key?.pubkey;
    })
    .filter(Boolean);
}

export function tokenAmount(uiTokenAmount = {}) {
  if (uiTokenAmount.uiAmountString != null) return Number(uiTokenAmount.uiAmountString);
  if (uiTokenAmount.uiAmount != null) return Number(uiTokenAmount.uiAmount);
  if (uiTokenAmount.amount != null && uiTokenAmount.decimals != null) {
    return Number(uiTokenAmount.amount) / 10 ** Number(uiTokenAmount.decimals);
  }
  return 0;
}

function tokenOwner(balance, keys) {
  return balance.owner || keys[balance.accountIndex] || "unknown";
}

function tokenDeltaKey(owner, mint) {
  return `${owner}::${mint}`;
}

export function extractTokenDeltas(transaction) {
  const keys = accountKeys(transaction);
  const deltas = new Map();

  for (const balance of transaction?.meta?.preTokenBalances ?? []) {
    const owner = tokenOwner(balance, keys);
    const key = tokenDeltaKey(owner, balance.mint);
    const existing = deltas.get(key) ?? {
      owner,
      mint: balance.mint,
      accountIndex: balance.accountIndex,
      decimals: balance.uiTokenAmount?.decimals ?? null,
      preAmount: 0,
      postAmount: 0
    };
    existing.preAmount += tokenAmount(balance.uiTokenAmount);
    deltas.set(key, existing);
  }

  for (const balance of transaction?.meta?.postTokenBalances ?? []) {
    const owner = tokenOwner(balance, keys);
    const key = tokenDeltaKey(owner, balance.mint);
    const existing = deltas.get(key) ?? {
      owner,
      mint: balance.mint,
      accountIndex: balance.accountIndex,
      decimals: balance.uiTokenAmount?.decimals ?? null,
      preAmount: 0,
      postAmount: 0
    };
    existing.postAmount += tokenAmount(balance.uiTokenAmount);
    existing.decimals = existing.decimals ?? balance.uiTokenAmount?.decimals ?? null;
    deltas.set(key, existing);
  }

  return [...deltas.values()]
    .map((delta) => ({
      ...delta,
      delta: roundToken(delta.postAmount - delta.preAmount)
    }))
    .filter((delta) => Math.abs(delta.delta) > 0);
}

export function extractNativeDeltas(transaction) {
  const keys = accountKeys(transaction);
  const pre = transaction?.meta?.preBalances ?? [];
  const post = transaction?.meta?.postBalances ?? [];

  return keys
    .map((owner, index) => ({
      owner,
      preAmount: (pre[index] ?? 0) / LAMPORTS_PER_SOL,
      postAmount: (post[index] ?? 0) / LAMPORTS_PER_SOL,
      delta: roundToken(((post[index] ?? 0) - (pre[index] ?? 0)) / LAMPORTS_PER_SOL)
    }))
    .filter((delta) => Math.abs(delta.delta) > 0);
}

export function buildTokenTransfers(tokenDeltas) {
  const byMint = new Map();
  for (const delta of tokenDeltas) {
    if (!byMint.has(delta.mint)) byMint.set(delta.mint, []);
    byMint.get(delta.mint).push(delta);
  }

  const transfers = [];
  for (const [mint, deltas] of byMint) {
    const senders = deltas
      .filter((delta) => delta.delta < 0)
      .map((delta) => ({ owner: delta.owner, remaining: Math.abs(delta.delta), decimals: delta.decimals }));
    const receivers = deltas
      .filter((delta) => delta.delta > 0)
      .map((delta) => ({ owner: delta.owner, remaining: delta.delta, decimals: delta.decimals }));

    for (const sender of senders) {
      for (const receiver of receivers) {
        if (sender.remaining <= 0) break;
        if (receiver.remaining <= 0) continue;
        const amount = Math.min(sender.remaining, receiver.remaining);
        transfers.push({
          mint,
          from: sender.owner,
          to: receiver.owner,
          amount: roundToken(amount),
          decimals: sender.decimals ?? receiver.decimals ?? null
        });
        sender.remaining = roundToken(sender.remaining - amount);
        receiver.remaining = roundToken(receiver.remaining - amount);
      }
    }
  }

  return transfers;
}

export function walletDirectory(config) {
  const directory = new Map();
  for (const wallet of config.wallets ?? []) {
    if (!wallet.address) continue;
    directory.set(wallet.address, {
      address: wallet.address,
      label: wallet.label ?? wallet.address,
      role: wallet.role ?? "source",
      weight: wallet.weight ?? 1
    });
  }

  directory.set(config.designatedAddress, {
    address: config.designatedAddress,
    label: "Designated destination",
    role: "destination",
    weight: 1
  });

  return directory;
}

export function parseTransactionEvent(transaction, config, prices = {}, signature = "") {
  const keys = accountKeys(transaction);
  const directory = walletDirectory(config);
  const tokenDeltas = extractTokenDeltas(transaction);
  const nativeDeltas = extractNativeDeltas(transaction);
  const transfers = buildTokenTransfers(tokenDeltas);
  const watchedSources = new Set((config.wallets ?? []).map((wallet) => wallet.address));
  const designatedAddress = config.designatedAddress;

  const routedTransfers = transfers.filter(
    (transfer) => transfer.to === designatedAddress && watchedSources.has(transfer.from)
  );

  const involvedWallets = new Set();
  for (const delta of tokenDeltas) involvedWallets.add(delta.owner);
  for (const delta of nativeDeltas) involvedWallets.add(delta.owner);
  for (const transfer of transfers) {
    involvedWallets.add(transfer.from);
    involvedWallets.add(transfer.to);
  }

  const mints = [...new Set(tokenDeltas.map((delta) => delta.mint))];
  const tokenMeta = Object.fromEntries(mints.map((mint) => [mint, tokenMetadata(mint, config, prices)]));
  const watchedTouches = [...directory.keys()].filter((address) => keys.includes(address) || involvedWallets.has(address));

  return {
    id: signature || transaction?.transaction?.signatures?.[0] || "",
    signature: signature || transaction?.transaction?.signatures?.[0] || "",
    slot: transaction?.slot ?? null,
    blockTime: transaction?.blockTime ?? null,
    timestamp: transaction?.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : null,
    status: transaction?.meta?.err ? "failed" : "confirmed",
    feeSol: (transaction?.meta?.fee ?? 0) / LAMPORTS_PER_SOL,
    type: routedTransfers.length > 0 ? "token_to_designated" : "wallet_activity",
    accountCount: keys.length,
    instructionCount: transaction?.transaction?.message?.instructions?.length ?? 0,
    accountsTouched: keys,
    watchedTouches,
    involvedWallets: [...involvedWallets].filter((wallet) => wallet && wallet !== "unknown").map((address) => ({
      address,
      label: directory.get(address)?.label ?? address,
      role: directory.get(address)?.role ?? "observed"
    })),
    tokenDeltas,
    nativeDeltas,
    transfers,
    routedTransfers,
    tokens: tokenMeta,
    prices
  };
}

function roundToken(value) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(12));
}
