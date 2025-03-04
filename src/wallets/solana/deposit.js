import { Buffer } from 'buffer';
import { baseEncode, baseDecode } from "@near-js/utils";
import * as sol from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { isDepositUsed } from "@/omni";
import { wait, getOmniAddress, parseAmount } from '@/utils';
import { chains, tokens } from '@/config';

import { getEnv } from './env';
import getPhantomWalletProvider from './getPhantomWalletProvider';
import { sendInstructions } from './sendInstructions';
import { findDepositAddress } from './helpers';

const connection = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");

export const clearDepositNonceIfNeeded = async (accountId, deposit) => {
  const provider = getPhantomWalletProvider();
  const solana = await provider.connect();
  const publicKey = solana.publicKey;
  const env = await getEnv(provider, publicKey);

  const isUsed = await isDepositUsed(chains.solana.id, deposit.nonce);
  if (!isUsed) throw "You have not completed the previous deposit";

  const receiver = Buffer.from(baseDecode(getOmniAddress(accountId)));
  const metadata = tokens['usdt'].solana;
  const bnAmount = new anchor.BN(deposit.amount.toString());
  const bnNonce = new anchor.BN(deposit.nonce.toString());

  const mint = metadata.address === "native" ? sol.PublicKey.default : new sol.PublicKey(metadata.address);
  const [depositAddress] = findDepositAddress(BigInt(deposit.nonce), publicKey, receiver, mint, BigInt(parseAmount(deposit.amount, metadata.decimals)));

  const isExist = await connection.getAccountInfo(depositAddress, { commitment: "confirmed" });
  if (isExist == null) return;

  try {
    const builder = env.program.methods.clearDepositInfo(Array.from(receiver), mint, bnAmount, bnNonce).accounts({
      systemProgram: sol.SystemProgram.programId,
      sender: publicKey.toBase58(),
      state: env.stateAccount.toBase58(),
      deposit: depositAddress,
    });

    const instruction = await builder.instruction();
    await sendInstructions({ instructions: [instruction] });
  } catch (e) {
    console.error(e);
  }
}

export const parseDeposit = async (nearConnection, accountId, hash) => {
  const waitReceipt = async (attemps = 0) => {
    const status = await connection.getParsedTransaction(hash, { commitment: "confirmed" });
    if (status || attemps > 2) return status || null;
    await wait(3000);
    return await waitReceipt(attemps + 1);
  };

  const status = await waitReceipt();
  const logMessages = status?.meta?.logMessages;
  if (status == null || logMessages == null) throw "no tx receipt yet";

  const nonce = logMessages.map((t) => t.match(/nonce (\d+)/)?.[1]).find((t) => t != null);
  const amount = logMessages.map((t) => t.match(/amount: (\d+)/)?.[1]).find((t) => t != null);
  const receiverHex = logMessages.map((t) => t.match(/to ([0-9A-Fa-f]+)/)?.[1]).find((t) => t != null);
  const token = logMessages.find((t) => t.includes("NativeDeposit"))
    ? "native"
    : logMessages.map((t) => t.match(/mint: (.+),/)?.[1]).find((t) => t != null);
  if (nonce == null || receiverHex == null || amount == null || token == null) throw "no tx receipt yet";

  const timestamp = (status.blockTime || 0) * 1000;
  const receiver = baseEncode(Buffer.from(receiverHex, "hex"));

  const deposit = { tx: hash, amount, nonce, receiver, chain: chains.solana.id, timestamp, token: tokens.usdt.id };
  const isUsed = await isDepositUsed(nearConnection, chains.solana.id, nonce);

  if (isUsed) {
    await clearDepositNonceIfNeeded(accountId, deposit);
    throw "Deposit alredy claimed, check your omni balance";
  }

  return deposit;
}

const getLastDepositNonce = async (env) => {
  const state = await env.program.account.user.fetch(env.userAccount).catch(() => ({ lastDepositNonce: null }));
  if (!state.lastDepositNonce) return null;
  const nonce = BigInt(state.lastDepositNonce.toString());
  return nonce;
}

export const deposit = async (accountId, tokenContract, tokenAmount) => {
  const provider = getPhantomWalletProvider();
  const solana = await provider.connect();
  const publicKey = solana.publicKey;
  const env = await getEnv(provider, publicKey);

  const receiverAddr = getOmniAddress(accountId);
  const receiver = Buffer.from(baseDecode(receiverAddr));
  const lastDepositNonce = await getLastDepositNonce(env);
  const builder = env.program.methods.generateDepositNonce(env.userBump);
  builder.accountsStrict({
    user: env.userAccount.toBase58(),
    state: env.stateAccount.toBase58(),
    sender: publicKey.toBase58(),
    systemProgram: sol.SystemProgram.programId,
  });

  await sendInstructions({ instructions: [await builder.instruction()] });

  const waitNewNonce = async () => {
    console.log('Waiting for a new nonce...');
    const newNonce = await getLastDepositNonce().catch(() => lastDepositNonce);
    if (newNonce === lastDepositNonce) return await waitNewNonce();
    if (newNonce == null) return await waitNewNonce();
    return newNonce;
  };

  const nonce = await waitNewNonce();

  const tokenMetadata = tokens.usdt.solana;
  const bigIntAmount = BigInt(parseAmount(tokenAmount, tokenMetadata.decimals));
  const amt = new anchor.BN(bigIntAmount);
  if (tokenContract === "native") {
    const [depositAddress, depositBump] = findDepositAddress(nonce, publicKey, receiver, sol.PublicKey.default, bigIntAmount);
    const depositBuilder = env.program.methods.nativeDeposit(receiver, amt, depositBump);
    depositBuilder.accountsStrict({
      user: env.userAccount.toBase58(),
      state: env.stateAccount.toBase58(),
      sender: publicKey.toBase58(),
      systemProgram: sol.SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      deposit: depositAddress,
    });

    const instruction = await depositBuilder.instruction();
    const hash = await sendInstructions({ instructions: [instruction] });

    return {
      receiver: receiverAddr,
      timestamp: Date.now(),
      chain: chains.solana.id,
      amount: String(tokenAmount),
      token: tokens.usdt.id,
      nonce: nonce.toString(),
      tx: hash,
    };
  }

  const mint = new sol.PublicKey(tokenContract);
  const [depositAddress, depositBump] = findDepositAddress(nonce, publicKey, receiver, mint, bigIntAmount);

  const depositBuilder = env.program.methods.tokenDeposit(receiver, amt, depositBump);
  depositBuilder.accountsStrict({
    user: env.userAccount.toBase58(),
    state: env.stateAccount.toBase58(),
    sender: publicKey.toBase58(),
    systemProgram: sol.SystemProgram.programId,
    smcTokenAccount: getAssociatedTokenAddressSync(mint, env.stateAccount, true),
    senderTokenAccount: getAssociatedTokenAddressSync(mint, publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
    deposit: depositAddress,
  });

  const instruction = await depositBuilder.instruction();
  const hash = await sendInstructions({ instructions: [instruction] });

  return {
    receiver: receiverAddr,
    timestamp: Date.now(),
    chain: chains.solana.id,
    nonce: nonce.toString(),
    amount: String(tokenAmount),
    token: tokens.usdt.id,
    tx: hash,
  };
};

