// Translation checker: `npm run i18n:check` (add --lint to also list English text that
// isn't wrapped in t() yet).
//
// 1. Every t("…") / msg("…") / translate(l, "…") key in src must have a Persian
//    translation, and both sides must use the same {placeholders}.
// 2. Keys must be literal strings — t(`Hi ${name}`) can never be translated; write
//    t("Hi {name}", { name }) instead.
// 3. --lint: JSX text, user-facing attributes and messages (toasts, dialogs, errors)
//    that still contain English outside t().
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import fa from "../src/lib/i18n/fa";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const lint = process.argv.includes("--lint");

const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p !== join(SRC, "lib/i18n/fa")) walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) files.push(p);
  }
})(SRC);

const keys = new Map<string, string>(); // key → first place it's used
const problems: string[] = [];
const candidates: string[] = [];

const ENGLISH = /[A-Za-z]{2,}/;
const USER_ATTRS = new Set(["title", "placeholder", "aria-label", "alt", "label", "body", "ok", "cancel"]);
/** Calls whose message argument is shown to the player. */
const SHOWN_CALLS = /^(toast|askConfirm|askText|celebrate|setPicker|pick|HttpError|Error|ApiError)$/;
/** Text that's fine untranslated: units of code, emoji-only, brand names, CSS-ish values. */
const IGNORE = /^(StreetQuest|STREET|QUEST|OK|XP|HP|PIN|GPS|FPS|SMG|LMG|C4|SAM|km\/h|vs|×|·|—|\s)+$/;

function placeholders(s: string) {
  // Top-level {name} and {name, plural|select …} arguments.
  const out = new Set<string>();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{") {
      if (depth === 0) {
        const m = /^\{\s*([A-Za-z_][\w]*)\s*[,}]/.exec(s.slice(i));
        if (m) out.add(m[1]);
      }
      depth++;
    } else if (s[i] === "}") depth = Math.max(0, depth - 1);
  }
  return [...out].sort().join(",");
}

