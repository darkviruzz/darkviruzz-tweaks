/**
 * Feature: File Browser Preview (system-agnostic)
 * -----------------------------------------------
 * Foundry VTT v14+ · any system
 *
 * Core's File Browser (FilePicker) shows pictures only in its Thumbnails/Tiles/Images views,
 * and those load every ORIGINAL in the folder — a folder of battle maps easily means hundreds
 * of MB. The List view loads nothing but shows no picture either, and the Tiles view leaves out
 * the file names.
 *
 * Three options:
 *   - Hover preview: resting the mouse on an image file in the List (or Thumbnails) view shows a
 *     preview beside the browser — no click — with its pixel size, file size and, in the Tile
 *     Browser, its footprint in grid squares at the browser's "Asset Grid Size" field
 *     (naturalWidth / tileSize, the ratio core uses when the tile is dropped). The first preview
 *     needs a longer rest (HOVER_DELAY); while one is showing, moving from image to image brings
 *     the next ones quickly (HOVER_DELAY_WARM) and the picture stays until the next is ready.
 *     Off the images for WARM_GRACE (another file, the header) or out of the window → long again.
 *   - Thumbnail cache (world): an image larger than the threshold gets a thumbnail (max.
 *     512 px, webp) the first time someone allowed to upload files hovers over it. Images up to
 *     512 px or up to the size threshold never get one — they are shown as they are. It is stored
 *     in this module's persistent storage folder and used for every later preview, so an
 *     original is only downloaded while no thumbnail exists.
 *   - File names in the Tiles view (CSS only, from the `data-name` core puts on each row).
 *
 * Drag-and-drop stays core's: core binds its DragDrop to `li[data-file]` on every render of the
 * list, and its drag start reads `li.querySelector("img").naturalWidth` to size the dropped
 * tile. So nothing is ever inserted into or replaced in a row (the preview is one element on
 * document.body with pointer-events: none, the listeners are passive), and core's own <img>
 * sources are never swapped for thumbnails — that would shrink dropped tiles to 256 px.
 *
 * Cache layout: `modules/<id>/storage/thumbs/<hash(folder)>/<hash(file)>-<w>x<h>-<bytes>.webp`.
 * `persistentStorage: true` in module.json keeps the folder across module updates; uploads into
 * a package's storage folder are allowed despite v13's upload restrictions (Token Action HUD
 * and Dig Down do the same). The name carries the ORIGINAL's pixel size (for the readout) and
 * byte size: once per session a HEAD request compares it with the original and the thumbnail
 * is made again if the original was replaced. Hashed names keep spaces, umlauts etc. of asset
 * paths out of the cache. Only the "data" source is cached (not core's "public" files or S3).
 *
 * Who creates thumbnails: users with the "Upload New Files" permission (`FILES_UPLOAD`; GMs
 * always) — the same permission the File Browser's own upload needs. Everyone else uses the
 * existing thumbnails and otherwise sees the original. A failed upload switches creation off
 * for the rest of the session, so nobody gets an error on every hover.
 *
 * Verified (Foundry v14 API 14.368): FilePicker.browse/createDirectory/upload(source, path,
 * file, body, {notify}), FilePicker.implementation, #activeSource, #displayMode, DISPLAY_MODES
 * list/thumbs/tiles/images, CONST.IMAGE_FILE_EXTENSIONS, FILES_UPLOAD (default role Assistant),
 * BasePackage#persistentStorage. Row DOM and the drag-start detail: Asset Preview 0.1.2
 * (verified on 14.364) — v14 impl otherwise unverified.
 *
 * Preview and tile names are per-user, cache and threshold per world (GM). All off by default.
 */

import { MODULE_ID } from "../constants.js";

const KEY_HOVER      = "filePreviewHover";
const KEY_TILE_NAMES = "filePreviewTileNames";
const KEY_CACHE      = "filePreviewThumbCache";
const KEY_MIN_KB     = "filePreviewThumbMinKB";
const KEY_SIZE       = "filePreviewSize";

