/**
 * Caps an open-ended `Range: bytes=N-` before it is proxied from Drive.
 *
 * A function pushes bytes to Vercel's CDN faster than a media player reads them,
 * so an open-ended stream bills Fast Origin Transfer for the rest of the file even
 * if the listener skips after ten seconds. Answering part of it is valid HTTP and
 * every browser simply asks for the next part when it needs it.
 *
 * Closed ranges pass through untouched: Safari expects exactly what it asked for.
 */
export function boundedRange(range: string | null, maxBytes: number): string | null {
  const open = range ? /^bytes=(\d+)-$/.exec(range.trim()) : null;
  if (!open) return range;
  const start = Number(open[1]);
  return `bytes=${start}-${start + maxBytes - 1}`;
}
