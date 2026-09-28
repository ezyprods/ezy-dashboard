import { redirect } from 'next/navigation';
import { SPOTIFY_STATE_PREFIX } from '@/lib/spotify';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The Redirect URI registered in the Spotify app is the site root, so the
  // OAuth callback lands here — forward it to the real handler.
  const params = await searchParams;
  const state = typeof params.state === 'string' ? params.state : '';
  if (state.startsWith(SPOTIFY_STATE_PREFIX)) {
    const query = new URLSearchParams();
    for (const key of ['code', 'state', 'error']) {
      const value = params[key];
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(`/api/spotify/callback?${query}`);
  }

  redirect('/dashboard');
}
