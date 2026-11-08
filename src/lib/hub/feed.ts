import { collectHubSnapshot } from './collect';
import { buildHubFeed, type HubFeed } from './pendientes';
import { publicBaseUrl } from '@/lib/instagram/publisher';

/**
 * Server-side cache of the hub feed: Drive is read at most once every 5 minutes per server
 * instance, and simultaneous requests share the same read.
 */
const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; feed: HubFeed } | null = null;
let inFlight: Promise<HubFeed> | null = null;

export async function getHubFeed(): Promise<HubFeed> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.feed;
  inFlight ??= (async () => {
    const snapshot = await collectHubSnapshot();
    const feed = buildHubFeed(snapshot, new Date(), publicBaseUrl());
    cached = { at: Date.now(), feed };
    return feed;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Only for tests */
export function resetHubFeedCache() {
  cached = null;
  inFlight = null;
}
