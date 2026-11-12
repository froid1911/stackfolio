/**
 * Mainnet tokens we can price without anyone's help: their CoinGecko ids
 * are stable public knowledge. Used twice — register-missing-assets stamps
 * them onto new registry rows, and fetch-prices falls back to them for rows
 * registered before the stamp existed. Only addresses held with certainty;
 * a wrong id misprices a real balance, an absent id only costs a blank.
 * Keys are lowercase eip155 identifiers.
 */
export const KNOWN_COINGECKO_IDS: Record<string, string> = {
  "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "usd-coin",
  "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7": "tether",
  "eip155:1/erc20:0x6b175474e89094c4410ab59efe4b8bc6757355b7": "dai",
  "eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599":
    "wrapped-bitcoin",
  "eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "weth",
  "eip155:1/erc20:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "wrapped-steth",
  "eip155:1/erc20:0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "staked-ether",
  "eip155:1/erc20:0xae78736cd615f374d3085123a210448e74fc6393":
    "rocket-pool-eth",
  "eip155:1/erc20:0x514910771af9ca656af840dff83e8264ecf986ca": "chainlink",
  "eip155:1/erc20:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "aave",
  "eip155:1/erc20:0xd533a949740bb3306d119cc777fa900ba034cd52":
    "curve-dao-token",
  "eip155:1/erc20:0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": "maker",
};

/** The CoinGecko id of a known mainnet token, or undefined. */
export function knownCoingeckoId(identifier: string): string | undefined {
  return KNOWN_COINGECKO_IDS[identifier.toLowerCase()];
}
