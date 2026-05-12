const els = {
  updated: document.querySelector("#last-updated"),
  pnl: document.querySelector("#metric-pnl"),
  wallets: document.querySelector("#metric-wallets"),
  tokens: document.querySelector("#metric-tokens"),
  routed: document.querySelector("#metric-routed"),
  workflowSource: document.querySelector("#workflow-source"),
  workflowToken: document.querySelector("#workflow-token"),
  workflowDestination: document.querySelector("#workflow-destination"),
  workflowLedger: document.querySelector("#workflow-ledger"),
  focusSymbol: document.querySelector("#focus-symbol"),
  focusCa: document.querySelector("#focus-ca"),
  focusCopy: document.querySelector("#focus-copy"),
  focusMeta: document.querySelector("#focus-meta"),
  railReadiness: document.querySelector("#rail-readiness"),
  railMeta: document.querySelector("#rail-meta"),
  routesBody: document.querySelector("#routes-body"),
  walletsBody: document.querySelector("#wallets-body"),
  tokensBody: document.querySelector("#tokens-body"),
  events: document.querySelector("#event-stream"),
  toast: document.querySelector("#toast")
};

let snapshot = null;
let selectedMint = null;
let activeParams = null;

async function loadSnapshot() {
  const cacheBust = Date.now();
  const [snapshotResponse, paramsResponse] = await Promise.all([
    fetch(`data/snapshot.json?ts=${cacheBust}`, { cache: "no-store" }),
    fetch(`active-copytrade-parameters.json?ts=${cacheBust}`, { cache: "no-store" }).catch(() => null)
  ]);

  if (!snapshotResponse.ok) throw new Error(`Snapshot HTTP ${snapshotResponse.status}`);
  snapshot = await snapshotResponse.json();
  activeParams = paramsResponse?.ok ? await paramsResponse.json() : null;
  selectedMint ||= Object.keys(snapshot.tokens ?? {})[0] ?? null;
  render();
}

function render() {
  const stats = snapshot.stats ?? {};
  els.updated.textContent = snapshot.generatedAt ? `Updated ${formatDate(snapshot.generatedAt)}` : "Snapshot ready";
  els.pnl.textContent = usd(stats.estimatedPnlUsd);
  els.wallets.textContent = number(stats.walletsObserved);
  els.tokens.textContent = number(stats.tokensObserved);
  els.routed.textContent = number(stats.routedEvents);

  els.workflowSource.textContent = `${snapshot.config?.wallets?.length ?? 0} watched`;
  els.workflowDestination.textContent = shortAddress(snapshot.designatedAddress);
  els.workflowLedger.textContent = usd(stats.estimatedPnlUsd);

  renderFocus();
  renderRailMeta();
  renderRoutes();
  renderWallets();
  renderTokens();
  renderEvents();
}

function renderRailMeta() {
  const params = activeParams ?? {};
  const wallets = params.wallets ?? {};
  const copyRule = params.copy_rule ?? {};
  const cron = params.cron_job ?? {};
  const live = params.live_state ?? {};
  const funding = params.funding ?? {};
  const readiness = params.snapshot?.readiness ?? "Snapshot";

  els.railReadiness.textContent = readiness;
  els.railMeta.innerHTML = [
    railItem("Watched source", addressCell(wallets.watched_source_wallet ?? snapshot.config?.wallets?.[0]?.address)),
    railItem("Trading wallet", addressCell(wallets.trading_wallet)),
    railItem("Destination", addressCell(wallets.destination_wallet ?? snapshot.designatedAddress)),
    railItem("Trigger", `${usd(copyRule.minimum_source_buy_usd)} source buy`),
    railItem("Mirror size", `${usd(copyRule.mirror_buy_usd)} using SOL`),
    railItem("Slippage", `${copyRule.slippage_bps ?? "-"} bps`),
    railItem("Cron", `${cron.enabled ? "enabled" : "unknown"} / ${cron.schedule ?? "-"}`),
    railItem("Last run", cron.last_run_at ? formatDate(cron.last_run_at) : "-"),
    railItem("Cursor", addressCell(live.state_latest_signature)),
    railItem("Trading SOL", `${amount(funding.trading_wallet_sol)} SOL`),
    railItem("Readiness gates", readinessGateCount(params.readiness_gates)),
    railItem("State", live.lock_exists ? "lock active" : "no active lock")
  ].join("");
}

function railItem(label, value) {
  return `
    <div class="rail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${value ?? "-"}</strong>
    </div>
  `;
}

function renderFocus() {
  const token = selectedMint ? snapshot.tokens?.[selectedMint] : null;
  if (!token) {
    els.focusSymbol.textContent = "No token";
    els.focusCa.textContent = "Select a token row";
    els.focusCopy.disabled = true;
    els.focusMeta.innerHTML = "";
    els.workflowToken.textContent = "No CA selected";
    return;
  }

  els.focusSymbol.textContent = `${token.symbol ?? "Token"} / ${token.name ?? "Unknown"}`;
  els.focusCa.textContent = token.mint;
  els.focusCopy.disabled = false;
  els.focusCopy.dataset.copy = token.mint;
  els.workflowToken.textContent = `${token.symbol ?? shortAddress(token.mint)} active`;
  els.focusMeta.innerHTML = metadataList([
    ["Price", token.usdPrice == null ? "Unavailable" : usd(token.usdPrice)],
    ["24h", percent(token.priceChange24h)],
    ["Decimals", token.decimals ?? "-"],
    ["Price block", token.priceBlockId ?? "-"],
    ["Volume", amount(token.absoluteVolume)],
    ["Last seen", token.lastObservedAt ? formatDate(token.lastObservedAt) : "-"]
  ]);
}

