// Labels as the settings want them: shown or not (labels.show), in their GitHub color or in one quiet theme color
// (labels.color "mono").

// The labels to draw, at most `max`; none when labels.show is off.
export function visibleLabels(labels, settings = {}, max = Infinity) {
  if (settings["labels.show"] === false) return [];
  return (Array.isArray(labels) ? labels : []).filter((l) => l && typeof l.name === "string").slice(0, max);
}

// A label's own color as "#rrggbb", or null: mono mode, or a color GitHub did not send as six hex digits.
export function labelHex(label, settings = {}) {
  if (settings["labels.color"] === "mono") return null;
  const c = String(label?.color ?? "").replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : null;
}