/** Root class of a FilePicker that shows file names in its Tiles view (see the CSS). */
const CLASS_TILE_NAMES = "dt-fp-tile-names";
/** Display modes whose rows get a hover preview — Tiles/Images show the picture already. */
const HOVER_MODES = new Set(["list", "thumbs"]);
/** ms the mouse must rest on the first image, so sweeping over the list loads nothing. */
const HOVER_DELAY = 900;
/** ms per image while a preview is showing: going from image to image keeps them coming. */
const HOVER_DELAY_WARM = 150;
/** ms off the images (a gap between rows counts) after which the long delay applies again. */
const WARM_GRACE = 300;
/** Long side of a thumbnail: sharp up to the largest preview size. */
const THUMB_SIZE = 512;
/** Preview sizes (long side, px) offered per user. */
const PREVIEW_SIZES = [256, 384, 512];
/** Small originals are enlarged to the preview size, but at most this much. */
const MAX_UPSCALE = 2;
const THUMB_QUALITY = 0.8;
const CACHE_ROOT = `modules/${MODULE_ID}/storage/thumbs`;
/** `<hash(file name)>-<width>x<height>-<bytes>.<ext>` — size and bytes of the ORIGINAL. */
const THUMB_NAME = /^([0-9a-z]+)-(\d+)x(\d+)-(\d+)\.(webp|png)$/;

const filePicker = () => foundry.applications.apps.FilePicker.implementation;

/* ------------------------------------------------------------------ */
/*  Paths                                                             */
/* ------------------------------------------------------------------ */

/** Short, stable, filename-safe hash (cyrb53, base 36). */
function hash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Folder and file name of a (possibly URL-encoded) path, decoded. */
function splitPath(path) {
  let clean = String(path).split(/[?#]/)[0];
  try {
    clean = decodeURIComponent(clean);
  } catch { /* keep it as it is */ }
  const slash = clean.lastIndexOf("/");
  return { folder: clean.slice(0, slash + 1), file: clean.slice(slash + 1) };
}

const extensionOf = path => splitPath(path).file.split(".").pop().toLowerCase();
const isImage = path => Object.hasOwn(CONST.IMAGE_FILE_EXTENSIONS ?? {}, extensionOf(path));
/** Vector images are small and can't be decoded into a bitmap — never thumbnailed. */
const isThumbnailable = path => isImage(path) && (extensionOf(path) !== "svg");

/** Where the thumbnail of `path` lives: one cache folder per asset folder. */
function cacheSlot(path) {
  const { folder, file } = splitPath(path);
  return { dir: `${CACHE_ROOT}/${hash(folder)}`, key: hash(file) };
}

/* ------------------------------------------------------------------ */
/*  Thumbnail cache                                                   */
/* ------------------------------------------------------------------ */

/** Cache folder → Promise<Map<key, entry[]>>; every cache folder is browsed once per session. */
const indexes = new Map();
/** Paths whose thumbnail is being made right now. */
const pending = new Set();
/** Paths that need no thumbnail (already small) or can't get one (not decodable). */
const noThumbnail = new Set();
/** Paths whose thumbnail was compared with the original this session. */
const checked = new Set();
/** Cache folders known to exist. */
const knownDirs = new Set();
/** Set after a failed upload: originals only, for the rest of the session. */
let creationDisabled = false;
let queue = Promise.resolve();

/** Run thumbnail work one job at a time — decoding a big map is heavy. */
function enqueue(job) {
  queue = queue.then(job).catch(err => console.warn(`${MODULE_ID} | file preview:`, err));
}

function cacheEnabled(app) {
  return !!game.settings.get(MODULE_ID, KEY_CACHE)
    && (app?.activeSource === "data")
    && !!game.modules?.get(MODULE_ID)?.persistentStorage;
}

const canCreate = () => !creationDisabled && !!game.user?.can?.("FILES_UPLOAD");

function readIndex(dir) {
  if (!indexes.has(dir)) {
    indexes.set(dir, filePicker().browse("data", dir)
      .then(result => indexFiles(result?.files ?? []))
      .catch(() => new Map()));                        // not created yet
  }
  return indexes.get(dir);
}

function indexFiles(files) {
  const index = new Map();
  for (const src of files) {
    const match = THUMB_NAME.exec(splitPath(src).file);
    if (!match) continue;
    const [, key, width, height, bytes] = match;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ src, width: Number(width), height: Number(height), bytes: Number(bytes) });
  }
  return index;
}

