import { NextResponse, after } from 'next/server';
import { toView } from '@/lib/instagram/account';
import { runPost } from '@/lib/instagram/publisher';
import { listPosts, newPostId, readConnection, savePost } from '@/lib/instagram/store';
import { sanitizeInput } from '@/lib/instagram/validate';
import type { IgPost } from '@/types/instagram';

import { requireStudio } from '@/lib/routeAuth';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const denied = await requireStudio();
  if (denied) return denied;
  try {
    const posts = await listPosts();
    posts.sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
    return NextResponse.json({ posts: posts.map(toView) });
  } catch (err) {
    console.error('[api/instagram/posts] GET', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Crear: programada (scheduledFor en el futuro) o "publicar ahora" (sin scheduledFor)
export async function POST(request: Request) {
  const denied = await requireStudio();
  if (denied) return denied;
  try {
    const { input, error } = sanitizeInput(await request.json());
    if (!input) return NextResponse.json({ error }, { status: 400 });

    const now = new Date();
    const publishNow = !input.scheduledFor || new Date(input.scheduledFor).getTime() <= now.getTime() + 30_000;
    if (publishNow && !(await readConnection())) {
      return NextResponse.json({ error: 'Conecta la cuenta de Instagram antes de publicar.' }, { status: 409 });
    }

    const { scheduledFor, ...rest } = input;
    const post: IgPost = {
      ...rest,
      id: newPostId(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: 'PENDING',
      scheduledFor: publishNow ? now.toISOString() : scheduledFor!,
      attempts: 0,
    };
    await savePost(post);

    if (publishNow) {
      // La publicación sigue en el servidor aunque se cierre la pestaña; si es un vídeo largo,
      // el activador la termina en las siguientes pasadas.
      after(async () => {
        try {
          await runPost(post.id, 50000);
        } catch (err) {
          console.error('[api/instagram/posts] publicar ahora', err);
        }
      });
    }
    return NextResponse.json({ post: toView(post), publishing: publishNow });
  } catch (err) {
    console.error('[api/instagram/posts] POST', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
