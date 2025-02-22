import { baseEncode } from "@near-js/utils";
import { getBytes, sha256 } from "ethers";
import { Buffer } from 'buffer';

import { OmniAPI, OmniHelperContract, OmniHotContract } from "@/config";
import { TGAS } from "@/utils";
import { tokens } from "../config";

export const depositToken = async (nearConnection, accountId, tokenContract, tokenAmount, tokenDecimals) => {
  const args = {
    contractId: tokenContract,
    method: "ft_transfer_call",
    args: {
      amount: String(tokenAmount * 10**tokenDecimals),
      receiver_id: OmniHotContract,
      msg: getOmniAddress(accountId) },
    deposit: 1n,
    gas: 80n * TGAS,
  };
  return await nearConnection.callMethod(args);
};

export const withdrawToken = async (nearConnection, accountId, tokenContract, tokenId, tokenAmount, tokenDecimals) => {
  const needReg = await nearConnection.viewMethod({
    contractId: tokenContract,
    method: "storage_balance_of",
    args: { account_id: accountId },
  });
  const args = {
    contractId: OmniHotContract,
    method: "withdraw_on_near",
    args: {
      account_id: getOmniAddress(accountId),
      token_id: tokenId,
      amount: String(tokenAmount * 10**tokenDecimals),
    },
    deposit: needReg == null ? 5000000000000000000000n : 1n,
    gas: 80n * TGAS,
  };
  return await nearConnection.callMethod(args);
};

export const getOmniAddress = (address) => {
  return baseEncode(getBytes(sha256(Buffer.from(address, "utf8"))));
}

export const getOmniBalances = async (nearConnection, signedAccountId) => {
  const balances = await nearConnection.viewMethod({
    args: { account_id: getOmniAddress(signedAccountId) },
    method: "get_balance",
    contractId: OmniHotContract,
  });

  return balances;
};

export const getActiveWithdrawals = async (nearConnection, accountId) => {
  const nonces = await nearConnection.viewMethod({
      contractId: OmniHelperContract,
      method: "get_withdrawals",
      args: { account_id: getOmniAddress(accountId) },
  });
  let withdrawals = [];
  const promises = nonces.map(async (nonce) => {
      // More then 17 days -> expired nonce (non-refundable)
      if (+nonce <= 1.728526736e+21)
          return;
      const currentNonce = Date.now() * 1000000000;
      const daysAgo = (currentNonce - +nonce) / 1000000000000 / 3600 / 24;
      if (daysAgo >= 16)
          return;
      const transfer = await nearConnection.viewMethod({ method: "get_transfer", contractId: OmniHotContract, args: { nonce } });
      if (transfer == null)
          return;
      // const isUsed = await this.isWithdrawUsed(transfer.chain_id, nonce);
      const isUsed = false; // Only for NEAR chain
      if (isUsed)
          return;
      console.log({ daysAgo });
      withdrawals.push({
          receiver: transfer.receiver_id,
          amount: transfer.amount,
          token: transfer.token_id,
          chain: transfer.chain_id,
          nonce: String(nonce),
          timestamp: Date.now(),
          completed: false,
      });
  });
  await Promise.allSettled(promises);
  
  for (let pending of withdrawals) {
    if (pending.chain === 1010) {
      await finishWithdrawal(nearConnection, pending.nonce);
    }
  }
};

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
  return getOmniAddress(accountId);
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

export const finishWithdrawal = async (nearConnection, nonce) => {
  /*const transfer = */await nearConnection.viewMethod({
    contractId: OmniHotContract,
    method: "get_transfer",
    args: { nonce },
  });

  if (isWithdrawNonceExpired(nonce)) {
    await cancelWithdraw(nearConnection, nonce);
    return;
  }

  // THis stuff for other chains, not NEAR
  // if (await isWithdrawUsed(transfer.chain_id, nonce)) {
  //   throw "Already claimed";
  // }
}