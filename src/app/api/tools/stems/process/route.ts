import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { stemsTasks, broadcastStems } from '../state';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientToken = req.headers.get('x-replicate-token') || (formData.get('replicateToken') as string | null);
    const token = clientToken || process.env.REPLICATE_API_TOKEN;
    const preferredEngine = formData.get('engine') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo de audio' }, { status: 400 });
    }

    const taskId = uuidv4();
    const parsedName = path.parse(file.name).name;
    const baseName = (parsedName.replace(/[\\/:*?"<>|]/g, ' ').trim()) || 'audio';
    
    // Si se especifica motor local o no hay token de Replicate, usamos local
    const hasCloudToken = !!token && token.trim().length > 5;
    const useCloud = preferredEngine === 'local' ? false : hasCloudToken;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (useCloud) {
      // Iniciar predicción en Replicate (GPU)
      const base64Data = buffer.toString('base64');
      const mimeType = file.type || 'audio/mpeg';
      const audioDataUri = `data:${mimeType};base64,${base64Data}`;

      const createRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token!.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // cjwbw/demucs official active version
          version: '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953',
          input: {
            audio: audioDataUri,
            model_name: 'htdemucs'
          }
        })
      });

      if (!createRes.ok) {
        const errorData = await createRes.json().catch(() => ({}));
        const status = createRes.status;
        
        if (status === 402 || (errorData.detail && errorData.detail.toLowerCase().includes('insufficient credit'))) {
          return NextResponse.json({ 
            error: 'Tu cuenta de Replicate no tiene créditos suficientes para procesar en GPU. Puedes usar Demucs en tu PC o añadir créditos en Replicate.com.',
            code: 'INSUFFICIENT_CREDIT'
          }, { status: 402 });
        }

        if (status === 401) {
          return NextResponse.json({ 
            error: 'Token de Replicate inválido o sin permisos.',
            code: 'INVALID_TOKEN'
          }, { status: 401 });
        }

        return NextResponse.json({ 
          error: errorData.detail || errorData.error || 'Error al iniciar la separación en Replicate AI' 
        }, { status: 500 });
      }

      const prediction = await createRes.json();
      const predictionId = prediction.id;

      stemsTasks.set(taskId, {
        id: taskId,
        predictionId,
        filename: file.name,
        status: 'processing',
        progress: 10,
        engine: 'cloud'
      });

      // Polling en background (para entornos con soporte de fondo)
      processCloudReplicate(taskId, predictionId, token!.trim()).catch(console.error);

      return NextResponse.json({ 
        success: true, 
        taskId, 
        predictionId, 
        engine: 'cloud' 
      });

    } else {
      // Iniciar procesamiento local en PC
      stemsTasks.set(taskId, {
        id: taskId,
        filename: file.name,
        status: 'pending',
        progress: 0,
        engine: 'local'
      });

      const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const safeExt = path.extname(file.name) || '.wav';
      const inputPath = path.join(tempDir, `${taskId}_input${safeExt}`);
      await writeFile(inputPath, buffer);
      const outDir = path.join(tempDir, `Stems_${taskId}`);

      processDemucsLocal(taskId, inputPath, outDir, baseName).catch(console.error);

      return NextResponse.json({ 
        success: true, 
        taskId, 
        engine: 'local' 
      });
    }

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno del servidor' }, { status: 500 });
  }
}

async function processCloudReplicate(taskId: string, predictionId: string, token: string) {
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
      } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
        isFinished = true;
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
    // python -m demucs.separate -n htdemucs "inputPath" -o "outDir"
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

    // Clean temp
    await unlink(inputPath).catch(() => {});

    task.status = 'completed';
    task.progress = 100;
    // Demucs output structure: outDir / htdemucs / filename_without_ext / vocals.wav
    const finalDir = path.join(outDir, 'htdemucs', `${taskId}_${baseName}`);
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
