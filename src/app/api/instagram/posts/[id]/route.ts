import { NextResponse, after } from 'next/server';
import { toView } from '@/lib/instagram/account';
import { deletePublished, runPost } from '@/lib/instagram/publisher';
import { deleteMediaFiles, deletePost, getPost, readConnection, savePost } from '@/lib/instagram/store';
import { sanitizeInput } from '@/lib/instagram/validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Cambios sobre una publicación:
 *  { action: 'cancel' | 'reactivate' | 'retry' | 'publishNow' }
 *  o los campos del formulario para editarla (solo si aún no se ha publicado)
 */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await request.json();
    const post = await getPost(id);
    if (!post) return NextResponse.json({ error: 'No existe esa publicación.' }, { status: 404 });

    const busy = post.status === 'PROCESSING';
    const action = body?.action as string | undefined;

    // Borrar de Instagram ahora mismo una ya publicada
    if (action === 'deleteNow') {
      if (post.status !== 'PUBLISHED' || post.deletedAt) return NextResponse.json({ error: 'Solo se pueden borrar publicaciones que estén en Instagram.' }, { status: 409 });
      const conn = await readConnection();
      if (!conn) return NextResponse.json({ error: 'Conecta la cuenta de Instagram.' }, { status: 409 });
      post.deleteGaveUp = false;
      post.deleteAttempts = 0;
      const after = await deletePublished(post, conn);
      if (!after.deletedAt) return NextResponse.json({ error: after.deleteError || 'No se pudo borrar.', post: toView(after) }, { status: 502 });
      return NextResponse.json({ post: toView(after) });
    }

    // Cambiar o quitar la hora de borrado (también en las ya publicadas)
    if (action === 'setDelete') {
      if (post.deletedAt) return NextResponse.json({ error: 'Ya está borrada.' }, { status: 409 });
      if (body.deleteAt) {
        const d = new Date(body.deleteAt);
        if (isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) return NextResponse.json({ error: 'Elige una hora de borrado en el futuro.' }, { status: 400 });
        post.deleteAt = d.toISOString();
      } else {
        post.deleteAt = undefined;
      }
      post.deleteGaveUp = false;
      post.deleteAttempts = 0;
      post.deleteError = undefined;
      await savePost(post);
      return NextResponse.json({ post: toView(post) });
    }

    if (action === 'cancel') {
      if (busy || post.status === 'PUBLISHED') return NextResponse.json({ error: 'Ya se está publicando o ya está publicada.' }, { status: 409 });
      post.status = 'CANCELLED';
      await savePost(post);
      return NextResponse.json({ post: toView(post) });
    }

    if (action === 'reactivate' || action === 'retry' || action === 'publishNow') {
      if (busy || post.status === 'PUBLISHED') return NextResponse.json({ error: 'Ya se está publicando o ya está publicada.' }, { status: 409 });
      const now = action === 'publishNow' || new Date(post.scheduledFor).getTime() <= Date.now();
      if (now && !(await readConnection())) {
        return NextResponse.json({ error: 'Conecta la cuenta de Instagram antes de publicar.' }, { status: 409 });
      }
      post.status = 'PENDING';
      post.error = undefined;
      post.attempts = 0;
      post.containers = undefined;
      post.claim = undefined;
      if (now) post.scheduledFor = new Date().toISOString();
      await savePost(post);
      if (now) after(async () => { await runPost(post.id, 50000).catch(err => console.error('[instagram] publicar ya', err)); });
      return NextResponse.json({ post: toView(post), publishing: now });
    }

    // Edición completa
    if (busy || post.status === 'PUBLISHED') {
      return NextResponse.json({ error: 'Una publicación ya enviada a Instagram no se puede editar desde aquí.' }, { status: 409 });
    }
    const { input, error } = sanitizeInput(body);
    if (!input) return NextResponse.json({ error }, { status: 400 });
    const { scheduledFor, ...rest } = input;
    if (!scheduledFor) return NextResponse.json({ error: 'Indica la fecha y la hora.' }, { status: 400 });
    Object.assign(post, rest, {
      scheduledFor,
      status: post.status === 'CANCELLED' || post.status === 'FAILED' ? post.status : 'PENDING',
      containers: undefined,
    });
    await savePost(post);
    return NextResponse.json({ post: toView(post) });
  } catch (err) {
    console.error('[api/instagram/posts/:id] PATCH', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Quita la publicación de la lista y sus archivos de Medios (no la borra de Instagram)
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const post = await getPost(id);
    if (!post) return NextResponse.json({ ok: true });
    if (post.status === 'PROCESSING') return NextResponse.json({ error: 'Se está publicando ahora mismo.' }, { status: 409 });
    await deletePost(id);
    // Sus archivos de Medios ya no hacen falta (Instagram guarda su propia copia)
    await deleteMediaFiles([...post.media.flatMap(m => [m.fileId, m.thumbFileId]), post.reel?.coverFileId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
