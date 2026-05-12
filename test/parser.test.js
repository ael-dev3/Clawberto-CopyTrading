import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenTransfers, extractTokenDeltas, parseTransactionEvent } from "../src/lib/parser.js";

const source = "Src111111111111111111111111111111111111111";
const destination = "Dst111111111111111111111111111111111111111";
const mint = "Mint11111111111111111111111111111111111111";

const transaction = {
  slot: 123,
  blockTime: 1778582400,
  transaction: {
    signatures: ["Sig111"],
    message: {
      accountKeys: [
        { pubkey: source },
        { pubkey: destination },
        { pubkey: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }
      ],
      instructions: [{ programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }]
    }
  },
  meta: {
    err: null,
    fee: 5000,
    preBalances: [1000000000, 1000000000, 1],
    postBalances: [999995000, 1000000000, 1],
    preTokenBalances: [
      {
        accountIndex: 0,
        mint,
        owner: source,
        uiTokenAmount: { uiAmountString: "100", decimals: 6 }
      },
      {
        accountIndex: 1,
        mint,
        owner: destination,
        uiTokenAmount: { uiAmountString: "0", decimals: 6 }
      }
    ],
    postTokenBalances: [
      {
        accountIndex: 0,
        mint,
        owner: source,
        uiTokenAmount: { uiAmountString: "75", decimals: 6 }
      },
      {
        accountIndex: 1,
        mint,
        owner: destination,
        uiTokenAmount: { uiAmountString: "25", decimals: 6 }
      }
    ]
  }
};

test("extractTokenDeltas returns owner-level SPL deltas", () => {
  const deltas = extractTokenDeltas(transaction);

  assert.deepEqual(
    deltas.map((delta) => ({ owner: delta.owner, mint: delta.mint, delta: delta.delta })),
    [
      { owner: source, mint, delta: -25 },
      { owner: destination, mint, delta: 25 }
    ]
  );
});

test("buildTokenTransfers pairs negative and positive token deltas", () => {
  const transfers = buildTokenTransfers(extractTokenDeltas(transaction));

  assert.deepEqual(transfers, [
    {
      mint,
      from: source,
      to: destination,
      amount: 25,
      decimals: 6
    }
  ]);
});

test("parseTransactionEvent flags Hermes sends to the designated address", () => {
  const event = parseTransactionEvent(
    transaction,
    {
      designatedAddress: destination,
      wallets: [{ label: "Hermes", address: source, role: "source" }],
      tokens: {
        [mint]: { symbol: "TST", name: "Test Token", decimals: 6 }
      }
    },
    {
      [mint]: { usdPrice: 2, blockId: 999, decimals: 6 }
    },
    "Sig111"
  );

  assert.equal(event.type, "token_to_designated");
  assert.equal(event.routedTransfers.length, 1);
  assert.equal(event.tokens[mint].symbol, "TST");
  assert.equal(event.feeSol, 0.000005);
});
