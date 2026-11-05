import type { IgAccountInfo, IgPost, IgPostView } from '@/types/instagram';
import { metaConfig, publishingQuota } from './graph';
import { decryptText, signMedia } from './secrets';
import { readConnection } from './store';

export async function accountInfo(withQuota = true): Promise<IgAccountInfo> {
  const cfg = metaConfig();
  if (!cfg.ok) return { connected: false, missingConfig: true };
  const conn = await readConnection();
  if (!conn) return { connected: false };
  const info: IgAccountInfo = {
    connected: true,
    igUserId: conn.igUserId,
    username: conn.username,
    name: conn.name,
    profilePictureUrl: conn.profilePictureUrl,
    connectedAt: conn.connectedAt,
  };
  if (withQuota) {
    try {
      const q = await publishingQuota(conn.igUserId, decryptText(conn.token));
      if (q) {
        info.quotaUsage = q.usage;
        info.quotaTotal = q.total;
      }
    } catch (err) {
      info.error = (err as Error).message;
    }
  }
  return info;
}

/** Lo que ve la página: con la URL de una miniatura pequeña */
export function toView(post: IgPost): IgPostView {
  const rest: IgPost = { ...post };
  delete rest.claim;
  const first = post.media[0];
  // Miniatura pequeña propia (≈50 KB, en caché del navegador); si no hay, la del CDN de Drive
  const small = post.reel?.coverFileId || first?.thumbFileId;
  const thumbUrl = small
    ? `/api/instagram/media/${small}?s=${signMedia(small)}`
    : first ? `/api/instagram/drive/${first.fileId}?thumb=400` : undefined;
  return { ...rest, thumbUrl };
}
