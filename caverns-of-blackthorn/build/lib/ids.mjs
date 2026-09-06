import { createHash } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Deterministic 16-character Foundry document id derived from a stable seed.
 *
 * Rebuilds must produce identical ids: the adventure document references actors,
 * items and journal pages by id, and a token placed in the scene stores its
 * actorId. Random ids would break every reference on each rebuild.
 *
 * @param {string} seed  Stable, unique string (e.g. "actor:ork-krieger").
 * @returns {string}     16-character id from Foundry's id alphabet.
 */
export function stableId(seed) {
  const digest = createHash("sha256").update(seed).digest();
  let id = "";
  for (let i = 0; i < 16; i++) id += ALPHABET[digest[i] % ALPHABET.length];
  return id;
}
