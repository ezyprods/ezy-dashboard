'use client';

import { useEffect, useRef } from 'react';
import { detectAudioFeatures } from '@/lib/utils/audio';

export function AudioMetadataWorker() {
  const isRunning = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const runWorker = async () => {
      if (isRunning.current) return;
      isRunning.current = true;
      try {
        const res = await fetch('/api/files/analyze');
        if (!res.ok) throw new Error('Worker fetch failed');
        const data = await res.json();
        const files = data.files || [];

        for (const file of files) {
          try {
            console.log(`[Audio Worker] Analyzing file: ${file.name}...`);
            // Fetch audio data
            const audioRes = await fetch(`/api/files/${file.id}?inline=true`);
            if (!audioRes.ok) continue;
            const blob = await audioRes.blob();

            // Analyze
            const { bpm, key } = await detectAudioFeatures(blob);

            // Update
            await fetch('/api/files/analyze', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileId: file.id, bpm, key })
            });
            console.log(`[Audio Worker] Finished ${file.name}: BPM=${bpm}, Key=${key}`);
          } catch (e) {
            console.error(`[Audio Worker] Error analyzing file ${file.name}:`, e);
            // Even on error, we might want to patch as unknown so it doesn't loop,
            // but let's wait next time in case it was a network error.
          }
        }
      } catch (e) {
        console.error('[Audio Worker] Global error:', e);
      } finally {
        isRunning.current = false;
      }
    };

    // Run initially after 10 seconds to not block page load
    const initialTimer = setTimeout(runWorker, 10000);
    // Run every 5 minutes
    const intervalTimer = setInterval(runWorker, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return null; // Silent worker
}
