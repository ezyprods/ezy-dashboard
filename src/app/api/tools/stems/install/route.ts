import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  try {
    const clientToken = req.headers.get('x-replicate-token') || req.nextUrl.searchParams.get('token');
    const cloudToken = clientToken || process.env.REPLICATE_API_TOKEN;

    if (cloudToken && cloudToken.trim().length > 5) {
      return NextResponse.json({ 
        status: 'ready', 
        engine: 'cloud', 
        message: 'Motor de IA en la nube (GPU Replicate) conectado y listo.' 
      });
    }

    // Check if python is available locally
    try {
      await execAsync('python --version');
      
      // Check if demucs is installed
      try {
        await execAsync('python -m demucs --help');
        return NextResponse.json({ 
          status: 'ready', 
          engine: 'local', 
          message: 'Demucs local está instalado y listo.' 
        });
      } catch {
        return NextResponse.json({ 
          status: 'no_demucs', 
          message: 'Python está disponible pero falta instalar Demucs.',
          hasCloudOption: true
        });
      }
    } catch {
      return NextResponse.json({ 
        status: 'no_engine', 
        message: 'No se detectó Python local ni token de IA en la nube.',
        hasCloudOption: true
      });
    }
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    // Verify Replicate token
    if (body.action === 'verify_token') {
      const token = body.token || process.env.REPLICATE_API_TOKEN;
      if (!token) {
        return NextResponse.json({ error: 'Token no proporcionado' }, { status: 400 });
      }

      const res = await fetch('https://api.replicate.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json({ 
          valid: false, 
          error: errorData.detail || 'Token de Replicate inválido o sin permisos.' 
        }, { status: 401 });
      }

      return NextResponse.json({ valid: true, message: 'Token de Replicate verificado correctamente.' });
    }

    // Check python first for local installation
    try {
      await execAsync('python --version');
    } catch {
      return NextResponse.json({ error: 'Debes instalar Python primero o configurar un token de nube' }, { status: 400 });
    }

    return new Promise<NextResponse>((resolve) => {
      const installProc = spawn('pip', ['install', 'demucs']);
      
      let out = '';
      installProc.stdout.on('data', data => out += data.toString());
      installProc.stderr.on('data', data => out += data.toString());

      installProc.on('close', (code) => {
        if (code === 0) {
          resolve(NextResponse.json({ success: true, message: 'Demucs instalado correctamente en local' }));
        } else {
          resolve(NextResponse.json({ error: 'Fallo al instalar Demucs', logs: out }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
