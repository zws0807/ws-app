import { argon2idAsync } from "@noble/hashes/argon2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { fail } from "../../http";
let active = 0;
export const randomToken = () =>
  bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string) {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
export async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  );
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function derive(password: string, salt: Uint8Array) {
  if (active >= 2) fail(503, "busy", "服务繁忙，请稍后重试");
  active++;
  try {
    return await argon2idAsync(password, salt, {
      m: 19456,
      t: 2,
      p: 1,
      dkLen: 32,
      asyncTick: 10,
    });
  } finally {
    active--;
  }
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return (
    "$argon2id$v=19$m=19456,t=2,p=1$" +
    bytesToHex(salt) +
    "$" +
    bytesToHex(await derive(password, salt))
  );
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[3] !== "m=19456,t=2,p=1") return false;
  return equal(
    bytesToHex(await derive(password, hexToBytes(parts[4]))),
    parts[5],
  );
}
