'use client';

import { useState, useEffect } from 'react';
import { X, Search, Loader2, Music, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TrackPickerModalProps {
  artistId: string;
  onClose: () => void;
  onSelect: (fileId: string, fileName: string) => void;
}

export function TrackPickerModal({ artistId, onClose, onSelect }: TrackPickerModalProps) {
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectingId, setIsSelectingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAudioFiles();
  }, [artistId]);

  const fetchAudioFiles = async () => {
    setIsLoading(true);
    try {
      // Re-use the projects API but we need to fetch all audio for the artist...
      // Wait, let's call the specific artist Drive API if it exists, or just do a generic search via a new endpoint.
      // For now, we will fetch the artist's root folders and their contents.
      const res = await fetch(`/api/artists/${artistId}/files`);
      if (!res.ok) throw new Error('Failed to load artist drive data');
      const data = await res.json();
      
      setFiles(data.files || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const extractAudioFiles = (items: any[]): any[] => {
    let result: any[] = [];
    for (const item of items) {
      if (item.mimeType?.startsWith('audio/')) {
        result.push(item);
      }
      if (item.files) {
        result = result.concat(extractAudioFiles(item.files));
      }
    }
    return result;
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelect = async (fileId: string, fileName: string) => {
    setIsSelectingId(fileId);
    await onSelect(fileId, fileName);
    // Modal will close externally
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-lg flex items-center gap-2"><Music className="w-5 h-5 text-accent" /> Seleccionar Audio</h3>
          <button onClick={onClose} className="p-1 hover:bg-surface-elevated rounded-md text-text-secondary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-border/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input 
              type="text" 
              placeholder="Buscar por nombre de archivo..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-surface-elevated border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <p>No se encontraron archivos de audio.</p>
            </div>
          ) : (
            filteredFiles.map(file => (
              <div key={file.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-accent/30 bg-surface-elevated/30 hover:bg-surface-elevated/80 transition-colors group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <Music className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
                    {/* Path placeholder if we add full paths later */}
                    <p className="text-[10px] text-text-secondary truncate mt-0.5">{(Number(file.size) / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>
                
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => handleSelect(file.id, file.name)}
                  disabled={isSelectingId === file.id}
                  className="shrink-0"
                >
                  {isSelectingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Añadir'}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
