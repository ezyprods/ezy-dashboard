import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  try {
    // Check if python is available
    try {
      await execAsync('python --version');
    } catch {
      return NextResponse.json({ status: 'no_python', message: 'Python no está instalado en el sistema.' });
    }

    // Check if demucs is installed
    try {
      await execAsync('python -m demucs --help');
      return NextResponse.json({ status: 'ready', message: 'Demucs está instalado y listo.' });
    } catch {
      return NextResponse.json({ status: 'no_demucs', message: 'Demucs no está instalado.' });
    }
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check python first
    try {
      await execAsync('python --version');
    } catch {
      return NextResponse.json({ error: 'Debes instalar Python primero' }, { status: 400 });
    }

    // Install demucs using spawn to stream logs or just wait
    // We will just wait for it since it's an API route. 
    // Usually it can take a minute or two, so we better use spawn and return immediately if we want async,
    // But since Next.js API can wait, let's just await execAsync
    
    // To prevent Vercel/NextJS timeouts (though locally it's fine), we can do it asynchronously
    // or just run it and let the client poll the GET endpoint.
    
    return new Promise((resolve) => {
      const installProc = spawn('pip', ['install', 'demucs']);
      
      let out = '';
      installProc.stdout.on('data', data => out += data.toString());
      installProc.stderr.on('data', data => out += data.toString());

      installProc.on('close', (code) => {
        if (code === 0) {
          resolve(NextResponse.json({ success: true, message: 'Demucs instalado correctamente' }));
        } else {
          resolve(NextResponse.json({ error: 'Fallo al instalar Demucs', logs: out }, { status: 500 }));
        }
      });
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