function readinessGateCount(gates) {
  const values = Object.values(gates ?? {});
  if (!values.length) return "-";
  const passing = values.filter(Boolean).length;
  return `${passing}/${values.length} passing`;
}

function renderRoutes() {
  const routes = (snapshot.events ?? [])
    .flatMap((event) => (event.routedTransfers ?? []).map((transfer) => ({ event, transfer })));

  els.routesBody.innerHTML = routes.length ? routes.map(({ event, transfer }) => {
    const token = snapshot.tokens?.[transfer.mint] ?? event.tokens?.[transfer.mint] ?? {};
    return `
      <tr>
        <td>${escapeHtml(event.timestamp ? formatDate(event.timestamp) : "-")}</td>
        <td><strong>${escapeHtml(token.symbol ?? shortAddress(transfer.mint))}</strong><br><span class="badge">${escapeHtml(token.name ?? "Unknown")}</span></td>
        <td>${caCell(transfer.mint)}</td>
        <td>${amount(transfer.amount)}</td>
        <td>${addressCell(transfer.from)}</td>
        <td>${addressCell(transfer.to)}</td>
        <td>Slot ${escapeHtml(event.slot ?? "-")}<br>Fee ${amount(event.feeSol)} SOL<br>${addressCell(event.signature)}</td>
      </tr>
    `;
  }).join("") : emptyRow(7);
}

function renderWallets() {
  const wallets = Object.values(snapshot.wallets ?? {})
    .sort((a, b) => Math.abs(b.estimatedPnlUsd ?? 0) - Math.abs(a.estimatedPnlUsd ?? 0));

  els.walletsBody.innerHTML = wallets.length ? wallets.map((wallet) => `
    <tr>
      <td><strong>${escapeHtml(wallet.label ?? "Wallet")}</strong></td>
      <td><span class="badge">${escapeHtml(wallet.role ?? "observed")}</span></td>
      <td>${addressCell(wallet.address)}</td>
      <td>${usd(wallet.currentValueUsd)}</td>
      <td class="${moneyClass(wallet.estimatedPnlUsd)}">${usd(wallet.estimatedPnlUsd)}</td>
    </tr>
  `).join("") : emptyRow(5);
}

function renderTokens() {
  const tokens = Object.values(snapshot.tokens ?? {})
    .sort((a, b) => (b.absoluteVolume ?? 0) - (a.absoluteVolume ?? 0));

  els.tokensBody.innerHTML = tokens.length ? tokens.map((token) => `
    <tr data-mint="${escapeAttr(token.mint)}">
      <td><strong>${escapeHtml(token.symbol ?? "Token")}</strong><br><span class="badge">${escapeHtml(token.name ?? "Unknown")}</span></td>
      <td>${caCell(token.mint)}</td>
      <td>${token.usdPrice == null ? "Unavailable" : usd(token.usdPrice)}<br><span class="${moneyClass(token.priceChange24h)}">${percent(token.priceChange24h)}</span></td>
      <td>${amount(token.absoluteVolume)}</td>
      <td>${escapeHtml(token.priceBlockId ?? "-")}</td>
    </tr>
  `).join("") : emptyRow(5);
}

function renderEvents() {
  const events = snapshot.events ?? [];
  els.events.innerHTML = events.length ? events.slice(0, 10).map((event) => {
    const tokenSymbols = Object.values(event.tokens ?? {}).map((token) => token.symbol ?? shortAddress(token.mint)).join(", ") || "-";
    return `
      <article class="event-row">
        <span><strong>${escapeHtml(event.type ?? "event")}</strong><br>${escapeHtml(event.timestamp ? formatDate(event.timestamp) : "-")}</span>
        <span>Slot ${escapeHtml(event.slot ?? "-")}<br>${escapeHtml(event.status ?? "-")}</span>
        <span>${escapeHtml(tokenSymbols)}<br>${number(event.involvedWallets?.length ?? 0)} wallets</span>
        <span>${addressCell(event.signature)}</span>
      </article>
    `;
  }).join("") : `<article class="event-row"><span>No events loaded</span></article>`;
}

function metadataList(items) {
  return items.map(([key, value]) => `
    <div>
      <dt>${escapeHtml(key)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function caCell(value) {
  return `
    <div class="mono-cell">
      <code>${escapeHtml(value)}</code>
      <button class="small-button" type="button" data-copy="${escapeAttr(value)}">Copy</button>
    </div>
  `;
}

function addressCell(value) {
  if (!value) return "-";
  return `
    <div class="mono-cell">
      <code>${escapeHtml(shortAddress(value))}</code>
      <button class="small-button" type="button" data-copy="${escapeAttr(value)}">Copy</button>
    </div>
  `;
}

function emptyRow(columns) {
  return `<tr><td colspan="${columns}">No data loaded</td></tr>`;
}

function shortAddress(value) {
  if (!value || value.length <= 16) return value || "-";
  return `${value.slice(0, 7)}...${value.slice(-7)}`;
}

function usd(value) {
  return Number(value ?? 0).toLocaleString("en-US", {
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

function number(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function percent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(2)}%`;
}

function moneyClass(value) {
  const numeric = Number(value ?? 0);
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "-");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("show"), 1600);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast("Copied");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

document.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    copyText(copyButton.dataset.copy);
    return;
  }

  const tokenRow = event.target.closest("[data-mint]");
  if (tokenRow) {
    selectedMint = tokenRow.dataset.mint;
    renderFocus();
  }
});

loadSnapshot().catch((error) => {
  els.updated.textContent = error.message;
});

window.setInterval(() => {
  loadSnapshot().catch(() => {});
}, 20000);
