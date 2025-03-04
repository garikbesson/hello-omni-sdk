
import { providers } from 'near-api-js';

import { OmniAPI, OmniHelperContract, OmniHotContract } from "@/config";
import { TGAS, getOmniAddress, wait } from "@/utils";
import { chains, tokens } from "@/config";
import getPhantomWalletProvider from "@/wallets/solana/getPhantomWalletProvider";
import { withdraw as solanaWithdraw, isNonceUsed } from '@/wallets/solana/withdraw';
import { deposit as solanaDeposit, parseDeposit as parseSolanaDeposit, clearDepositNonceIfNeeded as clearSolanaDepositNonceIfNeeded } from "@/wallets/solana/deposit";
import {  } from '../wallets/solana/deposit';

const nearProvider = new providers.JsonRpcProvider({ url: 'https://free.rpc.fastnear.com' });

export const depositToken = async (chainId, nearConnection, accountId, tokenContract, tokenAmount, tokenDecimals) => {
  // NEAR
  if (chainId === chains.near.id) {
    const args = {
      contractId: tokenContract,
      method: "ft_transfer_call",
      args: {
        amount: String(BigInt(tokenAmount * 10**tokenDecimals)),
        receiver_id: OmniHotContract,
        msg: getOmniAddress(accountId) },
      deposit: 1n,
      gas: 80n * TGAS,
    };
    return await nearConnection.callMethod(args);
  }

  // Solana
  if (chainId === chains.solana.id) {
    const deposit = await solanaDeposit(accountId, tokenContract, tokenAmount);
    return await finishDeposit(nearConnection, accountId, deposit);
  }
};

export const withdrawToken = async (nearConnection, accountId, chainId, tokenContract, tokenId, tokenAmount) => {
  // NEAR
  if (chainId === chains.near.id) {
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
        amount: String(BigInt(tokenAmount * 10**24)),
      },
      deposit: needReg == null ? 5000000000000000000000n : 1n,
      gas: 80n * TGAS,
    };
    return await nearConnection.callMethod(args);
  }

  const tx = await nearConnection.callMethod({
    contractId: OmniHotContract,
    method: "withdraw",
    deposit: 1n,
    gas: 80n * TGAS,
    args: {
      helper_contract_id: OmniHelperContract,
      receiver_id: await getReceiverRaw(chainId),
      account_id: getOmniAddress(accountId),
      token_id: tokenId,
      chain_id: chainId,
      amount: String(BigInt(tokenAmount * 10**24)),
    },
  });

  const receipt = await nearProvider.txStatusReceipts(
    tx.transaction_outcome.id,
    accountId,
    "EXECUTED"
  );

  const transfer = (() => {
    for (let item of receipt.receipts_outcome) {
      for (let log of item.outcome.logs) {
        const nonce = `${log}`.match(/nonce.....(\d+)/)?.[1];
        const amount = `${log}`.match(/amount.....(\d+)/)?.[1];
        if (nonce && amount) return { amount, nonce };
      }
    }
  })();

  if (transfer == null) {
    throw `Nonce not found, contact support please`;
  }

  await finishWithdrawal(nearConnection, accountId, transfer.nonce);
};

export const getOmniBalances = async (nearConnection, signedAccountId) => {
  const balances = await nearConnection.viewMethod({
    args: { account_id: getOmniAddress(signedAccountId) },
    method: "get_balance",
    contractId: OmniHotContract,
  });

  return balances;
};

// export const getActiveDeposits(): Promise<PendingDeposit[]> {
//   const addresses = [this.signer(Network.Ton), this.signer(Network.Eth), this.signer(Network.Solana)].filter((t) => t != null);
//   const transactions = await OmniApi.shared.findDeposits(addresses);
//   const pendings: PendingDeposit[] = [];
//   let i = 0;

//   for (const tx of transactions) {
//     console.log(`Check ${++i}/${transactions.length}: ${getChain(tx.chain_id).name}: ${tx.hash}`);
//     const deposit = await this.parseDeposit(tx.chain_id, tx.hash).catch((e) => console.log(e));
//     if (deposit) pendings.push(deposit);
//   }

//   return pendings;
// }

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
  console.log(withdrawals);

  return withdrawals;
};

export const isWithdrawNonceExpired = (nonce) => {
  // Only for NEAR, Solana. For TON we need different time value
  const time = 480_000;
  const ts = BigInt(nonce) / 1000000000000n;
  return Date.now() - Number(ts) * 1000 > time;
};

export const isDepositUsed = async (nearConnection, chain, nonce) => {
  return await nearConnection.viewMethod({
    contractId: OmniHotContract,
    method: "is_executed",
    args: { chain_id: chain, nonce: nonce },
  });
}

const isWithdrawUsed = async (chainId, nonce) => {
  if (chainId === chains.solana.id) {
    const provider = getPhantomWalletProvider();
    const solana = await provider.connect();
    const publicKey = solana.publicKey
    return await isNonceUsed(provider, publicKey, nonce);
  }
  return false;
}

const timeLeftForRefund = (nonce) => {
  const ts = BigInt(nonce) / 1000000000000n;
  const time = Date.now() - Number(ts) * 1000;
  return Math.max(0, 602_000 - time);
}

