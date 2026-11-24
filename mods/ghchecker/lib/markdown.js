// Issue and pull request bodies for herdr's Markdown view, which draws no images: a body is split into
// text runs and pictures (media.js fetches and draws those), and #12 references become links.
// split and sizeOf from herdr-github by alarboulletmarin (MIT), mods/github/media.js at 75a2b40;
// linkRefs from mods/github/viewer.js there.

const IMAGE = /\[?!\[([^\]]*)\]\(<?(https?:\/\/[^)\s>]+)>?(?:\s+"[^"]*")?\)(?:\]\([^)]*\))?|<img\s[^>]*>/gi;
const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, "i").exec(tag)?.[1];

// Markdown → [{ text } | { image, alt, width }], in order. Fenced code stays text.
export function split(markdown) {
  const parts = [];
  let lines = [], fence = null;
  const flush = () => { if (lines.join("").trim()) parts.push({ text: lines.join("\n") }); lines = []; };
  for (const line of String(markdown ?? "").split("\n")) {
    const mark = /^\s*(```|~~~)/.exec(line)?.[1];
    if (mark || fence) {
      if (mark) fence = fence === mark ? null : fence ?? mark;
      lines.push(line);
      continue;
    }
    let from = 0;
    for (const m of line.matchAll(IMAGE)) {
      const src = m[2] ?? attr(m[0], "src");
      if (!src || !/^https?:\/\//.test(src)) continue;
      lines.push(line.slice(from, m.index));
      flush();
      parts.push({ image: src, alt: m[1] ?? attr(m[0], "alt") ?? "", width: Number(attr(m[0], "width")) || null });
      from = m.index + m[0].length;
    }
    lines.push(line.slice(from));
  }
  flush();
  return parts;
}

// Pixel size from `file` (PNG, JPEG, GIF, WebP), else an SVG's own width/height or viewBox.
export function sizeOf(description, head = "") {
  const all = [...String(description).matchAll(/(\d+)\s*x\s*(\d+)/g)], last = all.at(-1); // JPEG says "density 72x72" first
  if (last && !/svg/i.test(description)) return { width: +last[1], height: +last[2] };
  const svg = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!svg) return null;
  const w = parseFloat(attr(svg, "width")), h = parseFloat(attr(svg, "height"));
  if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };
  const box = /viewBox\s*=\s*["']([^"']+)/i.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number);
  return box?.length === 4 && box[2] > 0 && box[3] > 0 ? { width: Math.round(box[2]), height: Math.round(box[3]) } : null;
}

// #12 and owner/repo#12 outside code become links the viewer opens itself.
export function linkRefs(md, repo) {
  return String(md ?? "").split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, n) => n % 2 ? part
    : part.replace(/(^|[\s(])(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/g, (_m, pre, other, num) => `${pre}[${other ?? ""}#${num}](https://github.com/${other ?? repo}/issues/${num})`)).join("");
}
