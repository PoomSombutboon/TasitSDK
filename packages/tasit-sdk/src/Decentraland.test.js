import { expect, assert } from "chai";

import { Account, Action } from "./TasitSdk";
const { ERC20, ERC721, Marketplace, ConfigLoader } = Action;
const { Mana } = ERC20;
const { Estate, Land } = ERC721;
const { Decentraland: DecentralandMarketplace } = Marketplace;

import config from "./config/ropstenFork";

import { ropsten as ropstenAddresses } from "../../tasit-contracts/decentraland/addresses";
const {
  MarketplaceProxy: MARKETPLACE_ADDRESS,
  LANDProxy: LAND_ADDRESS,
  MANAToken: MANA_ADDRESS,
  EstateProxy: ESTATE_ADDRESS,
} = ropstenAddresses;

import DecentralandUtils from "./DecentralandUtils";
// The goal of this integration test suite is to use only exposed classes
// from TasitSdk. ProviderFactory is used here as an exception
// as the clearest way to get a provider
// in this test suite. Eventually, maybe ProviderFactory may move to
// some shared helper dir.
import ProviderFactory from "tasit-action/dist/ProviderFactory";
import {
  createSnapshot,
  revertFromSnapshot,
  confirmBalances,
  gasParams,
  setupWallets,
  addressesAreEqual,
  bigNumberify,
  etherFaucet,
  ropstenManaFaucet,
  constants,
} from "./testHelpers/helpers";

const { ONE, TEN, BILLION } = constants;

