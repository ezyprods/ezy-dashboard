import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';

export const dynamic = 'force-dynamic';

async function read(id: string) {
  const data = (await findAndReadJsonFile<any>('portal_feedback.json', id).catch(() => null)) || { feedback: [] };
  if (!Array.isArray(data.feedback)) data.feedback = [];
  return data;
}

/** Producer inbox: every message the artist sent from the portal (and the producer's replies). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await read(id);
    return NextResponse.json({ feedback: data.feedback });
  } catch (error: any) {
    return NextResponse.json({ error: 'No se pudieron leer los comentarios', details: error.message }, { status: 500 });
  }
}

/** Reply to the artist (visible in their portal). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
    if (!message) return NextResponse.json({ error: 'El mensaje está vacío' }, { status: 400 });
    const data = await read(id);
    const reply = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message,
      authorName: typeof body.authorName === 'string' && body.authorName.trim() ? body.authorName.trim() : 'Productor',
      fromProducer: true,
      replyTo: typeof body.replyTo === 'string' ? body.replyTo : null,
      trackId: typeof body.trackId === 'string' ? body.trackId : null,
      trackTitle: typeof body.trackTitle === 'string' ? body.trackTitle : null,
      timestamp: new Date().toISOString(),
      isRead: true,
    };
    // Replying marks the original message as read
    data.feedback = [reply, ...data.feedback.map((f: any) => (f.id === reply.replyTo ? { ...f, isRead: true } : f))];
    await saveJsonFile('portal_feedback.json', data, id);
    return NextResponse.json({ success: true, feedback: reply });
  } catch (error: any) {
    return NextResponse.json({ error: 'No se pudo enviar la respuesta', details: error.message }, { status: 500 });
  }
}

/** Mark messages as read/unread: { ids: string[], isRead: boolean } (ids omitted = all). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const ids: string[] | null = Array.isArray(body.ids) ? body.ids : null;
    const isRead = body.isRead !== false;
    const data = await read(id);
    data.feedback = data.feedback.map((f: any) => (!ids || ids.includes(f.id) ? { ...f, isRead } : f));
    await saveJsonFile('portal_feedback.json', data, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'No se pudo actualizar', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const messageId = new URL(request.url).searchParams.get('messageId');
    if (!messageId) return NextResponse.json({ error: 'Falta messageId' }, { status: 400 });
    const data = await read(id);
    data.feedback = data.feedback.filter((f: any) => f.id !== messageId && f.replyTo !== messageId);
    await saveJsonFile('portal_feedback.json', data, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'No se pudo eliminar', details: error.message }, { status: 500 });
  }
}
