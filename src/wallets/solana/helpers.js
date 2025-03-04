import { Buffer } from "buffer";
import { BN } from "bn.js";
import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("5bG1Kru6ifRmkWMigYaGRKbBKp3WrgcmB6ARNKsV2y2v");

export function findDepositAddress(
  nonce,
  sender,
  receiver,
  mint,
  amount
) {
  const bnNonce = new BN(nonce.toString());
  const bufferedNonce = bnNonce.toArrayLike(Buffer, 'be', 16);

  const bnAmount = new BN(amount.toString());
  const bufferedAmount = bnAmount.toArrayLike(Buffer, 'be', 8);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("deposit", "utf8"), //
      bufferedNonce,
      sender.toBytes(),
      receiver,
      mint.toBytes(),
      bufferedAmount,
    ],
    PROGRAM_ID
  );
}