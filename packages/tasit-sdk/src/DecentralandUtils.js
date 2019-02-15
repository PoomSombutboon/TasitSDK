import { ethers } from "ethers";

import { ropsten as ropstenAddresses } from "../../tasit-contracts/decentraland/addresses";
const {
  MarketplaceProxy: MARKETPLACE_ADDRESS,
  MANAToken: MANA_ADDRESS,
} = ropstenAddresses;

// Note: Will be remove after Action Provider fixes
import marketplaceABI from "../../tasit-action/src/abi/Marketplace.json";

export default class DecentralandUtils {
  // Note: Should we create Action.Contract.getABI() function?
  #marketplace;
  #mana;
  #provider;

  constructor() {
    // Using ethers.js because Tasit Action isn't working with ropsten
    // TODO: Fix ProviderFactory
    this.#provider = ethers.getDefaultProvider("ropsten");

    this.#marketplace = new ethers.Contract(
      MARKETPLACE_ADDRESS,
      marketplaceABI,
      this.#provider
    );
  }

  // TODO: Move to static function
  getOpenSellOrders = async fromBlock => {
    const [ordersCreated, ordersCancelled, ordersExecuted] = await Promise.all([
      this.#getCreatedSellOrders(fromBlock),
      this.#getCancelledSellOrders(fromBlock),
      this.#getExecutedSellOrders(fromBlock),
    ]);

    // Open = Created - Cancelled - Executed
    const openOrders = ordersCreated
      .filter(
        created =>
          !ordersCancelled.find(
            cancelled => cancelled.values.id == created.values.id
          )
      )
      .filter(
        created =>
          !ordersExecuted.find(
            executed => executed.values.id == created.values.id
          )
      );

    return openOrders;
  };

  #getCreatedSellOrders = async fromBlock => {
    const { filters } = this.#marketplace;
    const { OrderCreated } = filters;
    const filter = OrderCreated();
    const eventABI = [
      "event OrderCreated(bytes32 id,uint256 indexed assetId,address indexed seller,address nftAddress,uint256 priceInWei,uint256 expiresAt)",
    ];
    return this.#listEventLogs(fromBlock, eventABI, filter);
  };

  #getCancelledSellOrders = async fromBlock => {
    const { filters } = this.#marketplace;
    const { OrderCancelled } = filters;
    const filter = OrderCancelled();
    const eventABI = [
      "event OrderCancelled(bytes32 id,uint256 indexed assetId,address indexed seller,address nftAddress)",
    ];
    return this.#listEventLogs(fromBlock, eventABI, filter);
  };

  #getExecutedSellOrders = async fromBlock => {
    const { filters } = this.#marketplace;
    const { OrderSuccessful } = filters;
    const filter = OrderSuccessful();
    const eventABI = [
      "event OrderSuccessful(bytes32 id,uint256 indexed assetId,address indexed seller,address nftAddress,uint256 totalPrice,address indexed buyer)",
    ];
    return this.#listEventLogs(fromBlock, eventABI, filter);
  };

  #listEventLogs = async (fromBlock, eventABI, filter) => {
    const iface = new ethers.utils.Interface(eventABI);
    const logs = await this.#provider.getLogs({ ...filter, fromBlock });
    return logs.map(log => iface.parseLog(log));
  };
}
