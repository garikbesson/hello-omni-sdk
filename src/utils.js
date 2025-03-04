import { Buffer } from 'buffer';
import { baseEncode } from "@near-js/utils";
import { getBytes, sha256 } from "ethers";

export const TGAS = 1000000000000n;

export const getOmniAddress = (address) => {
  return baseEncode(getBytes(sha256(Buffer.from(address, "utf8"))));
}

export const wait = (timeout) => {
  return new Promise((resolve) => setTimeout(resolve, timeout));
};

export const toNonDivisibleNumber = (decimals, number) => {
  if (decimals === null || decimals === undefined) return number;
  decimals = Number(decimals);
  const [wholePart, fracPart = ""] = number.includes("e") ? Number(number).toFixed(24).split(".") : number.split(".");
  return `${wholePart}${fracPart.padEnd(decimals, "0").slice(0, decimals)}`.replace(/^0+/, "").padStart(1, "0");
};

export const parseAmount = (n, d) => {
  return toNonDivisibleNumber(d, (n || 0).toString());
};