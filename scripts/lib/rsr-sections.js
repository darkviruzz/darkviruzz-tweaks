/**
 * RSReforged 6 (dnd5e 6) shows dnd5e's attack and damage messages as sections of its usage card
 * — `.rsr-section-attack[data-message-id]` / `.rsr-section-damage[data-message-id]`, the id being
 * the child message — and hides the child cards themselves. Anything a feature adds to a child
 * card must therefore also go into that section. RSReforged appends the sections after an await,
 * i.e. after `dnd5e.renderChatMessage` returned, so the card is watched for a short while.
 */

/** Card root → selectors already watched on it. */
const watched = new WeakMap();

/**
 * Call `decorate(section, childMessage)` for every matching section of an RSReforged card, now
 * and while sections keep appearing (10 s). `decorate` must be idempotent.
 * @param {HTMLElement} root
 * @param {string} selector                                   e.g. ".rsr-section-damage[data-message-id]"
 * @param {(section: HTMLElement, message: object) => void} decorate
 */
export function watchRsrSections(root, selector, decorate) {
  if (!game.modules?.get("rsreforged")?.active) return;
  const run = () => {
    for (const section of root.querySelectorAll(selector)) {
      const child = game.messages?.get(section.dataset.messageId);
      if (child) decorate(section, child);
    }
  };
  run();
  if (typeof MutationObserver !== "function") return;
  const selectors = watched.get(root) ?? new Set();
  if (selectors.has(selector)) return;
  selectors.add(selector);
  watched.set(root, selectors);
  const observer = new MutationObserver(run);
  observer.observe(root, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
}
