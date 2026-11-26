// Which `npm run check` warnings block a film (produce --done, YouTube publish). The blender-style checks measure every
// mesh, so a sleeve or a held prop grazing a robe by a few centimetres (≤ 0.15 for a figure 4.2 tall) is reported but not
// visible on screen: those are listed, never blocking. Everything else blocks — a camera inside a wall, a hidden face,
// z-fighting, a shaking camera, a deep collision.
export const MINOR_DEPTH = 0.15;
// A held / carried prop against its holder or a neighbour (`[prop]`) in an APPROVED film (publish, gate: { cuts: false }):
// up to 0.20. The collision BVHs were scrambled until the shared-index fix in lib/engine3/collide.js (indirect BVHs), which
// read these contacts too shallow (0.10–0.15); measured right, the same approved contacts are 0.16–0.18 (047 the ram in
// Spiridon's arms, 049 the basket against the man's leg). New films are still held to MINOR_DEPTH (produce --done).
export const APPROVED_PROP_DEPTH = 0.20;
const CONTACT = /\[(prop|self|bodies|set|ground|door)\]/;

export function warningLines(out) { return String(out).split('\n').filter((l) => /⚠/.test(l)); }

export function isMinor(line, limit = MINOR_DEPTH) {
  if (!CONTACT.test(line)) return false;
  const depths = [...line.matchAll(/(\d+\.\d+)\)?(?![\d.]*s\b)/g)].map((m) => +m[1]).filter((x) => x < 5);
  return depths.length > 0 && Math.max(...depths) <= limit;
}

// A jump cut (`[cut]`) is a planning rule for new films (produce --done blocks it). At publish time the film was already
// reviewed and approved by a person with its cuts, and films made before the check existed must not be held back by it:
// publish passes { cuts: false } and lists them as not blocking. The same for the planning checks added with film 047
// (`skate`, `door`, `vanish`): they block `produce --done` of a new film, not the publishing of an approved one.
export const isCut = (line) => /\[(cut|skate|door|vanish)\]/.test(line);

/** the warnings that block (empty = the film passes the checks) */
export function blocking(out, { cuts = true } = {}) {
  return warningLines(out).filter((l) => !isMinor(l, !cuts && /\[prop\]/.test(l) ? APPROVED_PROP_DEPTH : MINOR_DEPTH) && (cuts || !isCut(l)));
}
