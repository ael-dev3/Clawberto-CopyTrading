# Clawberto CopyTrading

Terminal and GitHub Pages dashboard for watching Hermes-linked Solana wallets, tracking tokens routed to a designated address, and estimating wallet/token PnL from observed balance changes.

Live dashboard: https://ael-dev3.github.io/Clawberto-CopyTrading/

## What it does

- Watches configured Hermes/source wallets and the designated destination wallet through Solana JSON-RPC.
- Detects SPL-token movements, token contract addresses, owners, source/destination wallets, signature, slot, timestamp, fee, and observed amount.
- Flags token sends into the designated address as copy-trade routing events.
- Tracks all wallets observed in parsed token/native balance deltas.
- Estimates realized, unrealized, and total PnL using current Jupiter Price API values when prices are available.
- Writes `docs/data/snapshot.json`, which powers the static dashboard hosted by GitHub Pages.

PnL is an estimate, not accounting-grade reporting. It treats observed receives as acquisitions at the current available price and observed sends as disposals against average cost. For exact PnL, backfill historical execution prices from a dedicated indexed data provider.

## Setup

```powershell
Copy-Item config/wallets.example.json config/wallets.json
```

Edit `config/wallets.json`:

- Set `designatedAddress` to the wallet receiving Hermes-routed tokens.
- Add every Hermes/source wallet under `wallets`.
- Optionally set `rpcUrl`, or set `SOLANA_RPC_URL` in your shell.
- Optionally set `JUPITER_PRICE_URL` and `JUPITER_API_KEY` for price requests.

## Run the terminal

Run one scan and update the website snapshot:

```powershell
npm run snapshot
```

Watch continuously:

```powershell
npm run watch -- --interval 20000 --limit 20
```

Useful flags:

- `--config <path>` defaults to `config/wallets.json`, then falls back to `config/wallets.example.json`.
- `--out <path>` defaults to `docs/data/snapshot.json`.
- `--state <path>` defaults to `data/state.json`.
- `--once` exits after one scan.
- `--dry-run` renders the terminal without calling Solana RPC.

## Website

The dashboard is a static site in `docs/`. GitHub Pages deploys through `.github/workflows/pages.yml` on pushes to `main`.

Local static preview:

```powershell
npm run build
```

Then open `docs/index.html`.

## Notes

Jupiter Price API V3 supports current USD prices for up to 50 token mints per request. The watcher uses `https://lite-api.jup.ag/price/v3` by default and adds an `x-api-key` header only when `JUPITER_API_KEY` is present.