/** Create the cache folder and its parents below the module folder, where missing. */
async function ensureDir(dir) {
  const parts = dir.split("/");
  for (let i = 3; i <= parts.length; i++) {           // modules/<id> always exists
    const path = parts.slice(0, i).join("/");
    if (knownDirs.has(path)) continue;
    try {
      await filePicker().browse("data", path);
    } catch {
      // Another client may have created it a moment ago — only a folder that is still missing fails.
      await filePicker().createDirectory("data", path, {})
        .catch(err => filePicker().browse("data", path).catch(() => { throw err; }));
    }
    knownDirs.add(path);
  }
}

/** Downscale an image to a webp thumbnail (png where the browser can't encode webp). */
async function renderThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  try {
    const scale = THUMB_SIZE / Math.max(width, height);
    if (scale >= 1) return null;                         // already thumbnail-sized
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    // The browser's high-quality resize avoids the aliasing of one big drawImage step.
    const resized = await createImageBitmap(bitmap, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" })
      .catch(() => null);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(resized ?? bitmap, 0, 0, w, h);
    resized?.close();
    const thumb = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", THUMB_QUALITY));
    return thumb ? { blob: thumb, width, height } : null;
  } finally {
    bitmap.close();
  }
}

/** Make, upload and index the thumbnail of `path` from its downloaded original. */
async function storeThumbnail(path, original) {
  const thumb = await renderThumbnail(original).catch(err => {
    noThumbnail.add(path);                               // not decodable — don't download it again
    throw err;
  });
  if (!thumb || (thumb.blob.size >= original.size)) {
    noThumbnail.add(path);
    return;
  }
  if (!canCreate()) return;

  const { dir, key } = cacheSlot(path);
  const ext = (thumb.blob.type === "image/webp") ? "webp" : "png";
  const file = new File([thumb.blob], `${key}-${thumb.width}x${thumb.height}-${original.size}.${ext}`,
    { type: thumb.blob.type });
  try {
    await ensureDir(dir);
    const result = await filePicker().upload("data", dir, file, {}, { notify: false });
    if (!result?.path) throw new Error(result?.message ?? "the upload returned no path");
    const index = await readIndex(dir);
    const entries = (index.get(key) ?? []).filter(entry => entry.bytes !== original.size);
    entries.push({ src: result.path, width: thumb.width, height: thumb.height, bytes: original.size });
    index.set(key, entries);
  } catch (err) {
    creationDisabled = true;
    console.warn(`${MODULE_ID} | file preview: cannot store thumbnails (${err.message}) — ` +
      "showing originals for the rest of this session");
  }
}

function queueThumbnail(path, original) {
  if (pending.has(path)) return;
  pending.add(path);
  enqueue(() => storeThumbnail(path, original).finally(() => pending.delete(path)));
}

/** Once per session: compare a thumbnail with its original and remake it if that was replaced. */
function checkThumbnail(path, entries) {
  if (checked.has(path) || !canCreate()) return;
  checked.add(path);
  enqueue(async () => {
    const head = await fetch(path, { method: "HEAD", cache: "no-cache" });
    const bytes = Number(head.headers.get("content-length"));
    // Missing or compressed length: nothing reliable to compare with.
    if (!head.ok || !bytes || head.headers.get("content-encoding")) return;
    const current = entries.findIndex(entry => entry.bytes === bytes);
    if (current >= 0) {
      entries.push(...entries.splice(current, 1));      // the last entry is the one shown
      return;
    }
    const response = await fetch(path, { cache: "no-cache" });
    if (response.ok) await storeThumbnail(path, await response.blob());
  });
}

