'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Link2, Trash2, Video, Music, Disc } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ReferenceTrack } from '@/types';

export function ReferenceTracksTab({ projectId }: { projectId: string }) {
  const [references, setReferences] = useState<ReferenceTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => { fetchReferences(); }, [projectId]);

  const fetchReferences = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      setReferences(data.referenceTracks || []);
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const saveReferences = useCallback(async (newRefs: ReferenceTrack[]) => {
    setReferences(newRefs);
    setIsSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceTracks: newRefs }),
      });
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  }, [projectId]);

  const getPlatformType = (url: string): 'spotify' | 'youtube' | 'drive' => {
    if (url.includes('spotify.com')) return 'spotify';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'drive';
  };

  const addReference = () => {
    if (!newUrl.trim() || !newTitle.trim()) return;
    
    const newRef: ReferenceTrack = {
      id: Math.random().toString(36).slice(2),
      title: newTitle.trim(),
      url: newUrl.trim(),
      type: getPlatformType(newUrl.trim())
    };
    
    saveReferences([newRef, ...references]);
    setNewTitle('');
    setNewUrl('');
  };

  const deleteReference = (id: string) => {
    saveReferences(references.filter(r => r.id !== id));
  };

  // Helper to extract Spotify Track ID
  const getSpotifyEmbedUrl = (url: string) => {
    const trackIdMatch = url.match(/track\/([a-zA-Z0-9]+)/);
    if (trackIdMatch) {
      return `https://open.spotify.com/embed/track/${trackIdMatch[1]}?utm_source=generator&theme=0`;
    }
    return null;
  };

  // Helper to extract Youtube Embed URL
  const getYoutubeEmbedUrl = (url: string) => {
    let videoId = '';
    const vMatch = url.match(/[?&]v=([^&]+)/);
    if (vMatch) videoId = vMatch[1];
    else {
      const shortMatch = url.match(/youtu\.be\/([^?]+)/);
      if (shortMatch) videoId = shortMatch[1];
    }
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    return null;
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">Tracks de Referencia</h3>
          <p className="text-sm text-text-secondary">Guarda enlaces de Spotify o Youtube para usarlos de referencia de mezcla/producción.</p>
        </div>
      </div>

      <div className="glass p-4 rounded-xl border border-border flex gap-4 items-center">
        <Input 
          placeholder="Nombre o descripción (ej. Referencia Bombos)" 
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          className="flex-1"
        />
        <Input 
          placeholder="URL de Spotify o YouTube..." 
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          className="flex-1"
          onKeyDown={e => e.key === 'Enter' && addReference()}
        />
        <Button onClick={addReference} disabled={!newTitle.trim() || !newUrl.trim()}>Añadir Link</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {references.map(ref => (
          <div key={ref.id} className="bg-surface-elevated border border-border rounded-xl overflow-hidden group">
            <div className="p-3 border-b border-border/50 flex justify-between items-center bg-surface/50">
              <div className="flex items-center gap-2 font-medium truncate">
                {ref.type === 'spotify' ? <Music className="w-4 h-4 text-[#1DB954]" /> : 
                 ref.type === 'youtube' ? <Video className="w-4 h-4 text-[#FF0000]" /> : 
                 <Disc className="w-4 h-4 text-accent" />}
                <span className="truncate">{ref.title}</span>
              </div>
              <button onClick={() => deleteReference(ref.id)} className="text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 bg-black/20 flex flex-col items-center justify-center min-h-[150px]">
              {ref.type === 'spotify' && getSpotifyEmbedUrl(ref.url) ? (
                <iframe style={{borderRadius: '12px'}} src={getSpotifyEmbedUrl(ref.url)!} width="100%" height="152" frameBorder="0" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
              ) : ref.type === 'youtube' && getYoutubeEmbedUrl(ref.url) ? (
                <iframe width="100%" height="150" src={getYoutubeEmbedUrl(ref.url)!} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
              ) : (
                <a href={ref.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-text-secondary hover:text-accent transition-colors">
                  <Link2 className="w-8 h-8" />
                  <span className="text-sm underline">Abrir enlace externo</span>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {references.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <Link2 className="w-8 h-8 text-text-secondary opacity-50 mx-auto mb-3" />
          <p className="text-text-secondary">No hay referencias guardadas en este proyecto.</p>
        </div>
      )}
    </div>
  );
}
