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
        { error: 'RESEND_API_KEY no está configurada' },
        { status: 500 }
      );
    }

    if (!artistEmail) {
      return NextResponse.json(
        { error: 'El artista no tiene un email configurado' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: 'EZY Studio <hello@ezystudio.app>', // Update this to a verified domain if possible
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
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error al enviar email', details: error.message },
      { status: 500 }
    );
  }
}
