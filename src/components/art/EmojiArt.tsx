"use client";
// Swaps emoji on screen for the drawn art, everywhere inside the game: React text,
// toasts, server messages, translations, Leaflet markers. React owns the text nodes,
// so they're never removed: a node with emoji is blanked and a <span data-art> with
// the art goes right after it. React's later writes to that node (new text) or its
// removal are seen by the observer, which rebuilds or drops the companion span.
import { useEffect } from "react";
import { artHtml } from "./emoji";
import { ensureArt } from "./sprite";

const SKIP = "[data-art],script,style,textarea,input,select,option,title,svg,code,pre,[contenteditable],.no-art";
const companion = new WeakMap<Text, HTMLElement>();
const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

function processText(node: Text) {
  const v = node.nodeValue ?? "";
  const old = companion.get(node);
  if (old) {
    // Our own blanking echoes back as an empty write: keep the art.
    if (v === "") return;
    old.remove();
    companion.delete(node);
  }
  if (!v || !node.parentElement || node.parentElement.closest(SKIP)) return;
  const keys: string[] = [];
  const html = artHtml(esc(v), (k) => keys.push(k));
  if (html === esc(v)) return;
  ensureArt(...keys);
  const span = document.createElement("span");
  span.className = "art-txt";
  span.setAttribute("data-art", "");
  span.innerHTML = html;
  node.after(span);
  companion.set(node, span);
  node.nodeValue = "";
}

function processTree(el: Node) {
  if (el.nodeType === Node.TEXT_NODE) return processText(el as Text);
  if (el.nodeType !== Node.ELEMENT_NODE || (el as Element).closest(SKIP)) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) found.push(n as Text);
  found.forEach(processText);
}

function dropCompanion(n: Node) {
  if (n.nodeType === Node.TEXT_NODE) {
    const span = companion.get(n as Text);
    // Removed by React: its art goes too (unless it already left with the parent).
    if (span && !(n as Text).isConnected) {
      span.remove();
      companion.delete(n as Text);
    }
  }
}

/** Start converting emoji under `root` (default: the whole page). Returns a stop function. */
export function startEmojiArt(root: Element = document.body) {
  processTree(root);
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") processText(r.target as Text);
      else {
        r.removedNodes.forEach(dropCompanion);
        r.addedNodes.forEach(processTree);
      }
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mo.disconnect();
}

/** Mount once inside the game. */
export function EmojiArtLayer() {
  useEffect(() => startEmojiArt(), []);
  return null;
}
