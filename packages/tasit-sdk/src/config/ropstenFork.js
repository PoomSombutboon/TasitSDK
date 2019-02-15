const ropstenFork = {
  provider: {
    network: "other",
    provider: "jsonrpc",
    pollingInterval: 250,
    jsonRpc: {
      url: "http://localhost",
      port: 8545,
    },
  },
  events: {
    timeout: 2000,
  },
};

module.exports = ropstenFork;
