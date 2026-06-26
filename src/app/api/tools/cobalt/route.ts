import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    // Call Cobalt API from backend to bypass browser CORS restrictions
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // Spoof user-agent to avoid generic blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        url: url,
        isAudioOnly: true,
        aFormat: 'mp3'
      })
    });

    if (!cobaltRes.ok) {
      return NextResponse.json({ error: 'El servicio de Cobalt está temporalmente indisponible.' }, { status: 502 });
    }

    const data = await cobaltRes.json();
    
    if (data.status === 'error') {
      return NextResponse.json({ error: data.text || 'Error procesando video en Cobalt' }, { status: 400 });
    }

    return NextResponse.json({ downloadUrl: data.url });

  } catch (error: any) {
    console.error('Cobalt proxy error:', error);
    return NextResponse.json({ error: 'Error al conectar con el servicio de extracción' }, { status: 500 });
  }
}
