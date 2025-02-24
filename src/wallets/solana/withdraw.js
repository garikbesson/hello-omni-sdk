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
import { Buffer } from "buffer";
// import { getActiveWithdrawals } from "../../omni";
import getProvider from "./getProvider";
import IDL from "./idl.json";

const PROGRAM_ID = new anchor.web3.PublicKey("5bG1Kru6ifRmkWMigYaGRKbBKp3WrgcmB6ARNKsV2y2v");

const connection = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");
console.log("getAccountInfoAndContext method:", connection.getAccountInfoAndContext);

const getEnv = async (connection, publicKey) => {
  if (!window.solana || !window.solana.isPhantom) {
    alert("Phantom Wallet не найден. Установите его и повторите попытку.");
    throw new Error("Phantom Wallet не найден");
  }
  
  // Подключаемся к Phantom (необходимое подтверждение от пользователя)
  await window.solana.connect();
  
  // Оборачиваем Phantom Wallet в объект Anchor Wallet
  // const wallet = new anchor.Wallet(window.solana);
  
  const walletAdapter = {
    publicKey: new anchor.web3.PublicKey(window.solana.publicKey.toString()),
    signTransaction: async (tx) => await window.solana.signTransaction(tx),
    signAllTransactions: async (txs) => await window.solana.signAllTransactions(txs),
    // Если требуется, можно добавить заглушку для signMessage:
    signMessage: async (message) => {
      if (window.solana.signMessage) {
        return await window.solana.signMessage(message);
      }
      throw new Error("Wallet does not support signMessage");
    }
  };

  const [userAccount, userBump] = sol.PublicKey.findProgramAddressSync(
    [Buffer.from("user", "utf8"), publicKey.toBytes()],
    PROGRAM_ID
  );
  const rpcSol = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");
  const [stateAccount, stateBump] = sol.PublicKey.findProgramAddressSync([Buffer.from("state", "utf8")], PROGRAM_ID);
  const provider = new anchor.AnchorProvider(rpcSol, walletAdapter, {
    preflightCommitment: "processed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, PROGRAM_ID, provider);
  return { connection, program, PROGRAM_ID, userAccount, userBump, stateAccount, stateBump };
}

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

const sendInstructions = async (args) => {
  const tx = new sol.Transaction();
  args.instructions.map((t) => tx.add(t));
  if (args.signers) tx.sign(...args.signers);
  // return await sol.sendAndConfirmTransaction(args.connection, tx, [this.keyPair]);
  const rpcSol = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");
  
  const provider = getProvider();
  const wallet = await provider.connect();
  tx.feePayer = wallet.publicKey;
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signedTx = await provider.signTransaction(tx);
  
  const txid = await rpcSol.sendRawTransaction(signedTx.serialize());

  // Ждём подтверждения транзакции (опционально можно указать уровень подтверждения)
  return await rpcSol.confirmTransaction(txid, 'processed');

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
  const provider = getProvider();
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
