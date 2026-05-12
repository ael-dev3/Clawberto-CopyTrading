const DEFAULT_SOL_MINT = "So11111111111111111111111111111111111111112";

export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function fetchPrices(mints, config) {
  const uniqueMints = [...new Set(mints.filter(Boolean))];
  if (uniqueMints.length === 0) return {};

  const priceUrl = config.priceUrl || "https://lite-api.jup.ag/price/v3";
  const headers = {};
  if (config.jupiterApiKey) headers["x-api-key"] = config.jupiterApiKey;

  const results = {};
  for (const group of chunk(uniqueMints, 50)) {
    const url = new URL(priceUrl);
    url.searchParams.set("ids", group.join(","));
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Price request failed with HTTP ${response.status}`);
    }
    Object.assign(results, await response.json());
  }

  return results;
}

export function tokenMetadata(mint, config, prices = {}) {
  const configured = config.tokens?.[mint] ?? {};
  const priced = prices[mint] ?? {};
  const isSol = mint === DEFAULT_SOL_MINT;

  return {
    mint,
    symbol: configured.symbol ?? (isSol ? "SOL" : shortMint(mint)),
    name: configured.name ?? (isSol ? "Wrapped SOL" : "Unknown token"),
    image: configured.image ?? configured.logoURI ?? configured.icon ?? priced.image ?? priced.logoURI ?? priced.icon ?? null,
    decimals: configured.decimals ?? priced.decimals ?? null,
    usdPrice: priced.usdPrice ?? null,
    priceChange24h: priced.priceChange24h ?? null,
    priceBlockId: priced.blockId ?? null
  };
}

export function shortMint(mint) {
  if (!mint || mint.length < 12) return mint || "UNKNOWN";
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}
