---
name: copytrading-rails
description: "Use when building or operating Clawberto copytrading flows across Solana wallets: watch source trades, filter by spend threshold, execute tiny mirror buys, forward copied tokens, clean token-account rent, and keep cron/state/idempotency safe."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [copytrading, solana, jupiter, cron, wallet, keychain, spl-token]
    related_skills: [macos-keychain-secrets, solana-wallet-cleanup]
---

# Copytrading Rails

## Overview

This skill documents the operational rails for Clawberto copytrading. The current live rail is a Solana watcher that follows a source wallet, detects qualifying buys, mirrors the token with a fixed tiny size, forwards the copied tokens to a recipient wallet, then reclaims token-account rent by closing empty SPL accounts.

The point is not to invent a trading strategy. Ael gives the policy. Hermes implements it deterministically, with state, retries, key hygiene, and clear success/error reporting.

Current live policy captured by this repo:

- Watch wallet: `G2hakrb8bXncV4fcmYbQLLQujpXcSmQ86CbKchDYgf4b`
- Trading wallet: `2oVttN9jEjLnLvWs7oHW4x9MxXK52X9hcPRkhqWKm5MF`
- Destination wallet: `GT8time2YjDGmk3ehNjqkUgsQk69QCVMBjpSDjXB9eY6`
- Trigger: source wallet buys any copytradable SPL token with estimated spend `>= $500`
- Action: buy the same mint with `$1` of SOL from the trading wallet
- Post-action: send all copied output tokens to destination wallet immediately
- Cleanup: close zero-balance SPL token accounts to reclaim rent, Solana-Incinerator-style
- Runtime: single recurring Hermes cron job, with persistent state and lock file

## When to Use

Use this skill when:

- Ael asks to build, repair, audit, or extend a copytrading bot.
- Ael gives a wallet to follow and a mirror-trade rule.
- A cron/job needs to monitor chain activity and execute copy trades.
- A workflow needs local wallet signing from macOS Keychain.
- A workflow needs Solana-Incinerator-like cleanup after SPL token trades.

Do not use this skill for:

- giving financial advice or inventing entry/exit logic
- unfixed spend sizes without explicit Ael limits
- executing trades from a wallet whose key source is not verified
- public/group leakage of private keys, seed phrases, or raw signing payloads
- burning NFTs or unrelated nonzero token balances as “cleanup”

## Hard Rails

### 1. Key rail

The trading wallet private key must stay in macOS Keychain only.

Current convention:

```text
service: Hermes Solana Trading Wallet
account: trading-wallet
expected pubkey: 2oVttN9jEjLnLvWs7oHW4x9MxXK52X9hcPRkhqWKm5MF
```

Every executor must derive the public key from the Keychain secret before signing and hard-fail if it does not match the expected trading wallet.

Never:

- print the private key
- write the key to a repo, env file, state file, or shell history
- paste signing material into Discord/Telegram
- continue if derived pubkey mismatches expected pubkey

### 2. State rail

A copytrader must be idempotent. Persist state outside chat memory.

Current live state path:

```text
~/.hermes/state/solana-copytrade-g2hak-state.json
```

State must track:

- latest processed watched-wallet signature
- processed signatures map
- event IDs as `<watched_signature>:<mint>`
- per-event status: `bought_not_sent` or `sent`
- swap signature
- transfer signatures
- cleanup close signatures
- timestamp and sanitized error if incomplete

If a run buys but fails to transfer, the next run must resume at `bought_not_sent` and transfer existing balance. It must not buy again.

### 3. Lock rail

Cron can overlap if an RPC/Jupiter call hangs. Use a lock file.

Current live lock path:

```text
~/.hermes/state/solana-copytrade-g2hak.lock
```

If the lock is fresh, exit with `LOCKED`. If the lock is stale, clear and continue. A stale threshold around 10 minutes is reasonable for a 1-minute watcher.

### 4. Delivery rail

High-frequency cron jobs must not spam chat.

Use `deliver: local` for the cron job. The cron prompt should explicitly call `send_message` only for:

- `TRADE_EXECUTED`
- `ERROR`
- material `WARN`

Routine statuses stay local only:

- `NO_ACTION`
- `NO_SIGNATURES`
- `INIT_BASELINE`
- `LOCKED`

### 5. Spend rail

The mirror buy is fixed at `$1`, not a percentage. Keep this as a config constant until Ael changes it.

Default live config:

```text
thresholdUsd = 500
buyUsd = 1
slippageBps = 1500
priorityFeeLamports = 100000
maxEventsPerRun = 5
```

Before swapping, verify the trading wallet has enough SOL for input, priority fee, network fee, and ATA rent.

## Detecting Qualifying Buys

Use Solana parsed transactions from the watched wallet.

1. Fetch recent signatures for the watched wallet.
2. Stop when the stored cursor/latest signature is reached.
3. Process oldest-to-newest so cursor advancement is safe.
4. Fetch each parsed transaction with `maxSupportedTransactionVersion: 0`.
5. Ignore failed transactions.
6. Compute watched-wallet token deltas from `preTokenBalances` and `postTokenBalances`, filtered by `owner == watchedWallet`.
7. Compute watched-wallet SOL lamport delta from account balances.
8. Estimate spend in USD:
   - USDC outflow: raw amount / 1e6
   - USDT outflow: raw amount / 1e6
   - SOL or WSOL outflow: quote SOL to USDC through Jupiter
   - other token outflow: quote token to USDC through Jupiter when route exists
9. If max estimated spend is below threshold, mark no action.
10. For positive token deltas, copy each mint that is copytradable.

Skip these as mirror targets:

