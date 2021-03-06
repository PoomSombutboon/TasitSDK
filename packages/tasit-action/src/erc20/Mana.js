import Contract from "../contract/Contract";
import manaTokenABI from "../abi/MANAToken.json";

export default class Mana extends Contract {
  constructor(address, wallet) {
    const abi = manaTokenABI;
    super(address, abi, wallet);
  }
}
