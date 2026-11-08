import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { findAndReadJsonFile, getDriveService } from '@/lib/drive';
import { STUDIO_COOKIE, verifyStudioToken } from '@/lib/studioAuth';
import { isArtistFolder } from '@/lib/driveScope';
import { requireStudioOrPortalSession } from '@/lib/routeAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Where the "an artist downloaded something" alerts go. Override with DOWNLOAD_ALERT_EMAIL in the env.
const ALERT_TO = process.env.DOWNLOAD_ALERT_EMAIL || 'pablolt03@gmail.com';
const MAX_FILES = 25;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function formatSize(bytes?: string | number | null) {
  const n = Number(bytes);
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * POST: the artist portal reports a download, silently (the artist never sees anything).
 * Body: { kind: 'file' | 'beat' | 'release' | 'folder', context?: string, files: [{ id, name? }] }
 * Sends a short email to the producer. Downloads made from a browser that is unlocked
 * as the studio (the producer checking the portal) are not reported.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (verifyStudioToken(request.cookies.get(STUDIO_COOKIE)?.value)) {
      return NextResponse.json({ ok: true, skipped: 'studio' });
    }
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, skipped: 'no-mail' });

    const { id } = await params;
    if (!(await isArtistFolder(id))) return NextResponse.json({ ok: false }, { status: 404 });
    // Without the portal session anyone could make the server send these emails
    const denied = await requireStudioOrPortalSession(id);
    if (denied) return denied;
    const body = await request.json().catch(() => ({}));
    const kind = ['file', 'beat', 'release', 'folder'].includes(body.kind) ? body.kind : 'file';
    const context = typeof body.context === 'string' ? body.context.trim().slice(0, 200) : '';
    const requested: { id: string; name: string }[] = (Array.isArray(body.files) ? body.files : [])
      .filter((f: any) => f && typeof f.id === 'string' && DRIVE_ID.test(f.id))
      .slice(0, MAX_FILES)
      .map((f: any) => ({ id: f.id, name: typeof f.name === 'string' ? f.name.slice(0, 200) : '' }));
    if (requested.length === 0) return NextResponse.json({ ok: false }, { status: 400 });

    const artistConfig = await findAndReadJsonFile<any>('artist_config.json', id).catch(() => null);
    if (!artistConfig) return NextResponse.json({ ok: false }, { status: 404 });

    // Names come from Drive, not from the browser, so the email always says what was really downloaded
    const drive = getDriveService();
    const files = (await Promise.all(requested.map(async f => {
      try {
        const res = await drive.files.get({ fileId: f.id, fields: 'id, name, size, webViewLink', supportsAllDrives: true });
        return { name: res.data.name || f.name, size: formatSize(res.data.size), link: res.data.webViewLink || '' };
      } catch {
        return null;
      }
    }))).filter(Boolean) as { name: string; size: string; link: string }[];
    if (files.length === 0) return NextResponse.json({ ok: false }, { status: 404 });

    const artistName = artistConfig.name || 'Un artista';
    const when = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });
    const what = kind === 'folder' ? 'ha abierto la carpeta para descargarla'
      : kind === 'release' ? 'ha descargado un lanzamiento'
      : kind === 'beat' ? (files.length > 1 ? 'ha descargado beats' : 'ha descargado un beat')
      : files.length > 1 ? `ha descargado ${files.length} archivos` : 'ha descargado un archivo';
    const subject = files.length === 1 ? `⬇️ ${artistName} ha descargado «${files[0].name}»` : `⬇️ ${artistName} ${what}`;
    const origin = request.nextUrl.origin;

    const rows = files.map(f => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;color:#111">
          ${f.link ? `<a href="${escapeHtml(f.link)}" style="color:#111;text-decoration:none">${escapeHtml(f.name)}</a>` : escapeHtml(f.name)}
        </td>
        <td style="padding:8px 0 8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#888;text-align:right;white-space:nowrap">${escapeHtml(f.size)}</td>
      </tr>`).join('');

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#888">Portal de artistas</p>
        <h2 style="margin:0 0 16px;font-size:18px;color:#111"><strong>${escapeHtml(artistName)}</strong> ${what}</h2>
        ${context ? `<p style="margin:0 0 12px;font-size:13px;color:#555">${escapeHtml(context)}</p>` : ''}
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="margin:16px 0 0;font-size:12px;color:#888">${escapeHtml(when)}</p>
        <p style="margin:16px 0 0;font-size:12px"><a href="${escapeHtml(`${origin}/artists/${id}`)}" style="color:#7c3aed">Abrir ficha del artista</a></p>
      </div>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'EZY Studio <hello@ezystudio.app>',
      to: [ALERT_TO],
      subject,
      html,
    });
    if (error) {
      console.error('Download alert email error:', error);
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('API /portal/[id]/downloads POST error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