/**
 * What the hover preview shows for `path`: its cached thumbnail when there is one, else the
 * original. Downloading the original for the preview doubles as the source of a new thumbnail.
 * @returns {Promise<{src: string, width?: number, height?: number, bytes?: number,
 *   cached?: boolean, objectURL?: boolean}>}  width/height/bytes describe the ORIGINAL
 */
async function resolvePreview(app, path) {
  if (!cacheEnabled(app)) return { src: path };

  const { dir, key } = cacheSlot(path);
  const entries = (await readIndex(dir)).get(key);
  if (entries?.length) {
    checkThumbnail(path, entries);
    return { ...entries.at(-1), cached: true };
  }
  if (!canCreate() || !isThumbnailable(path) || noThumbnail.has(path)) return { src: path };

  const response = await fetch(path);
  if (!response.ok) return { src: path };
  const original = await response.blob();
  const minBytes = (Number(game.settings.get(MODULE_ID, KEY_MIN_KB)) || 0) * 1024;
  if (original.size > minBytes) queueThumbnail(path, original);
  return { src: URL.createObjectURL(original), bytes: original.size, objectURL: true };
}

/* ------------------------------------------------------------------ */
/*  Hover preview                                                     */
/* ------------------------------------------------------------------ */

/** The row being hovered: `{row, delay, timer}`. */
let hover = null;
/** Bumped whenever a pending preview is dropped, so late results for an earlier row are dropped. */
let generation = 0;
let previewElement = null;
/** Object URL of the original currently shown (revoked when replaced or hidden). */
let previewURL = null;
/** shown: a preview is visible; warmUntil: after hiding it, until when the next one is quick. */
const timing = { now: () => performance.now(), shown: false, warmUntil: 0 };

const isWarm = () => timing.shown || (timing.now() < timing.warmUntil);
const hoverDelay = () => (isWarm() ? HOVER_DELAY_WARM : HOVER_DELAY);

/** Drop the pending preview of the hovered row; the picture on screen stays. */
function cancelPending() {
  generation++;
  if (hover) clearTimeout(hover.timer);
  hover = null;
}

/**
 * Hide the preview. For WARM_GRACE the next image still comes quickly; `cool` (leaving the
 * window, dragging, closing) starts over with the long delay.
 */
function hidePreview({ cool = false } = {}) {
  cancelPending();
  if (cool) timing.warmUntil = 0;
  else if (timing.shown) timing.warmUntil = timing.now() + WARM_GRACE;
  timing.shown = false;
  previewElement?.classList.remove("is-visible");
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = null;
}

/** The image row under `node` in a view with hover previews, or null. */
function imageRow(app, node) {
  const row = node?.closest?.("li[data-file]");
  const path = row?.dataset?.path;
  return (path && isImage(path) && HOVER_MODES.has(app.displayMode)) ? row : null;
}

function onPointerOver(app, event) {
  if (!game.settings.get(MODULE_ID, KEY_HOVER)) return;
  const row = imageRow(app, event.target);
  if (row && (row === hover?.row)) return;
  if (!row) {
    // Off the images (another file, a gap, the header): hide — quick again only within the grace.
    if (hover || timing.shown) hidePreview();
    return;
  }
  // From image to image the current picture stays until the next one is ready.
  const delay = hoverDelay();
  cancelPending();
  const ticket = generation;
  hover = { row, delay, timer: setTimeout(() => showPreview(app, row, row.dataset.path, ticket), delay) };
}

/** Leaving the browser window starts over; inside it, pointerover of the new element decides. */
function onPointerOut(event) {
  const to = event.relatedTarget;
  if (!to || !event.currentTarget?.contains?.(to)) hidePreview({ cool: true });
}

async function showPreview(app, row, path, ticket) {
  let preview;
  try {
    preview = await resolvePreview(app, path);
  } catch (err) {
    console.debug(`${MODULE_ID} | file preview:`, err);
    preview = { src: path };
  }
  if ((ticket !== generation) || !row.isConnected) {
    if (preview.objectURL) URL.revokeObjectURL(preview.src);
    return;
  }
  const previous = previewURL;
  previewURL = preview.objectURL ? preview.src : null;
  renderPreview(app, row, preview);
  if (previous && (previous !== previewURL)) URL.revokeObjectURL(previous);
  timing.shown = true;
}

