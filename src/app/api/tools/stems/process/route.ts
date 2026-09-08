import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { stemsTasks, broadcastStems } from '../state';
import { getDriveService } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let driveFileId: string | null = null;
    let file: File | null = null;
    let filename = 'audio.mp3';
    let fileType = 'audio/mpeg';
    let preferredEngine: string | null = null;
    let clientToken: string | null = null;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      driveFileId = body.driveFileId || null;
      filename = body.filename || 'audio.mp3';
      fileType = body.mimeType || 'audio/mpeg';
      preferredEngine = body.engine || null;
      clientToken = req.headers.get('x-replicate-token') || body.replicateToken || null;
    } else {
      const formData = await req.formData();
      file = formData.get('file') as File | null;
      driveFileId = (formData.get('driveFileId') as string) || null;
      if (file) {
        filename = file.name;
        fileType = file.type || 'audio/mpeg';
      } else if (formData.get('filename')) {
        filename = formData.get('filename') as string;
      }
      preferredEngine = formData.get('engine') as string | null;
      clientToken = req.headers.get('x-replicate-token') || (formData.get('replicateToken') as string | null);
    }

    const token = clientToken || process.env.REPLICATE_API_TOKEN;

    if (!file && !driveFileId) {
      return NextResponse.json({ error: 'No se proporcionó un archivo de audio válido' }, { status: 400 });
    }

    const fileExt = path.extname(filename).toLowerCase();
    const validExtensions = ['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.aac', '.aiff', '.wma'];
    const isAudioType = fileType.startsWith('audio/') || validExtensions.includes(fileExt);

    if (!isAudioType && !validExtensions.includes(fileExt)) {
      return NextResponse.json({ 
        error: 'Formato de archivo no compatible. Selecciona un archivo de audio (MP3, WAV, FLAC, M4A u OGG).' 
      }, { status: 400 });
    }

    const taskId = uuidv4();
    const parsedName = path.parse(filename).name;
    const baseName = (parsedName.replace(/[\\/:*?"<>|]/g, '_').trim()) || 'audio';
    
    // Si se especifica motor local o no hay token de Replicate, usamos local
    const hasCloudToken = !!token && token.trim().length > 5;
    const useCloud = preferredEngine === 'local' ? false : hasCloudToken;

    if (useCloud) {
      // PROCESAMIENTO EN LA NUBE (Zero-Disk en Vercel)
      let audioInputUrl: string | undefined;
      let replicateFileId: string | undefined;

      if (driveFileId) {
        // CASO A: Archivo transferido vía puente seguro Google Drive
        try {
          const drive = getDriveService();
          const fileStream = await drive.files.get({
            fileId: driveFileId,
            alt: 'media',
            supportsAllDrives: true
          }, { responseType: 'stream' });

          const chunks: Buffer[] = [];
          for await (const chunk of (fileStream.data as any)) {
            chunks.push(Buffer.from(chunk));
          }
          const audioBuffer = Buffer.concat(chunks);

          // ¡BORRADO INMEDIATO DE GOOGLE DRIVE! Garantiza 0 bytes de espacio ocupado
          drive.files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(err => {
            console.error('[Stems] Error eliminando archivo temporal de Drive:', err);
          });

          // Subir buffer en RAM directamente a Replicate /v1/files (SIN tocar disco de Vercel)
          const repFormData = new FormData();
          repFormData.append('content', new Blob([audioBuffer], { type: fileType }), `${baseName}${fileExt || '.mp3'}`);

          const uploadRes = await fetch('https://api.replicate.com/v1/files', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token!.trim()}` },
            body: repFormData
          });

          if (!uploadRes.ok) {
            const uploadErr = await uploadRes.json().catch(() => ({}));
            throw new Error(uploadErr.detail || uploadErr.error || 'Error al transferir audio a Replicate GPU');
          }

          const fileData = await uploadRes.json();
          audioInputUrl = fileData.urls?.get;
          replicateFileId = fileData.id;

        } catch (bridgeErr: any) {
          console.error('[Stems] Error en puente zero-disk Drive -> Replicate:', bridgeErr);
          // Si falló, intentar borrar de Drive por seguridad
          if (driveFileId) {
            getDriveService().files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(() => {});
          }
          return NextResponse.json({ 
            error: bridgeErr.message || 'Error al preparar audio para procesamiento en la nube',
            code: 'BRIDGE_ERROR'
          }, { status: 500 });
        }

      } else if (file) {
        // CASO B: Archivo pequeño (< 4MB) enviado directamente en el cuerpo
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Subir a Replicate /v1/files en RAM
        try {
          const repFormData = new FormData();
          repFormData.append('content', new Blob([buffer], { type: file.type || 'audio/mpeg' }), file.name);

          const uploadRes = await fetch('https://api.replicate.com/v1/files', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token!.trim()}` },
            body: repFormData
          });

          if (uploadRes.ok) {
            const fileData = await uploadRes.json();
            audioInputUrl = fileData.urls?.get;
            replicateFileId = fileData.id;
          } else {
            // Fallback a data URI para archivos pequeños
            const base64Data = buffer.toString('base64');
            const mimeType = file.type || 'audio/mpeg';
            audioInputUrl = `data:${mimeType};base64,${base64Data}`;
          }
        } catch {
          const base64Data = buffer.toString('base64');
          const mimeType = file.type || 'audio/mpeg';
          audioInputUrl = `data:${mimeType};base64,${base64Data}`;
        }
      }

      if (!audioInputUrl) {
        return NextResponse.json({ error: 'No se pudo preparar el audio para la IA' }, { status: 500 });
      }

      // Iniciar predicción en Replicate (GPU)
      const createRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token!.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953',
          input: {
            audio: audioInputUrl,
            model_name: 'htdemucs'
          }
        })
      });

      if (!createRes.ok) {
        const errorData = await createRes.json().catch(() => ({}));
        const status = createRes.status;

        // Limpiar archivo en Replicate si fue creado
        if (replicateFileId) {
          fetch(`https://api.replicate.com/v1/files/${replicateFileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token!.trim()}` }
          }).catch(() => {});
        }

        // Si estamos en entorno local, comprobar si hay Python para fallback
        const isVercel = Boolean(process.env.VERCEL);
        let hasLocalDemucs = false;
        if (!isVercel && file) {
          try {
            const { execSync } = require('child_process');
            execSync('python -c "import demucs"', { stdio: 'ignore', timeout: 3000 });
            hasLocalDemucs = true;
          } catch {
            hasLocalDemucs = false;
          }
        }

        if (hasLocalDemucs && file) {
          console.log('[Stems] Replicate error, automatically falling back to Local Demucs...');
          stemsTasks.set(taskId, {
            id: taskId,
            filename,
            status: 'processing',
            progress: 5,
            engine: 'local'
          });

          cleanupOldLocalStems().catch(console.error);

          const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
          if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
          }

          const safeExt = fileExt || '.wav';
          const inputPath = path.join(tempDir, `${taskId}_input${safeExt}`);
          const bytes = await file.arrayBuffer();
          await writeFile(inputPath, Buffer.from(bytes));
          const outDir = path.join(tempDir, `Stems_${taskId}`);

          processDemucsLocal(taskId, inputPath, outDir, baseName).catch(console.error);

          return NextResponse.json({ 
            success: true, 
            taskId, 
            engine: 'local',
            fallback: true,
            message: 'Procesando localmente con Demucs (Gratis e Ilimitado).'
          });
        }
        
        if (status === 402 || (errorData.detail && errorData.detail.toLowerCase().includes('insufficient credit'))) {
          return NextResponse.json({ 
            error: 'Tu cuenta de Replicate no tiene créditos suficientes para procesar en GPU. Puedes usar Demucs en tu PC (Gratis) o recargar saldo en Replicate.',
            code: 'INSUFFICIENT_CREDIT',
            canFallbackLocal: false
          }, { status: 402 });
        }

        if (status === 429 || (errorData.detail && errorData.detail.toLowerCase().includes('throttled'))) {
          return NextResponse.json({ 
            error: 'Límite de velocidad de Replicate alcanzado. Espera unos segundos o añade un método de pago en Replicate.com para aumentar tu límite.',
            code: 'RATE_LIMITED',
            canFallbackLocal: false
          }, { status: 429 });
        }

        if (status === 401) {
          return NextResponse.json({ 
            error: 'Token de Replicate inválido o expirado. Por favor configúralo de nuevo.',
            code: 'INVALID_TOKEN',
            canFallbackLocal: false
          }, { status: 401 });
        }

        return NextResponse.json({ 
          error: errorData.detail || errorData.error || 'Error al iniciar la separación en Replicate AI',
          canFallbackLocal: false
        }, { status: status || 500 });
      }

      const prediction = await createRes.json();
      const predictionId = prediction.id;

      stemsTasks.set(taskId, {
        id: taskId,
        predictionId,
        filename,
        status: 'processing',
        progress: 10,
        engine: 'cloud'
      });

      // Polling en background (y limpieza del archivo temporal en Replicate al terminar)
      processCloudReplicate(taskId, predictionId, token!.trim(), replicateFileId).catch(console.error);

      return NextResponse.json({ 
        success: true, 
        taskId, 
        predictionId, 
        engine: 'cloud' 
      });

    } else {
      // PROCESAMIENTO LOCAL EN PC (Gratis)
      if (!file) {
        return NextResponse.json({ error: 'Se requiere el archivo de audio para procesamiento local' }, { status: 400 });
      }

      // Limpieza preventiva de tareas antiguas para no saturar el disco del usuario
      cleanupOldLocalStems().catch(console.error);

      stemsTasks.set(taskId, {
        id: taskId,
        filename,
        status: 'pending',
        progress: 0,
        engine: 'local'
      });

      const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const safeExt = path.extname(filename) || '.wav';
      const inputPath = path.join(tempDir, `${taskId}_input${safeExt}`);
      const bytes = await file.arrayBuffer();
      await writeFile(inputPath, Buffer.from(bytes));
      const outDir = path.join(tempDir, `Stems_${taskId}`);

      processDemucsLocal(taskId, inputPath, outDir, baseName).catch(console.error);

      return NextResponse.json({ 
        success: true, 
        taskId, 
        engine: 'local' 
      });
    }

  } catch (e: any) {
    console.error('[Stems Process] Fatal error:', e);
    return NextResponse.json({ error: e.message || 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * Limpieza automática de carpetas temporales locales de más de 30 minutos
 * Garantiza que el disco del ordenador nunca se llene con stems antiguos.
 */
async function cleanupOldLocalStems() {
  try {
    const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
    if (!existsSync(tempDir)) return;
    const items = await fs.promises.readdir(tempDir, { withFileTypes: true });
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutos

    for (const item of items) {
      const itemPath = path.join(tempDir, item.name);
      const stat = await fs.promises.stat(itemPath).catch(() => null);
      if (stat && (now - stat.mtimeMs > maxAge)) {
        if (item.isDirectory()) {
          await fs.promises.rm(itemPath, { recursive: true, force: true }).catch(() => {});
        } else {
          await fs.promises.unlink(itemPath).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[Stems] Cleanup error:', e);
  }
}

async function processCloudReplicate(taskId: string, predictionId: string, token: string, replicateFileId?: string) {
  const task = stemsTasks.get(taskId);
  if (!task) return;

  try {
    let isFinished = false;
    let pollCount = 0;

    while (!isFinished) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      pollCount++;

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!pollRes.ok) {
        throw new Error('Error al consultar el estado de la tarea en la nube');
      }

      const pollData = await pollRes.json();

      if (pollData.status === 'processing' || pollData.status === 'starting') {
        task.progress = Math.min(15 + pollCount * 8, 92);
        broadcastStems(taskId, { type: 'update', task });
      } else if (pollData.status === 'succeeded') {
        isFinished = true;
        task.status = 'completed';
        task.progress = 100;

        const output = pollData.output || {};
        task.stems = {
          vocals: output.vocals || output['vocals.wav'] || output['vocals.mp3'],
          drums: output.drums || output['drums.wav'] || output['drums.mp3'],
          bass: output.bass || output['bass.wav'] || output['bass.mp3'],
          other: output.other || output['other.wav'] || output['other.mp3']
        };

        broadcastStems(taskId, { type: 'update', task });

        // Limpiar archivo temporal en Replicate tras el éxito
        if (replicateFileId) {
          fetch(`https://api.replicate.com/v1/files/${replicateFileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {});
        }

      } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
        isFinished = true;
        if (replicateFileId) {
          fetch(`https://api.replicate.com/v1/files/${replicateFileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => {});
        }
        throw new Error(pollData.error || 'La separación en la nube fue cancelada o falló');
      }
    }

  } catch (err: any) {
    console.error('Cloud Demucs Error:', err);
    task.status = 'error';
    task.error = err.message || 'Error durante la separación en la nube';
    broadcastStems(taskId, { type: 'update', task });
  }
}

async function processDemucsLocal(taskId: string, inputPath: string, outDir: string, baseName: string) {
  const task = stemsTasks.get(taskId);
  if (!task) return;

  task.status = 'processing';
  broadcastStems(taskId, { type: 'update', task });

  try {
    const args = ['-m', 'demucs.separate', '-n', 'htdemucs', inputPath, '-o', outDir];
    const demucsProc = spawn('python', args);

    let stderrLog = '';

    demucsProc.stdout.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress > task.progress) {
          task.progress = progress;
          broadcastStems(taskId, { type: 'update', task });
        }
      }
    });

    demucsProc.stderr.on('data', (data) => {
      const output = data.toString();
      stderrLog += output;
      const match = output.match(/(\d+)%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress > task.progress) {
          task.progress = progress;
          broadcastStems(taskId, { type: 'update', task });
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      demucsProc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.error('Demucs Error Log:', stderrLog);
          const lines = stderrLog.split('\n').filter(l => l.trim().length > 0);
          const errorExtract = lines.length > 0 ? lines[lines.length - 1] : `exited with code ${code}`;
          reject(new Error(`Demucs process failed: ${errorExtract}`));
        }
      });
      demucsProc.on('error', reject);
    });

    // Clean input temp file immediately
    await unlink(inputPath).catch(() => {});

    task.status = 'completed';
    task.progress = 100;
    const inputBasename = path.parse(inputPath).name;
    const finalDir = path.join(outDir, 'htdemucs', inputBasename);
    task.outputDir = finalDir; 

    broadcastStems(taskId, { type: 'update', task });

  } catch (err: any) {
    console.error('Demucs Error:', err);
    await unlink(inputPath).catch(() => {});
    task.status = 'error';
    task.error = err.message;
    broadcastStems(taskId, { type: 'update', task });
  }
}
