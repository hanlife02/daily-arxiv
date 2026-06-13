import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const algorithm = "aes-256-gcm";

function getKey(secret = process.env.FIELD_ENCRYPTION_KEY ?? "") {
  if (!secret) {
    throw new Error("FIELD_ENCRYPTION_KEY is required");
  }
  if (/^[A-Za-z0-9+/=]+$/.test(secret)) {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length === 32) return decoded;
  }
  return scryptSync(secret, "daily-arxiv-field-encryption", 32);
}

export function encryptSecret(value: string, secret?: string) {
  const iv = randomBytes(12);
  const key = getKey(secret);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, secret?: string) {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted payload");
  }
  const decipher = createDecipheriv(algorithm, getKey(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
