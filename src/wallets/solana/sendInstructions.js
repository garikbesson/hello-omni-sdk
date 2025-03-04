import * as sol from "@solana/web3.js";
import getPhantomWalletProvider from "./getPhantomWalletProvider";

const connection = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");

export const sendInstructions = async (args) => {
  const tx = new sol.Transaction();
  args.instructions.map((t) => tx.add(t));
  if (args.signers) tx.sign(...args.signers);
  const rpcSol = new sol.Connection("https://greatest-dark-haze.solana-mainnet.quiknode.pro/59212e5be0a628ec9d05e336694332955ff08bff", "processed");
  
  const provider = getPhantomWalletProvider();
  const wallet = await provider.connect();
  tx.feePayer = wallet.publicKey;
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signedTx = await provider.signTransaction(tx);
  
  const txid = await rpcSol.sendRawTransaction(signedTx.serialize()).catch(err => console.log('sendRawTransaction err:', err));

  return await rpcSol.confirmTransaction(txid, 'processed');
}