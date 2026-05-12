import { shortMint } from "./prices.js";

export function renderTerminal(state, config, cycle = {}) {
  const lines = [];
  lines.push("");
  lines.push("CLAWBERTO HERMES COPY-TRADE WATCH");
  lines.push("=".repeat(72));
  lines.push(`Profile: ${state.profileName}`);
  lines.push(`Network: ${state.network}  Destination: ${trim(config.designatedAddress)}`);
  lines.push(`Updated: ${state.generatedAt}  RPC: ${cycle.rpcStatus ?? "idle"}  Prices: ${cycle.priceStatus ?? "idle"}`);
  lines.push("");
  lines.push(`Observed wallets: ${state.stats.walletsObserved}  Tokens: ${state.stats.tokensObserved}  Routed events: ${state.stats.routedEvents}  Est. PnL: ${usd(state.stats.estimatedPnlUsd)}`);
  lines.push("");
  lines.push("TOP WALLETS");
  lines.push(table(
    ["Wallet", "Role", "Value", "Est. PnL"],
    Object.values(state.wallets)
      .sort((a, b) => Math.abs(b.estimatedPnlUsd) - Math.abs(a.estimatedPnlUsd))
      .slice(0, 6)
      .map((wallet) => [wallet.label || trim(wallet.address), wallet.role, usd(wallet.currentValueUsd), usd(wallet.estimatedPnlUsd)])
  ));
  lines.push("");
  lines.push("RECENT ROUTED TOKEN SENDS");
  const routed = state.events
    .flatMap((event) => (event.routedTransfers ?? []).map((transfer) => ({ event, transfer })))
    .slice(0, 8)
    .map(({ event, transfer }) => [
      event.timestamp ? event.timestamp.replace("T", " ").slice(0, 19) : "-",
      shortMint(transfer.mint),
      amount(transfer.amount),
      trim(transfer.from),
      trim(transfer.to),
      trim(event.signature)
    ]);
  lines.push(table(["Time", "CA", "Amount", "From", "To", "Signature"], routed));
  lines.push("");
  lines.push("RECENT EVENTS");
  lines.push(table(
    ["Time", "Type", "Tokens", "Wallets", "Signature"],
    state.events.slice(0, 8).map((event) => [
      event.timestamp ? event.timestamp.replace("T", " ").slice(0, 19) : "-",
      event.type,
      Object.keys(event.tokens ?? {}).map(shortMint).join(", ") || "-",
      (event.involvedWallets ?? []).length,
      trim(event.signature)
    ])
  ));
  lines.push("");
  lines.push("Press Ctrl+C to stop. Snapshot feeds docs/data/snapshot.json.");
  return lines.join("\n");
}

function table(headers, rows) {
  const safeRows = rows.length > 0 ? rows : [["-", "-", "-", "-", "-", "-"].slice(0, headers.length)];
  const widths = headers.map((header, index) => {
    const cells = safeRows.map((row) => String(row[index] ?? ""));
    return Math.min(24, Math.max(header.length, ...cells.map((cell) => cell.length)));
  });

  const renderRow = (row) => row
    .map((cell, index) => fit(String(cell ?? ""), widths[index]))
    .join("  ");

  return [
    renderRow(headers),
    widths.map((width) => "-".repeat(width)).join("  "),
    ...safeRows.map(renderRow)
  ].join("\n");
}

function fit(value, width) {
  if (value.length <= width) return value.padEnd(width, " ");
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function trim(value) {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function usd(value) {
  const numeric = Number(value ?? 0);
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });
}

function amount(value) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 6
  });
}
