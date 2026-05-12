export async function rpcCall(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`RPC ${method} error: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  }

  return payload.result;
}

export function watchedAddresses(config) {
  const addresses = new Set([config.designatedAddress]);
  for (const wallet of config.wallets) {
    if (wallet.address) addresses.add(wallet.address);
  }
  return [...addresses];
}

export async function getSignatures(rpcUrl, address, limit = 12) {
  return rpcCall(rpcUrl, "getSignaturesForAddress", [
    address,
    {
      limit,
      commitment: "confirmed"
    }
  ]);
}

export async function getTransaction(rpcUrl, signature) {
  return rpcCall(rpcUrl, "getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    }
  ]);
}