const where = (sf: ts.SourceFile, node: ts.Node) => `${relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;

function calleeName(e: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

function literalText(n: ts.Node): string | null {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

/** Static text of a template literal (what's left once the ${…} parts are removed). */
const staticText = (s: string) => s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, "");

/** A literal that's compared or used as a key, not shown: kind === "chest", ["a", "b"].includes(x). */
function isCodeLiteral(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isArrayLiteralExpression(p) || ts.isElementAccessExpression(p) || ts.isCaseClause(p)) return true;
  if (ts.isCallExpression(p) && p.arguments.includes(node as ts.Expression)) {
    const name = calleeName(p.expression);
    if (name && /^(setTab|setPanel|setKind|setSide|setSort|setFilter|setScope|setBy|setMode|includes|startsWith|endsWith|get|has|sfx|api|startMatch|doFlag|onLobby|marchOn|shoot|go|setMeTab|setAskPush|station|setPerfMode|setCat|toggle|root)$/.test(name)) return true;
  }
  return false;
}

/** Is `node` (somewhere) inside a t()/msg() call? */
function insideT(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const name = calleeName(p.expression);
      if (name === "t" || name === "T" || name === "tr" || name === "msg" || name === "translate") return true;
    }
  }
  return false;
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isAdminOrDev = /AdminPanel|AdminSettings|admin\/|api\/health|api\/admin|api\/cron|scripts\//.test(file);

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      const argIdx = name === "translate" ? 1 : 0;
      if ((name === "t" || name === "T" || name === "tr" || name === "msg" || name === "translate") && node.arguments.length > argIdx) {
        const arg = node.arguments[argIdx];
        const lit = literalText(arg);
        if (lit !== null) {
          if (!keys.has(lit)) keys.set(lit, where(sf, arg));
        } else if (ts.isTemplateExpression(arg)) problems.push(`${where(sf, arg)}  dynamic key — use {placeholders}: ${arg.getText(sf).slice(0, 80)}`);
      }
      if (lint && name && SHOWN_CALLS.test(name)) {
        for (const a of node.arguments) {
          const strs: ts.Node[] = [];
          if (ts.isObjectLiteralExpression(a)) {
            for (const p of a.properties) if (ts.isPropertyAssignment(p) && ["title", "body", "label", "ok", "cancel"].includes(p.name.getText(sf))) strs.push(p.initializer);
          } else strs.push(a);
          for (const s of strs) {
            const raw = literalText(s) ?? (ts.isTemplateExpression(s) ? s.getText(sf) : null);
            if (raw && ENGLISH.test(raw) && !IGNORE.test(raw)) candidates.push(`${where(sf, s)}  ${name}(): ${raw.slice(0, 90)}`);
          }
        }
      }
    }
    if (lint && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /^(HttpError|Error|ApiError)$/.test(node.expression.text)) {
      for (const a of node.arguments ?? []) {
        const raw = literalText(a) ?? (ts.isTemplateExpression(a) ? a.getText(sf) : null);
        if (raw && ENGLISH.test(raw) && !IGNORE.test(raw)) candidates.push(`${where(sf, a)}  new ${node.expression.text}: ${raw.slice(0, 90)}`);
      }
    }
    // Server replies and notices: { message: "…" }, { title: "…", body: "…" }
    if (lint && !isAdminOrDev && ts.isPropertyAssignment(node) && /^(message|title|body|label|desc|blurb|name|text)$/.test(node.name.getText(sf)) && !insideT(node)) {
      const v = node.initializer;
      const raw = literalText(v) ?? (ts.isTemplateExpression(v) ? v.getText(sf) : null);
      if (raw && ENGLISH.test(staticText(raw).replace(/^`|`$/g, "")) && !IGNORE.test(raw)) candidates.push(`${where(sf, v)}  ${node.name.getText(sf)}: ${raw.slice(0, 90)}`);
    }
    if (lint && !isAdminOrDev) {
      if (ts.isJsxText(node)) {
        const s = node.text.trim();
        if (s && ENGLISH.test(s) && !IGNORE.test(s)) candidates.push(`${where(sf, node)}  jsx: ${s.slice(0, 90)}`);
      }
      if (ts.isJsxAttribute(node) && USER_ATTRS.has(node.name.getText(sf)) && node.initializer) {
        const init = node.initializer;
        const lit = ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression ? (literalText(init.expression) ?? (ts.isTemplateExpression(init.expression) ? init.expression.getText(sf) : null)) : null;
        if (lit && ENGLISH.test(staticText(lit).replace(/^`|`$/g, "")) && !IGNORE.test(lit)) candidates.push(`${where(sf, node)}  ${node.name.getText(sf)}=: ${lit.slice(0, 90)}`);
      }
      // String literals rendered as JSX children: {cond ? "Text" : "Other"}
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ENGLISH.test(node.text) && !IGNORE.test(node.text) && !insideT(node) && !isCodeLiteral(node)) {
        let p = node.parent;
        while (p && (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
        if (p && ts.isJsxExpression(p) && p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) candidates.push(`${where(sf, node)}  jsx-expr: ${node.text.slice(0, 90)}`);
      }
      if (ts.isTemplateExpression(node) && !insideT(node)) {
        const head = node.getText(sf);
        let p = node.parent;
        while (p && (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p))) p = p.parent;
        if (p && ts.isJsxExpression(p) && p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)) && ENGLISH.test(staticText(head).replace(/^`|`$/g, ""))) candidates.push(`${where(sf, node)}  jsx-template: ${head.slice(0, 90)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const catalog = fa as Record<string, string>;
let missing = 0;
for (const [key, at] of keys) {
  const tr = catalog[key];
  if (tr === undefined) {
    missing++;
    problems.push(`${at}  missing fa: ${JSON.stringify(key)}`);
  } else if (placeholders(key) !== placeholders(tr)) problems.push(`${at}  placeholders differ: ${JSON.stringify(key)} → ${JSON.stringify(tr)}`);
}
const unused = Object.keys(catalog).filter((k) => !keys.has(k));

if (lint) {
  console.log(candidates.join("\n"));
  console.log(`\n${candidates.length} possibly untranslated strings`);
}
if (unused.length && process.argv.includes("--unused")) console.log(`\nUnused translations:\n${unused.map((k) => `  ${JSON.stringify(k)}`).join("\n")}`);
console.log(problems.join("\n"));
console.log(`\n${keys.size} keys · ${missing} missing · ${problems.length - missing} other problems · ${unused.length} unused translations`);
process.exitCode = problems.length ? 1 : 0;