const getReceiverRaw = async (chainId, address) => {
  if (chainId === chains.near.id) {
    return getOmniAddress(address);
  }

  if (chainId === chains.solana.id) {
    const provider = getPhantomWalletProvider();
    const solana = await provider.connect();
    const publicKey = solana.publicKey.toBase58();
    console.log(solana.publicKey.toString());
    return publicKey;
    // if (this.signers.solana == null) throw "Connect Solana";
    // return this.signers.solana.publicKey.toBase58();
  }

  if (chainId === chains.ethereum.id) {
    throw 'Connect Ethereum wallet'  
  }

  throw `Unsupported chain address: ${chainId}`;

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

const depositSign = async (chain, nonce, sender_id, receiver_id, token_id, amount) => {
  const res = await fetch(`${OmniAPI}/deposit/sign`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, chain_from: chain, sender_id, receiver_id, token_id, amount }),
    method: "POST",
  });

  const { signature } = (await res.json());
  return signature;
}

const refundSign = async (chain, nonce, receiver_id, token_id, amount) => {
  const res = await fetch(`${OmniAPI}/refund/sign`, {
    headers: { "Content-type": "application/json" },
    body: JSON.stringify({ receiver_id, token_id, amount, nonce, chain_from: chain }),
    method: "POST",
  });

  const jsonResult = await res.json();
  console.log('jsonResult:', jsonResult);
  const { signature } = jsonResult;
  return signature;
}

const withdrawSign = async (nonce) => {
  const res = await fetch(`${OmniAPI}/withdraw/sign`, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce }),
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

  const receiver = await getReceiverRaw(transfer.chain_id, transfer.receiver);
  // const token = await this.token(transfer.token_id).metadata(transfer.chain_id);
  console.log('transfer:', transfer);
  let omniAddress;

  if (transfer.chain_id === chains.near.id) {
    omniAddress = tokens.usdt.near.omniAddress;
  }
  if (transfer.chain_id === chains.solana.id) {
    omniAddress = tokens.usdt.solana.omniAddress;
  }
  const signature = await refundSign(transfer.chain_id, nonce, receiver, omniAddress, transfer.amount);

  await nearConnection.callMethod({
    contractId: OmniHotContract,
    method: "refund",
    gas: 120n * TGAS,
    deposit: 0n,
    args: {
      chain_id: transfer.chain_id,
      helper_contract_id: OmniHelperContract,
      nonce: nonce,
      signature,
    },
  });

  return transfer;
}

const finishDeposit = async (nearConnection, accountId, deposit) => {
  if (deposit.chain === chains.solana.id) {
    deposit = await parseSolanaDeposit(nearConnection, accountId, deposit.tx);
  }

  const isExecuted = await nearConnection.viewMethod({
    contractId: OmniHotContract,
    method: "is_executed",
    args: { nonce: deposit.nonce, chain_id: deposit.chain },
  });

  if (isExecuted) {
    // CLEAR DEPOSIT PENDING
    if (deposit.chain === chains.solana.id) {
      await clearSolanaDepositNonceIfNeeded(deposit).catch(() => {});
    }
    return;
  }

  const receiver = getReceiverRaw(deposit.chain);
  const token = tokens['usdt'].solana;

  const makeDepositSignAttempt = async (attemps = 0) => {
    try {
      return await depositSign(
        deposit.chain,
        deposit.nonce,
        receiver,
        deposit.receiver,
        token.omniAddress,
        deposit.amount
      );
    } catch (e) {
      if (attemps > 5) throw e;
      await wait(3000);
      return await makeDepositSignAttempt(attemps + 1);
    }
  };

  const signature = await makeDepositSignAttempt();
  try {
    await nearConnection.callMethod({
      contractId: OmniHotContract,
      method: "deposit",
      gas: 80n * TGAS,
      args: {
        nonce: deposit.nonce,
        chain_id: deposit.chain,
        contract_id: token.omniAddress,
        receiver_id: deposit.receiver,
        amount: deposit.amount,
        signature,
      },
    });
  } catch (e) {
    // Backend can call deposit automatically, so we just skip this error
    if (!e?.toString?.().includes("Nonce already used")) throw e;
  }

  // CLEAR DEPOSIT PENDING
  if (deposit.chain === chains.solana.id) {
    await clearSolanaDepositNonceIfNeeded(deposit).catch(() => {});
  }

  console.log('deposit:', deposit);
};

export const finishWithdrawal = async (nearConnection, accountId, nonce) => {
  const transfer = await nearConnection.viewMethod({
    contractId: OmniHotContract,
    method: "get_transfer",
    args: { nonce },
  });

  if (isWithdrawNonceExpired(nonce)) {
    await cancelWithdraw(nearConnection, nonce);
    return;
  }

  if (await isWithdrawUsed(transfer.chain_id, nonce)) {
    throw "Already claimed";
  }

  const signature = await withdrawSign(nonce);

  // SOLANA WITHDRAW
  if (+transfer.chain_id === chains.solana.id) {
    console.log('transfer:', transfer);
    await solanaWithdraw({ nearConnection, accountId, nonce, signature, transfer });
    return;
  }
}