import AdvancedConnection from "solana-advanced-connection";
import * as anchor from "@coral-xyz/anchor";
import * as sol from "@solana/web3.js";
import {
  // ASSOCIATED_TOKEN_PROGRAM_ID,
  // createAssociatedTokenAccountInstruction,
  // getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { baseDecode } from "@near-js/utils";
import { tokens, /*chains*/ } from "@/config";
// import { getActiveWithdrawals } from "../../omni";
import getPhantomWalletProvider from "./getPhantomWalletProvider";
import { getEnv } from "./env";
import { sendInstructions } from "./sendInstructions";

export const isNonceUsed = async (connection, publicKey, nonce) => {
  try {
    const env = await getEnv(connection, publicKey);
    const state = await env.program.account.user.fetch(env.userAccount);
    return BigInt(nonce) <= BigInt(state.lastWithdrawNonce.toString());
  } catch (e) {
    console.log(e);
    return false;
  }
}

const getLastWithdrawNonce = async (connection, publicKey) => {
  const env = await getEnv(connection, publicKey);

  const solRpc = new AdvancedConnection(['https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff']);
  const isExist = await solRpc.getAccountInfo(env.userAccount);
  if (!isExist) return 0n;

  const state = await env.program.account.user.fetch(env.userAccount);
  return BigInt(state?.lastWithdrawNonce || 0n);
}

export const withdraw = async ({ /*nearConnection, accountId,*/ transfer , signature, nonce }) => {
  const provider = getPhantomWalletProvider();
  const solana = await provider.connect();
  const publicKey = solana.publicKey;

  const metadata = tokens['usdt'].solana;
  const sign = Array.from(baseDecode(signature));

  const lastWithdrawNonce = await getLastWithdrawNonce(provider, publicKey);
  if (BigInt(nonce) <= lastWithdrawNonce) throw "Withdraw nonce already used";

  /*
  const activeWithdrawals = Object.values(await getActiveWithdrawals(nearConnection, accountId, false));
  const existOlderWithdraw = activeWithdrawals.find((t) => {
    return !t.completed && t.chain === chains.solana.id && BigInt(t.nonce) < BigInt(nonce);
  });

  if (existOlderWithdraw) throw "You have an older, unfinished withdraw. Go back to transactions history and claim first";
  */

  // const owner = publicKey;
  const mint = new sol.PublicKey(metadata.address);
  const ATA = getAssociatedTokenAddressSync(mint, publicKey);
  // const isExist = await getAccount(provider, ATA, "confirmed", TOKEN_PROGRAM_ID).catch(() => null);
  const env = await getEnv(provider, publicKey);
  const instructionBuilder = env.program.methods.tokenWithdraw(
    sign,
    new anchor.BN(nonce),
    new anchor.BN(transfer.amount),
    publicKey,
    env.userBump
  );

  instructionBuilder.accountsStrict({
    user: env.userAccount,
    state: env.stateAccount,
    sender: publicKey,
    receiverTokenAccount: ATA,

    smcTokenAccount: getAssociatedTokenAddressSync(mint, env.stateAccount, true),
    systemProgram: sol.SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const instructions = [];
  // if (!isExist) {
  //   const createATA = createAssociatedTokenAccountInstruction(owner, ATA, owner, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  //   instructions.push(createATA);
  // }

  instructions.push(await instructionBuilder.instruction());
  const hash = await sendInstructions({ connection: env.connection, instructions });
  return hash;
}
