'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Music, Play, Pause, Loader2, HardDrive, Upload, Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { formatSeconds } from '@/lib/instagram/limits';
import {
  Cancelled,
  baseName,
  decodeAudio,
  drawMusicFrame,
  loadBitmap,
  makeMusicReel,
  previewLevels,
  type FitMode,
  type MusicReelStyle,
} from '@/lib/instagram/prepareMedia';
import { DrivePicker } from './DrivePicker';
import { downloadDriveBlob } from './igClient';

export interface MusicReelResult {
  file: File;
  thumb: Blob;
  width: number;
  height: number;
  duration: number;
  audioName: string;
  sourceFileId?: string;
}

const DURATIONS = [15, 30, 45, 60, 90];
const STYLES: { id: MusicReelStyle; label: string }[] = [
  { id: 'wave', label: 'Onda' },
  { id: 'bars', label: 'Barras' },
  { id: 'minimal', label: 'Solo imagen' },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('h-8 px-3 rounded-lg text-xs font-medium border transition-colors', active ? 'bg-accent/15 border-accent text-accent-light' : 'border-border text-text-secondary hover:text-text-primary')}>
      {children}
    </button>
  );
}

export function MusicReelBuilder({ onClose, onDone, defaultSubtitle }: { onClose: () => void; onDone: (r: MusicReelResult) => void; defaultSubtitle?: string }) {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [audio, setAudio] = useState<AudioBuffer | null>(null);
  const [audioName, setAudioName] = useState('');
  const [audioSourceId, setAudioSourceId] = useState<string | undefined>();
  const [rawStart, setStart] = useState(0);
  const [duration, setDuration] = useState(30);
  const [style, setStyle] = useState<MusicReelStyle>('wave');
  const [fit, setFit] = useState<FitMode>('cover');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState(defaultSubtitle || '');
  const [loading, setLoading] = useState<'' | 'image' | 'audio'>('');
  const [picker, setPicker] = useState<'' | 'image' | 'audio'>('');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const previewRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const playRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; t0: number; raf: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const audInput = useRef<HTMLInputElement>(null);

  const maxStart = audio ? Math.max(0, audio.duration - duration) : 0;
  const realDuration = audio ? Math.min(duration, audio.duration) : duration;
  // El tramo nunca se sale de la pista (al cambiar la duración o al cargar una pista corta)
  const start = Math.min(rawStart, maxStart);

  // Forma de onda completa para elegir el tramo
  const overview = useMemo(() => {
    if (!audio) return null;
    const ch = audio.getChannelData(0);
    const n = 300;
    const step = Math.floor(ch.length / n);
    const out = new Float32Array(n);
    let peak = 0.0001;
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = 0; j < step; j += 32) m = Math.max(m, Math.abs(ch[i * step + j] || 0));
      out[i] = m;
      peak = Math.max(peak, m);
    }
    return out.map(v => v / peak);
  }, [audio]);

  useEffect(() => {
    const c = waveRef.current;
    if (!c || !overview || !audio) return;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    const a = start / audio.duration;
    const b = (start + realDuration) / audio.duration;
    const bw = W / overview.length;
    overview.forEach((v, i) => {
      const x = i * bw;
      const inside = i / overview.length >= a && i / overview.length <= b;
      ctx.fillStyle = inside ? '#a29bfe' : 'rgba(136,136,160,0.45)';
      const h = Math.max(2, v * H * 0.9);
      ctx.fillRect(x, (H - h) / 2, Math.max(1, bw - 1), h);
    });
    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 2;
    ctx.strokeRect(a * W, 1, (b - a) * W, H - 2);
  }, [overview, audio, start, realDuration]);

  const drawPreview = useCallback((t: number) => {
    const c = previewRef.current;
    if (!c || !image) return;
    const ctx = c.getContext('2d')!;
    const levels = audio && style !== 'minimal' ? previewLevels(audio, start, t) : null;
    drawMusicFrame(ctx, c.width, c.height, { image, title, subtitle, style, fit }, levels, t, realDuration);
  }, [image, audio, start, style, title, subtitle, fit, realDuration]);

  useEffect(() => { if (!playing) drawPreview(realDuration * 0.3); }, [drawPreview, playing, realDuration]);

  const stop = useCallback(() => {
    const p = playRef.current;
    if (p) {
      cancelAnimationFrame(p.raf);
      try { p.src.stop(); } catch { /* ya parado */ }
      p.ctx.close().catch(() => {});
    }
    playRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => { stop(); abortRef.current?.abort(); }, [stop]);

  const play = () => {
    if (!audio) return;
    if (playing) return stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(ctx.destination);
    src.start(0, start, realDuration);
    const t0 = ctx.currentTime;
    const tick = () => {
      const t = ctx.currentTime - t0;
      if (t >= realDuration) return stop();
      drawPreview(t);
      if (playRef.current) playRef.current.raf = requestAnimationFrame(tick);
    };
    playRef.current = { ctx, src, t0, raf: requestAnimationFrame(tick) };
    src.onended = () => stop();
    setPlaying(true);
  };

  const loadImageBlob = async (blob: Blob) => {
    setLoading('image');
    setError('');
    try { setImage(await loadBitmap(blob)); } catch (e) { setError((e as Error).message); } finally { setLoading(''); }
  };

  const loadAudioBlob = async (blob: Blob, name: string, sourceId?: string) => {
    stop();
    setLoading('audio');
    setError('');
    try {
      const buf = await decodeAudio(blob);
      setAudio(buf);
      setAudioName(baseName(name));
      setAudioSourceId(sourceId);
      if (!title) setTitle(baseName(name));
      // Empieza en el tramo con más energía (el estribillo suele estar ahí)
      const ch = buf.getChannelData(0);
      const sec = Math.floor(buf.duration);
      let best = 0;
      let bestE = -1;
      for (let s = 0; s + 15 < sec; s += 2) {
        let e = 0;
        const a = Math.floor(s * buf.sampleRate);
        const b = Math.floor((s + 15) * buf.sampleRate);
        for (let i = a; i < b; i += 400) e += ch[i] * ch[i];
        if (e > bestE) { bestE = e; best = s; }
      }
      setStart(Math.max(0, best - 2));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading('');
    }
  };

  const fromDrive = async (kind: 'image' | 'audio', id: string, name: string) => {
    setPicker('');
    setLoading(kind);
    try {
      const blob = await downloadDriveBlob(id);
      if (kind === 'image') await loadImageBlob(blob);
      else await loadAudioBlob(blob, name, id);
    } catch (e) {
      setError((e as Error).message);
      setLoading('');
    }
  };

  const generate = async () => {
    if (!image || !audio) return;
    stop();
    setError('');
    setProgress(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await makeMusicReel({ image, audio, start, duration: realDuration, title, subtitle, style, fit, onProgress: setProgress, signal: ctrl.signal });
      onDone({ ...r, audioName: title || audioName, sourceFileId: audioSourceId });
    } catch (e) {
      if (!(e instanceof Cancelled)) setError((e as Error).message || 'No se pudo crear el vídeo.');
      setProgress(null);
    }
  };

  const seekFromWave = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audio) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * audio.duration - realDuration / 2;
    setStart(Math.max(0, Math.min(maxStart, t)));
  };

  return (
    <Modal isOpen onClose={() => { abortRef.current?.abort(); onClose(); }} title="Reel con tu música" description="Una imagen y un tramo de tu pista, convertidos en vídeo vertical." className="md:max-w-3xl!">
      <div className="grid md:grid-cols-[1fr_220px] gap-5">
        <div className="space-y-4 min-w-0">
          <input ref={imgInput} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadImageBlob(f); e.target.value = ''; }} />
          <input ref={audInput} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadAudioBlob(f, f.name); e.target.value = ''; }} />

          <div className="grid grid-cols-2 gap-2">
            {(['image', 'audio'] as const).map(k => {
              const ready = k === 'image' ? !!image : !!audio;
              const Icon = k === 'image' ? ImageIcon : Music;
              return (
                <div key={k} className={cn('rounded-xl border p-3 space-y-2', ready ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface')}>
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    {loading === k ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Icon className="w-4 h-4 text-accent" />}
                    <span className="truncate">{k === 'image' ? (image ? 'Imagen lista' : 'Imagen o portada') : (audio ? audioName : 'Tu pista')}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => (k === 'image' ? imgInput : audInput).current?.click()} className="flex-1 h-8 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary flex items-center justify-center gap-1"><Upload className="w-3.5 h-3.5" />Subir</button>
                    <button type="button" onClick={() => setPicker(k)} className="flex-1 h-8 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary flex items-center justify-center gap-1"><HardDrive className="w-3.5 h-3.5" />Drive</button>
                  </div>
                </div>
              );
            })}
          </div>

          {audio && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span>Tramo: <b className="text-text-primary font-mono">{formatSeconds(start)} – {formatSeconds(start + realDuration)}</b></span>
                <span>Toca la onda para moverlo</span>
              </div>
              <canvas ref={waveRef} width={600} height={64} onClick={seekFromWave} className="w-full h-16 rounded-lg bg-surface border border-border cursor-pointer" />
              <input type="range" min={0} max={Math.max(0.1, maxStart)} step={0.1} value={start} onChange={e => setStart(Number(e.target.value))} className="w-full accent-[var(--accent)]" aria-label="Inicio del tramo" />
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-text-secondary mr-1">Duración</span>
                {DURATIONS.filter(d => d <= Math.ceil(audio.duration)).map(d => <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>{d} s</Chip>)}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-text-secondary mr-1">Estilo</span>
            {STYLES.map(s => <Chip key={s.id} active={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</Chip>)}
            <span className="text-xs text-text-secondary ml-3 mr-1">Imagen</span>
            <Chip active={fit === 'cover'} onClick={() => setFit('cover')}>Llenar</Chip>
            <Chip active={fit === 'blur'} onClick={() => setFit('blur')}>Entera</Chip>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (nombre de la pista)" className="h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtítulo (opcional)" className="h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
          </div>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-border bg-black aspect-[9/16]">
            {image ? <canvas ref={previewRef} width={270} height={480} className="w-full h-full" /> : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40 p-4 text-center">Elige una imagen para ver cómo queda</div>
            )}
            {progress !== null && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-white">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm font-semibold">{Math.round(progress * 100)}%</span>
                <span className="text-[11px] text-white/60">Creando el vídeo…</span>
              </div>
            )}
          </div>
          <button type="button" onClick={play} disabled={!audio || !image || progress !== null}
            className="w-full h-10 rounded-xl border border-border text-sm font-medium text-text-primary flex items-center justify-center gap-2 disabled:opacity-40">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{playing ? 'Parar' : 'Escuchar'}
          </button>
          <button type="button" onClick={generate} disabled={!audio || !image || progress !== null}
            className="w-full h-11 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            <Wand2 className="w-4 h-4" />Crear vídeo
          </button>
        </div>
      </div>

      {picker && (
        <DrivePicker kinds={[picker]} title={picker === 'image' ? 'Elegir imagen' : 'Elegir pista'} onClose={() => setPicker('')} onPick={([f]) => fromDrive(picker, f.id, f.name)} />
      )}
    </Modal>
  );
}