/** The browser's "Asset Grid Size" field — only present in the Tile Browser. */
function tileSizeOf(app) {
  const value = Number.parseInt(app.element?.querySelector('input[name="tileSize"]')?.value, 10);
  return (value > 0) ? value : null;
}

/** The user's preview size, clamped to the offered sizes and the viewport. */
function previewSize() {
  const chosen = Number(game.settings.get(MODULE_ID, KEY_SIZE));
  const size = PREVIEW_SIZES.includes(chosen) ? chosen : PREVIEW_SIZES[1];
  const viewport = Math.min(globalThis.innerWidth ?? size, globalThis.innerHeight ?? size) - 64;
  return Math.max(PREVIEW_SIZES[0] / 2, Math.min(size, viewport));
}

/** Display size of an image of `width` × `height` in a preview box of `size` px. */
function displaySize(width, height, size) {
  if (!width || !height) return null;
  const scale = Math.min(size / Math.max(width, height), MAX_UPSCALE);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const formatSpan = value => (Number.isInteger(value) ? String(value) : value.toFixed(2));

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return game.i18n.format("DT.FilePickerPreview.Kilobytes", { size: Math.max(1, Math.round(bytes / 1024)) });
  return game.i18n.format("DT.FilePickerPreview.Megabytes", { size: (bytes / (1024 * 1024)).toFixed(1) });
}

function stat(text, cssClass) {
  const node = document.createElement("span");
  if (cssClass) node.classList.add(cssClass);
  node.textContent = text;
  return node;
}

function statNodes(app, preview, img) {
  const nodes = [];
  const width = preview.width ?? img.naturalWidth;
  const height = preview.height ?? img.naturalHeight;
  if (width && height) {
    nodes.push(stat(game.i18n.format("DT.FilePickerPreview.Pixels", { width, height })));
    const tileSize = tileSizeOf(app);
    if (tileSize) {
      const across = width / tileSize;
      const down = height / tileSize;
      const grid = stat(game.i18n.format("DT.FilePickerPreview.Grid", { across: formatSpan(across), down: formatSpan(down) }));
      // A fractional footprint usually means the Asset Grid Size doesn't match the asset pack.
      if (!Number.isInteger(across) || !Number.isInteger(down)) grid.classList.add("is-fractional");
      nodes.push(grid);
    }
  }
  if (preview.bytes) nodes.push(stat(formatBytes(preview.bytes)));
  if (preview.cached) nodes.push(stat(game.i18n.localize("DT.FilePickerPreview.Cached"), "is-cached"));
  return nodes;
}

/** Beside the browser window (right, else left), centred on the row, inside the viewport. */
function placePreview(app, row) {
  const gap = 8;
  const frame = (app.element ?? row).getBoundingClientRect();
  const line = row.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = previewElement;
  const left = (frame.right + gap + width <= window.innerWidth) ? frame.right + gap : frame.left - gap - width;
  const top = Math.min(line.top + ((line.height - height) / 2), window.innerHeight - height - gap);
  previewElement.style.left = `${Math.round(Math.max(gap, left))}px`;
  previewElement.style.top = `${Math.round(Math.max(gap, top))}px`;
}

/** Built from DOM nodes — file names are arbitrary user data. */
function renderPreview(app, row, preview) {
  previewElement ??= Object.assign(document.createElement("div"), { className: "dt-fp-preview" });
  if (!previewElement.isConnected) document.body.append(previewElement);

  const img = document.createElement("img");
  img.alt = "";
  const name = document.createElement("div");
  name.className = "dt-fp-preview__name";
  name.textContent = row.dataset.name ?? splitPath(row.dataset.path).file;
  const stats = document.createElement("div");
  stats.className = "dt-fp-preview__stats";
  previewElement.replaceChildren(img, name, stats);

  const size = previewSize();
  previewElement.style.setProperty("--dt-fp-size", `${size}px`);
  const fill = () => {
    const shown = displaySize(img.naturalWidth, img.naturalHeight, size);
    if (shown) Object.assign(img.style, { width: `${shown.width}px`, height: `${shown.height}px` });
    stats.replaceChildren(...statNodes(app, preview, img));
    placePreview(app, row);
  };
  img.addEventListener("load", fill, { once: true });
  img.addEventListener("error", () => {
    stats.replaceChildren(stat(game.i18n.localize("DT.FilePickerPreview.LoadFailed")));
    placePreview(app, row);
  }, { once: true });
  img.src = preview.src;
  previewElement.classList.add("is-visible");
  fill();
}

