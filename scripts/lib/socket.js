/**
 * The module's socket channel, shared by every feature that talks to other clients.
 *
 * Foundry relays custom socket messages on the channel "module.<id>" when the manifest has
 * `"socket": true`. Each message carries the sending feature's id, so features don't see each
 * other's messages. Verified against the v14 server (`handleCustomSocket`): with
 * `{recipients: [userIds]}` the server delivers ONLY to those users' clients, otherwise to
 * every other connected client; the sender never receives its own message, and listeners get
 * `(message, senderUserId)`.
 */

import { MODULE_ID } from "../constants.js";

const CHANNEL = `module.${MODULE_ID}`;

/** feature id → handler(message, senderId) */
const handlers = new Map();

function dispatch(message, senderId) {
  const handler = handlers.get(message?.feature);
  if (!handler) return;
  try {
    handler(message, senderId);
  } catch (err) {
    console.error(`${MODULE_ID} | socket message for "${message.feature}" failed`, err);
  }
}

/**
 * Receive this feature's socket messages. Call from a feature's init().
 * @param {string} feature                           The feature id.
 * @param {(message: object, senderId: string) => void} handler
 */
export function onSocketMessage(feature, handler) {
  if (!handlers.size) game.socket.on(CHANNEL, dispatch);
  handlers.set(feature, handler);
}

/**
 * Send a message to other clients.
 * @param {string} feature                  The feature id.
 * @param {object} payload                  Plain JSON data.
 * @param {object} [options]
 * @param {string[]} [options.recipients]   Only these user ids (default: everyone else).
 * @param {boolean} [options.volatile]      May be dropped instead of queued when the connection
 *                                          is busy — for high-frequency state where only the
 *                                          latest value matters.
 */
export function emitSocketMessage(feature, payload, { recipients, volatile = false } = {}) {
  const socket = volatile ? game.socket.volatile : game.socket;
  const message = { ...payload, feature };
  if (recipients) socket.emit(CHANNEL, message, { recipients });
  else socket.emit(CHANNEL, message);
}
