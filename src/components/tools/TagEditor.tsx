'use client';

import { useState, useRef } from 'react';
import { UploadCloud, Tags, Image as ImageIcon, Save, CheckCircle2, Loader2, Music } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function TagEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [tags, setTags] = useState({ title: '', artist: '', album: '', year: '', genre: '' });
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  
  const [status, setStatus] = useState<'idle' | 'reading' | 'saving' | 'completed'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setStatus('reading');
    setErrorMsg('');
    setCoverFile(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('action', 'read');

      const res = await fetch('/api/tools/tags', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Error al leer etiquetas');
      const data = await res.json();

      setTags({
        title: data.title || '',
        artist: data.artist || '',
        album: data.album || '',
        year: data.year || '',
        genre: data.genre || ''
      });
      setCoverUrl(data.cover || null);
      setStatus('idle');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('idle');
    }
  };

  const handleCoverSelect = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const selected = files[0];
    setCoverFile(selected);
    setCoverUrl(URL.createObjectURL(selected));
  };

  const handleSave = async () => {
    if (!file) return;
    setStatus('saving');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'write');
      formData.append('title', tags.title);
      formData.append('artist', tags.artist);
      formData.append('album', tags.album);
      formData.append('year', tags.year);
      formData.append('genre', tags.genre);
      
      if (coverFile) {
        formData.append('coverFile', coverFile);
      }

      const res = await fetch('/api/tools/tags', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Error al guardar etiquetas');
      
      setStatus('completed');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/50">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center justify-center gap-2">
            <Tags className="w-6 h-6 text-amber-500" /> Editor de Metadatos
          </h2>
          <p className="text-sm sm:text-base text-text-secondary">Edita la información y añade carátulas a tus archivos MP3.</p>
        </div>

        {!file ? (
          <div 
            className="border-2 border-dashed border-border/60 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4 text-center"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept=".mp3" onChange={e => handleFileSelect(e.target.files)} />
            <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner">
              <UploadCloud className="w-8 h-8 text-text-secondary" />
            </div>
            <div>
              <p className="text-text-primary font-medium">Selecciona un archivo MP3</p>
            </div>
          </div>
        ) : status === 'reading' ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-text-secondary font-medium">Leyendo metadatos...</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8">
            {/* Cover Column */}
            <div className="flex flex-col items-center gap-4 w-full md:w-64 shrink-0">
              <div 
                className="w-full aspect-square rounded-2xl border border-border/50 bg-surface-elevated overflow-hidden relative group cursor-pointer"
                onClick={() => coverInputRef.current?.click()}
              >
                <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={e => handleCoverSelect(e.target.files)} />
                
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary/50">
                    <Music className="w-16 h-16 mb-2 opacity-20" />
                    <p className="text-xs font-medium">Sin Carátula</p>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ImageIcon className="w-8 h-8 text-white mb-2" />
                  <span className="text-white text-sm font-medium">Cambiar Imagen</span>
                </div>
              </div>
              <p className="text-xs text-text-secondary text-center">Haz clic en la imagen para cambiar la carátula</p>
            </div>

            {/* Form Column */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-text-primary text-sm truncate bg-surface-elevated px-3 py-1.5 rounded-lg border border-border/50">
                  {file.name}
                </p>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Cambiar archivo</Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Título</label>
                  <input 
                    type="text" 
                    value={tags.title} 
                    onChange={e => setTags({...tags, title: e.target.value})}
                    className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Artista</label>
                  <input 
                    type="text" 
                    value={tags.artist} 
                    onChange={e => setTags({...tags, artist: e.target.value})}
                    className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Álbum</label>
                  <input 
                    type="text" 
                    value={tags.album} 
                    onChange={e => setTags({...tags, album: e.target.value})}
                    className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Año</label>
                    <input 
                      type="text" 
                      value={tags.year} 
                      onChange={e => setTags({...tags, year: e.target.value})}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">Género</label>
                    <input 
                      type="text" 
                      value={tags.genre} 
                      onChange={e => setTags({...tags, genre: e.target.value})}
                      className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <div>
                  {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
                  {status === 'completed' && (
                    <div className="flex items-center gap-2 text-emerald-500 font-medium text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Guardado en Descargas
                    </div>
                  )}
                </div>
                
                <Button 
                  onClick={handleSave} 
                  disabled={status === 'saving'}
                  className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl min-w-[140px]"
                >
                  {status === 'saving' ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Guardar Tags</>}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
