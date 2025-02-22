import { baseEncode } from "@near-js/utils";
import { getBytes, sha256 } from "ethers";
import { Buffer } from 'buffer';

import { OmniAPI, OmniHelperContract, OmniHotContract } from "@/config";
import { TGAS } from "@/utils";
import { tokens } from "../config";

export const isWithdrawNonceExpired = (nonce) => {
  // Only for NEAR. For TON we need different time value
  const time = 480_000;
  const ts = BigInt(nonce) / 1000000000000n;
  return Date.now() - Number(ts) * 1000 > time;
};

const timeLeftForRefund = (nonce) => {
  const ts = BigInt(nonce) / 1000000000000n;
  const time = Date.now() - Number(ts) * 1000;
  return Math.max(0, 602_000 - time);
}

const getReceiverRaw = (/* chain: Network */accountId) => {
  return baseEncode(getBytes(sha256(Buffer.from(accountId, "utf8"))));
  // if (chain === Network.Near) return baseEncode(getBytes(sha256(Buffer.from(this.signers.near.accountId, "utf8"))));

  // if (chain === Network.Solana) {
  //   if (this.signers.solana == null) throw "Connect Solana";
  //   return this.signers.solana.publicKey.toBase58();
  // }

  // if (chain === Network.Ton) {
  //   if (this.signers.ton == null) throw "Connect TON";
  //   const id = generateUserId(Address.parse(this.signers.ton.address), 0n);
  //   return baseEncode(bigintToBuffer(id, 32));
  // }

  // if (getChain(chain).isEvm) {
  //   if (this.signers.evm == null) throw "Connect EVM";
  //   return baseEncode(getBytes(this.signers.evm.address));
  // }

  // throw `Unsupported chain address ${chain}`;
}

const refundSign = async (chain, nonce, receiver_id, token_id, amount) => {
  const res = await fetch(`${OmniAPI}/refund/sign`, {
    headers: { "Content-type": "application/json" },
    body: JSON.stringify({ receiver_id, token_id, amount, nonce, chain_from: chain }),
    method: "POST",
  });

  const { signature } = (await res.json());
  return signature;
}

export const cancelWithdraw = async (nearConnection, nonce) => {
  const transfer = await nearConnection.viewMethod({
    contractId: OmniHotContract,
    method: "get_transfer",
    args: { nonce },
  });

  if (transfer === null) throw "Withdraw pending not found";
  const isExpired = isWithdrawNonceExpired(transfer.chain_id, nonce);
  if (isExpired === false) throw "nonce does not expire yet";

  const timeToRefund = timeLeftForRefund(nonce);
  if (timeToRefund > 0) throw `Refund will be available in ${timeToRefund} seconds.`;

  const receiver = getReceiverRaw(transfer.receiver);
  // const token = await this.token(transfer.token_id).metadata(transfer.chain_id);
  const signature = await refundSign(/*transfer.chain_id,*/1010, nonce, receiver, tokens.usdt.near.omniAddress, transfer.amount);

  await this.signers.near.functionCall({
    contractId: OmniHotContract,
    methodName: "refund",
    gas: 120n * TGAS,
    attachedDeposit: 0n,
    args: {
      chain_id: 1010, // transfer.chain_id,
      helper_contract_id: OmniHelperContract,
      nonce: nonce,
      signature,
    },
  });

  return transfer;
}