- WSOL
- USDC
- USDT
- `decimals == 0 && amount == 1`, likely NFT/collectible
- anything with no positive token delta for the watched wallet

Do not rely only on instruction names. Many Solana swaps are aggregator/versioned/cpi-heavy. Balance deltas are the useful source of truth.

## Executing Mirror Buys

Use Jupiter for route discovery and swap transaction construction.

Quote rail:

```text
inputMint = So11111111111111111111111111111111111111112  # WSOL/SOL
outputMint = watched buy mint
amount = lamports equivalent of $1 by current SOL/USDC Jupiter quote
slippageBps = configured slippage
```

Swap rail:

```text
wrapAndUnwrapSol = true
dynamicComputeUnitLimit = true
priorityLevel = medium
max priority fee = configured priorityFeeLamports
```

Signing rail:

- deserialize Jupiter `swapTransaction`
- sign locally with Keychain-loaded trading wallet
- `sendRawTransaction`
- poll signature status until confirmed/finalized or timeout
- record swap signature before attempting transfer

If swap succeeds but the process dies before transfer, state must remain `bought_not_sent`.

## Sending Copied Tokens

After swap confirmation:

1. Query trading wallet token accounts for the copied mint.
2. Sum nonzero initialized accounts.
3. Create the destination ATA if missing.
4. Transfer the full raw balance to the destination wallet.
5. Close the now-empty source token account in the same transaction where practical.
6. Record all transfer signatures.

Destination wallet:

```text
GT8time2YjDGmk3ehNjqkUgsQk69QCVMBjpSDjXB9eY6
```

The trading wallet should not keep the copied token unless transfer fails. If transfer fails after buy, retry transfer on the next cron run without rebuying.

## Cleanup Rail

“Solana Incinerator” in this context means rent reclaim, not magical fee recovery.

Safe cleanup after each copied trade:

- close zero-balance SPL token accounts owned by the trading wallet
- reclaim rent to the trading wallet
- record close signatures

Do not burn or close:

- nonzero unrelated positions
- NFTs or zero-decimal one-of-one accounts
- frozen token accounts
- token accounts not owned by the trading wallet
- the destination wallet’s accounts

For broad wallet cleanup, use the stronger Solana wallet cleanup flow separately. The copytrade cron should only perform bounded post-trade cleanup.

## Live Hermes Cron Rail

Current live cron job:

```text
name: solana-copytrade-g2hak-500usd-watch
job_id: 70df6cc10452
schedule: every 1m
deliver: local
script: ~/.hermes/scripts/solana_copytrade_cron.py
node executor: ~/.hermes/scripts/copytrade_solana_node/copytrade_solana_executor.cjs
state: ~/.hermes/state/solana-copytrade-g2hak-state.json
```

The Python cron script is a wrapper. It runs the Node executor from its dependency directory so `@solana/web3.js`, `@solana/spl-token`, and `bs58` resolve locally.

The executor owns the whole action loop:

1. acquire lock
2. load Keychain key
3. verify derived pubkey
4. load state
5. fetch watched wallet signatures
6. detect qualifying buys
7. quote and buy through Jupiter
8. transfer copied token to destination
9. close empty SPL token accounts
10. update state
11. emit sanitized JSON

The cron prompt then decides notification only. No action is required from Ael unless an error/blocker is posted.

## Output Statuses

Expected sanitized JSON statuses:

```text
INIT_BASELINE     state initialized to latest source wallet signature
NO_ACTION         no new qualifying watched-wallet buy
NO_SIGNATURES     RPC returned no source wallet signatures
LOCKED            previous run still active
TRADE_EXECUTED    copied at least one qualifying event
ERROR             script hit a hard error; needs attention
WARN              nonfatal issue worth surfacing
```

A `TRADE_EXECUTED` message should include:

- watched signature
- mint
- estimated source spend
- swap signature
- transfer signature(s)
- cleanup close signature(s)
- closed account count

An `ERROR` message should include:

- sanitized error text
- state path
- no private key, no raw transaction payloads

## Common Failure Modes

1. **Jupiter quote says token not tradable.** No mirror buy can happen. Keep cursor handling safe and report if it blocks a qualifying event.

2. **Swap succeeds but transfer fails.** State must be `bought_not_sent`. Next run transfers existing copied balance, not another $1 buy.

3. **Insufficient SOL.** Hard error. Report the SOL balance/needed lamports if available, without suggesting random commands.

4. **RPC 429/timeouts.** Retry boundedly. Do not mark a qualifying event processed if execution did not finish.

5. **Cursor advanced too early.** This loses trades. Only advance cursor after a signature is fully classified and any required action is complete or safely persisted.

6. **Cron chat spam.** Use local delivery and conditional `send_message` only for trade/error.

7. **Wrong USDC mint.** Correct Solana USDC mint is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

8. **Burning instead of closing.** Routine post-copy cleanup should close empty accounts. Burning nonzero tokens is only for explicit broad cleanup flows.

## Verification Checklist

- [ ] Keychain lookup succeeds without printing the private key.
- [ ] Derived trading pubkey equals `2oVttN9jEjLnLvWs7oHW4x9MxXK52X9hcPRkhqWKm5MF`.
- [ ] Baseline cursor exists before live monitoring starts.
- [ ] Normal no-op run emits `NO_ACTION` and does not message chat.
- [ ] Cron job is enabled and scheduled every minute.
- [ ] Cron delivery is local to avoid routine spam.
- [ ] Trade notifications target the CopyTrading thread only on execution/error.
- [ ] State file records event status before and after transfer.
- [ ] Cleanup closes only zero-balance trading-wallet token accounts.
- [ ] Repo docs contain no private keys or seed material.
