import { Buffer } from "buffer";
import * as anchor from "@coral-xyz/anchor";
import * as sol from "@solana/web3.js";
import IDL from "./idl.json";
import { PROGRAM_ID } from "./helpers";

export const getEnv = async (connection, publicKey) => {
  if (!window.solana || !window.solana.isPhantom) {
    alert("Phantom Wallet не найден. Установите его и повторите попытку.");
    throw new Error("Phantom Wallet не найден");
  }
  
  await window.solana.connect();
  
  const walletAdapter = {
    publicKey: new anchor.web3.PublicKey(window.solana.publicKey.toString()),
    signTransaction: async (tx) => await window.solana.signTransaction(tx),
    signAllTransactions: async (txs) => await window.solana.signAllTransactions(txs),
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