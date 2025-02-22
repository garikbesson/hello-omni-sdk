const contractPerNetwork = {
  mainnet: 'hello.near-examples.near',
  testnet: 'hello.near-examples.testnet',
};

// Chains for EVM Wallets
const evmWalletChains = {
  mainnet: {
    chainId: 397,
    name: 'Near Mainnet',
    explorer: 'https://eth-explorer.near.org',
    rpc: 'https://eth-rpc.mainnet.near.org',
  },
  testnet: {
    chainId: 398,
    name: 'Near Testnet',
    explorer: 'https://eth-explorer-testnet.near.org',
    rpc: 'https://eth-rpc.testnet.near.org',
  },
};

export const tokens = {
  usdt: {
    near: {
      address: 'usdt.tether-token.near',
      decimals: 6,
      omniAddress: 'YstfWsCY5nxES8LjochRc8ne1dRph7',
      amount: 1000n,
      id: 9,
      chain: 1010
    },
    solana: {},
  },
};

export const NetworkId = 'mainnet';
export const HelloNearContract = contractPerNetwork[NetworkId];
export const OmniHotContract = 'v1-1.omni.hot.tg';
export const EVMWalletChain = evmWalletChains[NetworkId];