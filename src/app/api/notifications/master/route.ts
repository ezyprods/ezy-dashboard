import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import MasterReadyEmail from '@/components/emails/MasterReadyEmail';

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy');
  
  try {
    const body = await request.json();
    const { artistEmail, artistName, songName, isUpdate, downloadLink } = body;

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY no está configurada, ignorando envío real de email.');
    }

    if (!artistEmail) {
      return NextResponse.json(
        { error: 'El artista no tiene un email configurado' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: 'EZY Studio <hello@ezystudio.app>',
      to: [artistEmail],
      subject: isUpdate ? `Actualización: ${songName}` : `Master Listo: ${songName}`,
      react: MasterReadyEmail({
        artistName,
        songName,
        producerName: process.env.NEXT_PUBLIC_PRODUCER_NAME || 'EZY Studio',
        isUpdate: !!isUpdate,
        portalUrl: downloadLink || '', // Pass portal url or download link
      }),
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error al enviar notificación de master', details: error.message },
      { status: 500 }
    );
  }
}
