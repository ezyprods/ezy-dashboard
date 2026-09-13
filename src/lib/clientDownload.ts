'use client';

/**
 * Saves a fetch() response body as a file on the user's device.
 * The filename is taken from `X-Output-Filename` (URI encoded) when present.
 */
export async function downloadResponseAsFile(res: Response, fallbackName: string): Promise<string> {
  const header = res.headers.get('X-Output-Filename');
  let fileName = fallbackName;
  if (header) {
    try { fileName = decodeURIComponent(header); } catch { fileName = header; }
  }
  const blob = await res.blob();
  downloadBlob(blob, fileName);
  return fileName;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give the browser (especially iOS Safari) time to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