// Work in progress
describe.skip("Decentraland tasit app test cases", () => {
  let ownerWallet;
  let ephemeralWallet;
  let manaContract;
  let landContract;
  let estateContract;
  let marketplaceContract;
  let landForSale;
  let estateForSale;
  let snapshotId;
  let provider;

  before("", async () => {
    ConfigLoader.setConfig(config);

    manaContract = new Mana(MANA_ADDRESS);
    landContract = new Land(LAND_ADDRESS);
    estateContract = new Estate(ESTATE_ADDRESS);
    marketplaceContract = new DecentralandMarketplace(MARKETPLACE_ADDRESS);

    const decentralandUtils = new DecentralandUtils();
    const { getOpenSellOrders } = decentralandUtils;

    const fromBlock = 0;
    const openSellOrders = await getOpenSellOrders(fromBlock);

    // Note: The exact amount of land isn't predictable since we are forking from the latest block
    expect(openSellOrders).to.not.be.empty;

    // Pick a land and an estate sell orders
    for (let sellOrder of openSellOrders) {
      const { values: order } = sellOrder;
      const { nftAddress, expiresAt } = order;

      if (landForSale && estateForSale) break;

      const isLand = addressesAreEqual(nftAddress, LAND_ADDRESS);
      const isEstate = addressesAreEqual(nftAddress, ESTATE_ADDRESS);
      const isExpired = Number(expiresAt) < Date.now();

      // All lands are expired
      if (isLand) landForSale = order;
      if (isEstate && isExpired) estateForSale = order;

      if (!isLand && !isEstate)
        expect(
          false,
          "All land for sale should be a land or an estate NFT"
        ).to.equal(true);
    }

    expect(estateForSale).to.not.be.an("undefined");
    expect(landForSale).to.not.be.an("undefined");
  });

  beforeEach(
    "buyer approve marketplace contract to transfer tokens on their behalf",
    async () => {
      provider = ProviderFactory.getProvider();
      snapshotId = await createSnapshot(provider);

      // Note: Wallets setup was moved to here from before() hook as workaround solution
      // because ephemeral mana balance was remained the same even after reverting snapshot
      ({ ownerWallet, ephemeralWallet } = setupWallets());
      expect(ownerWallet.address).to.have.lengthOf(42);
      expect(ephemeralWallet.address).to.have.lengthOf(42);

      await etherFaucet(provider, ownerWallet, ephemeralWallet, ONE);

      await confirmBalances(manaContract, [ephemeralWallet.address], [0]);

      await ropstenManaFaucet(provider, ownerWallet, ephemeralWallet, BILLION);

      await confirmBalances(manaContract, [ephemeralWallet.address], [BILLION]);

      manaContract.setWallet(ephemeralWallet);
      const approvalAction = manaContract.approve(MARKETPLACE_ADDRESS, BILLION);
      await approvalAction.waitForNonceToUpdate();

      const allowance = await manaContract.allowance(
        ephemeralWallet.address,
        MARKETPLACE_ADDRESS
      );

      expect(`${allowance}`).to.equal(`${BILLION}`);
    }
  );

  afterEach("", async () => {
    await revertFromSnapshot(provider, snapshotId);
  });

  it("should get land for sale info (without wallet)", async () => {
    const { assetId } = landForSale;

    const metadataPromise = landContract.tokenMetadata(assetId);
    const coordsPromise = landContract.decodeTokenId(assetId);
    const [metadata, coords] = await Promise.all([
      metadataPromise,
      coordsPromise,
    ]);

    // Note: Metadata could be an empty string
    expect(metadata).to.not.be.null;

    const [x, y] = coords;
    expect(coords).to.not.include(null);
    expect(x.toNumber()).to.be.a("number");
    expect(y.toNumber()).to.be.a("number");
  });

  it("should get estate for sale info (without wallet)", async () => {
    const { assetId } = estateForSale;

    const metadataPromise = estateContract.getMetadata(assetId);
    const sizePromise = estateContract.getEstateSize(assetId);
    const [metadata, size] = await Promise.all([metadataPromise, sizePromise]);

    // Note: Metadata could be an empty string
    expect(metadata).to.not.be.null;

    expect(size.toNumber()).to.be.a("number");
    expect(size.toNumber()).to.be.at.least(0);
  });

  // TODO: Transfer asset from ephemeral to owner and create a new sell order
  // Note: This test case isn't working. The transaction is been revert and the reason isn't know yet
  // An important issue related to that is the fact of the reversion error isn't be thrown by error events
  it.skip("should buy an estate", async () => {
    const {
      assetId,
      nftAddress,
      seller,
      priceInWei,
      expiresAt,
    } = estateForSale;

    const { address: ephemeralAddress } = ephemeralWallet;

    const expiresTime = Number(expiresAt);
    expect(Date.now()).to.be.below(expiresTime);

    const priceInWeiBN = bigNumberify(priceInWei);

    // Buyer (ephemeral wallet) has enough MANA
    const manaBalance = await manaContract.balanceOf(ephemeralAddress);
    const manaBalanceBN = bigNumberify(manaBalance);
    expect(manaBalanceBN.gt(priceInWeiBN)).to.be.true;

    // Marketplace is approved to transfer Estate asset owned by the seller
    const approvedForAsset = await estateContract.getApproved(assetId);
    const approvedForAll = await estateContract.isApprovedForAll(
      seller,
      MARKETPLACE_ADDRESS
    );
    const approved =
      addressesAreEqual(approvedForAsset, MARKETPLACE_ADDRESS) ||
      approvedForAll;
    expect(approved).to.be.true;

    await confirmBalances(estateContract, [ephemeralWallet.address], [0]);

    const fingerprint = await estateContract.getFingerprint(assetId.toString());
    marketplaceContract.setWallet(ephemeralWallet);
    const executeOrderAction = marketplaceContract.safeExecuteOrder(
      nftAddress,
      `${assetId}`,
      `${priceInWei}`,
      `${fingerprint}`,
      gasParams
    );

    await executeOrderAction.waitForNonceToUpdate();

    await confirmBalances(estateContract, [ephemeralWallet.address], [1]);
  });

  // All land sell orders are expired
  it.skip("should buy a land", async () => {});
});
