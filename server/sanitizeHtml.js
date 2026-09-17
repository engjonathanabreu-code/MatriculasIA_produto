/**
 * server/sanitizeHtml.js
 * ---------------------------------------------------------------------------
 * Sanitizador de HTML por lista de permissoes, sem dependencias externas.
 * Usado para o texto rico dos chamados de suporte: so passam as tags de
 * formatacao do editor (negrito, italico, sublinhado, listas, titulos,
 * alinhamento e tamanho de fonte). Todo o resto e removido ou escapado.
 * ---------------------------------------------------------------------------
 */

const ALLOWED_TAGS = new Set([
  "p", "div", "br", "span", "b", "strong", "i", "em", "u",
  "ul", "ol", "li", "h2", "h3", "blockquote"
]);
const VOID_TAGS = new Set(["br"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title"]);
const ALIGN_VALUES = new Set(["left", "center", "right", "justify", "start", "end"]);
const FONT_SIZES = new Set(["12px", "14px", "16px", "20px", "24px"]);

function escapeText(s) {
  return String(s).replace(/&(?!(?:[a-zA-Z]{2,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanStyle(attrs) {
  const m = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  if (!m) return "";
  const raw = (m[2] != null ? m[2] : m[3] || "").replace(/&quot;/g, "\"");
  const out = [];
  raw.split(";").forEach(function (decl) {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim().toLowerCase();
    if (prop === "text-align" && ALIGN_VALUES.has(val)) out.push("text-align: " + val);
    if (prop === "font-size" && FONT_SIZES.has(val)) out.push("font-size: " + val);
    if (prop === "font-weight" && (val === "bold" || val === "700")) out.push("font-weight: 700");
    if (prop === "font-style" && val === "italic") out.push("font-style: italic");
    if (prop === "text-decoration" || prop === "text-decoration-line") {
      if (val.indexOf("underline") !== -1) out.push("text-decoration: underline");
    }
  });
  return out.length ? ' style="' + out.join("; ") + '"' : "";
}

function sanitizeHtml(input, maxLength) {
  let html = String(input || "").slice(0, maxLength || 60000);
  // remove comentarios e blocos perigosos inteiros
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  DROP_WITH_CONTENT.forEach(function (tag) {
    html = html.replace(new RegExp("<" + tag + "\\b[\\s\\S]*?<\\/" + tag + "\\s*>", "gi"), "");
    html = html.replace(new RegExp("<\\/?" + tag + "\\b[^>]*>", "gi"), "");
  });

  const stack = [];
  let out = "";
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    out += escapeText(html.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === "/";
    let tag = m[2].toLowerCase();
    if (tag === "font") tag = "span";
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (VOID_TAGS.has(tag)) { if (!closing) out += "<br>"; continue; }
    if (closing) {
      const pos = stack.lastIndexOf(tag);
      if (pos === -1) continue;
      while (stack.length > pos) out += "</" + stack.pop() + ">";
    } else {
      if (stack.length > 40) continue;
      stack.push(tag);
      out += "<" + tag + cleanStyle(m[3]) + ">";
    }
  }
  out += escapeText(html.slice(last));
  while (stack.length) out += "</" + stack.pop() + ">";
  return out;
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h2|h3|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = { sanitizeHtml, htmlToText };
