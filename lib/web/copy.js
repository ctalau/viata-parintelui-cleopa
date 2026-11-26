// Clipboard with a fallback for browsers/contexts without the async Clipboard API.
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch {}
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
}
