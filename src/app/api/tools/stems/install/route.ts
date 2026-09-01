import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  try {
    const clientToken = req.headers.get('x-replicate-token') || req.nextUrl.searchParams.get('token');
    const cloudToken = clientToken || process.env.REPLICATE_API_TOKEN;
    const hasCloud = Boolean(cloudToken && cloudToken.trim().length > 5);

    let hasPython = false;
    let hasLocalDemucs = false;

    // Check if python is available locally
    try {
      await execAsync('python --version');
      hasPython = true;
      try {
        await execAsync('python -m demucs --help');
        hasLocalDemucs = true;
      } catch {
        hasLocalDemucs = false;
      }
    } catch {
      hasPython = false;
      hasLocalDemucs = false;
    }

    if (hasCloud) {
      return NextResponse.json({ 
        status: 'ready', 
        engine: 'cloud', 
        cloudAvailable: true,
        localAvailable: hasLocalDemucs,
        hasPython,
        message: 'Motor de IA en la nube (GPU Replicate) conectado y listo.' 
      });
    }

    if (hasLocalDemucs) {
      return NextResponse.json({ 
        status: 'ready', 
        engine: 'local', 
        cloudAvailable: false,
        localAvailable: true,
        hasPython: true,
        message: 'Demucs local está instalado y listo en tu ordenador.' 
      });
    }

    if (hasPython) {
      return NextResponse.json({ 
        status: 'no_demucs', 
        cloudAvailable: false,
        localAvailable: false,
        hasPython: true,
        message: 'Python está instalado en tu PC pero falta instalar Demucs.',
        hasCloudOption: true
      });
    }

    return NextResponse.json({ 
      status: 'no_engine', 
      cloudAvailable: false,
      localAvailable: false,
      hasPython: false,
      message: 'No se detectó Demucs local ni token de IA en la nube.',
      hasCloudOption: true
    });

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
      // Install demucs and soundfile via python -m pip
      const installProc = spawn('python', ['-m', 'pip', 'install', 'demucs', 'soundfile']);
      
      let out = '';
      installProc.stdout.on('data', data => out += data.toString());
      installProc.stderr.on('data', data => out += data.toString());

      installProc.on('close', async (code) => {
        if (code === 0) {
          // On Windows, uninstall torchcodec if present to avoid DLL error
          try {
            await execAsync('python -m pip uninstall -y torchcodec');
          } catch {}
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