/* ------------------------------------------------------------------ */
/*  FilePicker hooks                                                  */
/* ------------------------------------------------------------------ */

/** FilePicker roots that have our listeners — the root survives partial re-renders. */
const boundRoots = new WeakSet();

function onRenderFilePicker(app, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  root.classList.toggle(CLASS_TILE_NAMES, !!game.settings.get(MODULE_ID, KEY_TILE_NAMES));
  if (hover && !hover.row.isConnected) hidePreview();    // the list was re-rendered
  if (boundRoots.has(root)) return;
  boundRoots.add(root);

  // Passive listeners only: nothing is prevented or stopped, so core's pickFile action and its
  // DragDrop see every event exactly as without this module.
  root.addEventListener("pointerover", event => onPointerOver(app, event));
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("dragstart", () => hidePreview({ cool: true }), true);
  root.addEventListener("scroll", () => hidePreview(), true);
}

function refreshTileNames(enabled) {
  const FilePicker = foundry.applications.apps.FilePicker;
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof FilePicker) app.element?.classList.toggle(CLASS_TILE_NAMES, !!enabled);
  }
}

/** For tools/test-features.mjs only. */
export const internals = {
  hash, cacheSlot, indexFiles, resolvePreview, onRenderFilePicker, previewSize, displaySize,
  onPointerOver, onPointerOut, hidePreview, timing, hoverState: () => hover,
  idle: () => queue,
  reset() {
    for (const set of [indexes, pending, noThumbnail, checked, knownDirs]) set.clear();
    creationDisabled = false;
    queue = Promise.resolve();
  }
};

export default {
  id: "filePickerPreview",
  category: {
    label: "DT.Categories.FilePickerPreview.Label",
    hint: "DT.Categories.FilePickerPreview.Hint"
  },
  settings: [
    {
      key: KEY_HOVER,
      options: {
        name: "DT.Settings.FilePreviewHover.Name",
        hint: "DT.Settings.FilePreviewHover.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        onChange: enabled => { if (!enabled) hidePreview({ cool: true }); }
      }
    },
    {
      key: KEY_SIZE,
      options: {
        name: "DT.Settings.FilePreviewSize.Name",
        hint: "DT.Settings.FilePreviewSize.Hint",
        scope: "user",
        config: true,
        type: Number,
        choices: {
          256: "DT.Settings.FilePreviewSize.Small",
          384: "DT.Settings.FilePreviewSize.Medium",
          512: "DT.Settings.FilePreviewSize.Large"
        },
        default: 384
      }
    },
    {
      key: KEY_TILE_NAMES,
      options: {
        name: "DT.Settings.FilePreviewTileNames.Name",
        hint: "DT.Settings.FilePreviewTileNames.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        onChange: refreshTileNames
      }
    },
    {
      key: KEY_CACHE,
      options: {
        name: "DT.Settings.FilePreviewThumbCache.Name",
        hint: "DT.Settings.FilePreviewThumbCache.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false
      }
    },
    {
      key: KEY_MIN_KB,
      options: {
        name: "DT.Settings.FilePreviewThumbMinKB.Name",
        hint: "DT.Settings.FilePreviewThumbMinKB.Hint",
        scope: "world",
        config: true,
        type: Number,
        range: { min: 0, max: 2000, step: 50 },
        default: 250
      }
    }
  ],
  init() {
    Hooks.on("renderFilePicker", onRenderFilePicker);
    Hooks.on("closeFilePicker", () => hidePreview({ cool: true }));
  }
};
