import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password, storedPassword) => {
  const [salt, storedHash] = String(storedPassword).split(":");
  if (!salt || !storedHash) return false;
  const derivedKey = await scrypt(password, salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  return expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
};
