# Active Copytrade Parameters

Snapshot: `2026-05-12T12:31:02+0200` / `2026-05-12T10:31:02Z`

## Status

- Readiness: `READY`
- Manual probe: `NO_ACTION`
- Cron last status: `ok`
- Cron enabled: `true`
- Active lock: `false`
- Pending source transactions since cursor: `false`
- Pending unresolved copytrade events: `0`

## Wallets

- Watched source wallet: `G2hakrb8bXncV4fcmYbQLLQujpXcSmQ86CbKchDYgf4b`
- Trading wallet: `2oVttN9jEjLnLvWs7oHW4x9MxXK52X9hcPRkhqWKm5MF`
- Destination wallet: `GT8time2YjDGmk3ehNjqkUgsQk69QCVMBjpSDjXB9eY6`
- Trading wallet SOL balance: `1.129857162 SOL`
- Keychain check: derived pubkey matches trading wallet
- Keychain labels only: service `Hermes Solana Trading Wallet`, account `trading-wallet`

No private key or seed material is committed here.

## Copy Rule

- Trigger: watched wallet buys any copytradable SPL token with estimated spend `>= $500`
- Mirror action: buy same mint with `$1` of SOL
- Token destination: `GT8time2YjDGmk3ehNjqkUgsQk69QCVMBjpSDjXB9eY6`
- Cleanup: close zero-balance trading-wallet SPL token accounts for rent reclaim
- Slippage: `1500 bps`
- Max priority fee: `100000 lamports`
- Max events per cron run: `5`

Skip targets:

- WSOL/SOL
- USDC
- USDT
- Likely NFTs: `decimals == 0 && amount == 1`

Stable mint constants:

- WSOL: `So11111111111111111111111111111111111111112`
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- USDT: `Es9vMFrzaCERmJfrF4H2FYD4V57LnS3rE7vmYhA64cnC`

## Cron Job

- Job ID: `70df6cc10452`
- Name: `solana-copytrade-g2hak-500usd-watch`
- Schedule: `every 1m`
- Repeat: `forever`
- Delivery: `local`
- State: `scheduled`
- Last run: `2026-05-12T12:30:24.744323+02:00`
- Next run: `2026-05-12T12:31:24.744323+02:00`
- Last delivery error: `null`
- Script: `~/.hermes/scripts/solana_copytrade_cron.py`
- Executor: `~/.hermes/scripts/copytrade_solana_node/copytrade_solana_executor.cjs`
- State file: `~/.hermes/state/solana-copytrade-g2hak-state.json`
- Lock file: `~/.hermes/state/solana-copytrade-g2hak.lock`
- Notification target on trade/error: `discord:Clawberto Madness / #general / CopyTrading / topic 1503677642551857212`

## Live Cursor

- Source latest signature: `TQNaiPV2PhbH1yDSsX6jAqEBVEXvGMQKR8SEsXDd3YQrg9u2jGn8aubwvUnj2smqaSfceKYyY12PBimQELeNUzM`
- State latest signature: `TQNaiPV2PhbH1yDSsX6jAqEBVEXvGMQKR8SEsXDd3YQrg9u2jGn8aubwvUnj2smqaSfceKYyY12PBimQELeNUzM`
- Cursor matches source latest: `true`
- Processed signature count: `0`
- Event status counts: `{}`
- State initialized: `2026-05-12T09:03:11.110Z`
- State updated: `2026-05-12T09:03:11.110Z`

## Readiness Gates

- `cron_enabled`: pass
- `last_cron_status_ok`: pass
- `keychain_pubkey_verified`: pass
- `trading_wallet_funded`: pass
- `state_cursor_matches_source_latest`: pass
- `no_pending_unresolved_events`: pass
- `no_active_lock`: pass
- `executor_exists`: pass
- `wrapper_exists`: pass

Final readiness: ready to copytrade future qualifying buys.
