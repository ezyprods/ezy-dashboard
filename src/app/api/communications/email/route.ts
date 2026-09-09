import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import ProjectUpdateEmail from '@/components/emails/ProjectUpdateEmail';

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy');
  try {
    const body = await request.json();
    const { artistEmail, artistName, projectName, message, portalUrl } = body;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'El servicio de correo (RESEND_API_KEY) no está configurado en el servidor.', missingConfig: true },
        { status: 503 }
      );
    }

    if (!artistEmail) {
      return NextResponse.json(
        { error: 'El artista no tiene un email configurado' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'EZY Studio <hello@ezystudio.app>',
      to: [artistEmail],
      subject: `Actualización: ${projectName}`,
      react: ProjectUpdateEmail({
        artistName,
        projectName,
        producerName: process.env.NEXT_PUBLIC_PRODUCER_NAME || 'EZY Studio',
        message,
        portalUrl,
      }),
    });

    if (error) {
      const errorDetail = (error as any)?.message || JSON.stringify(error);
      return NextResponse.json({ error: `Error de envío: ${errorDetail}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error al procesar envío de email', details: error.message },
      { status: 500 }
    );
  }
}
