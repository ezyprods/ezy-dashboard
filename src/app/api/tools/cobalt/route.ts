import { NextResponse } from 'next/server';

const COBALT_INSTANCES = [
  'https://cobalt.kwiatekgames.pl',
  'https://co.wuk.sh',
  'https://cobalt.q0.ooguy.com',
  'https://api.cobalt.tools'
];

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    let downloadUrl = null;
    let lastError = null;

    // Try each instance until one succeeds
    for (const instance of COBALT_INSTANCES) {
      try {
        const cobaltRes = await fetch(`${instance}/api/json`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': instance,
            'Referer': `${instance}/`
          },
          body: JSON.stringify({
            url: url,
            isAudioOnly: true,
            aFormat: 'mp3'
          }),
          // Next.js fetch options to avoid caching
          cache: 'no-store'
        });

        if (cobaltRes.ok) {
          const data = await cobaltRes.json();
          if (data.status !== 'error' && data.url) {
            downloadUrl = data.url;
            break; // Success!
          } else {
            lastError = data.text || 'Error en respuesta';
          }
        } else {
           // Si falla con 4xx o 5xx probamos la nueva API v7 por si acaso en esa instancia
           const v7Res = await fetch(instance, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              },
              body: JSON.stringify({
                url: url,
                downloadMode: 'audio',
                audioFormat: 'mp3'
              }),
              cache: 'no-store'
           });
           
           if (v7Res.ok) {
              const dataV7 = await v7Res.json();
              if (dataV7.status !== 'error' && dataV7.url) {
                downloadUrl = dataV7.url;
                break;
              }
           }
           lastError = `HTTP ${cobaltRes.status}`;
        }
      } catch (err: any) {
        lastError = err.message;
        continue;
      }
    }

    if (!downloadUrl) {
      console.error('All cobalt instances failed. Last error:', lastError);
      return NextResponse.json({ error: 'Todos los servidores de extracción están saturados. Inténtalo más tarde.' }, { status: 502 });
    }

    return NextResponse.json({ downloadUrl });

  } catch (error: any) {
    console.error('Cobalt proxy error:', error);
    return NextResponse.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
