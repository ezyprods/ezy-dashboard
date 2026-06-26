'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, Music, Check, ChevronRight, Folder, FileAudio, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert } from '@/lib/dialog';

interface TrackPickerModalProps {
  artistId: string; // The root folder ID of the artist
  selectedFileIds?: string[];
  onClose: () => void;
  onSelect: (fileId: string, fileName: string) => void;
}

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export function TrackPickerModal({ artistId, selectedFileIds = [], onClose, onSelect }: TrackPickerModalProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string>(artistId);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: artistId, name: 'Raíz del Artista' }]);
  
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectingId, setIsSelectingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    fetchFolderItems(currentFolderId);
  }, [currentFolderId]);

  const fetchFolderItems = async (folderId: string) => {
    setIsLoading(true);
    setSearchQuery('');
    try {
      const res = await fetch(`/api/files?folderId=${folderId}`);
      if (!res.ok) throw new Error('Failed to load folder data');
      const data = await res.json();
      
      // Filter out only folders and audio files to keep the UI clean
      const filtered = (data.items || []).filter((item: DriveItem) => 
        item.mimeType === 'application/vnd.google-apps.folder' || 
        item.mimeType?.startsWith('audio/') || 
        /\.(wav|mp3|m4a|flac|aiff|aif|ogg)$/i.test(item.name || '')
      );
      
      // Sort folders first, then files
      filtered.sort((a: DriveItem, b: DriveItem) => {
        const isAFolder = a.mimeType === 'application/vnd.google-apps.folder';
        const isBFolder = b.mimeType === 'application/vnd.google-apps.folder';
        if (isAFolder && !isBFolder) return -1;
        if (!isAFolder && isBFolder) return 1;
        return a.name.localeCompare(b.name);
      });

      setItems(filtered);
    } catch (err) {
      console.error(err);
      customAlert('Error al cargar los archivos');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const navigateUpTo = (index: number) => {
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
  };

  const handleSelect = async (fileId: string, fileName: string) => {
    setIsSelectingId(fileId);
    try {
      await onSelect(fileId, fileName);
    } finally {
      setIsSelectingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const displayItems = filteredItems.slice(0, visibleCount);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 150) {
      if (visibleCount < filteredItems.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" 
        style={{ willChange: 'opacity' }}
        onClick={onClose} 
      />
      
      <div 
        className="relative w-full h-[90vh] md:h-auto max-w-2xl bg-[#181818] text-white md:border border-[#282828] rounded-t-xl md:rounded-xl shadow-2xl flex flex-col md:max-h-[85vh] animate-slide-in overflow-hidden"
        style={{ willChange: 'transform, opacity' }}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#282828] bg-[#121212]">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Music className="w-5 h-5 text-[#1db954]" /> 
            Añadir Audio al Lanzamiento
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-md text-[#b3b3b3] hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Navigation & Search */}
        <div className="p-4 border-b border-[#282828] bg-[#181818] space-y-3">
          
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar text-sm text-[#b3b3b3]">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center shrink-0">
                <button
                  onClick={() => navigateUpTo(index)}
                  className={`hover:text-white hover:underline transition-colors ${
                    index === breadcrumbs.length - 1 ? 'font-bold text-white' : ''
                  }`}
                >
                  {crumb.name}
                </button>
                {index < breadcrumbs.length - 1 && (
                  <ChevronRight className="w-4 h-4 mx-1 opacity-50" />
                )}
              </div>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#b3b3b3]" />
            <input 
              type="text" 
              placeholder="Buscar en esta carpeta..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(50);
              }}
              className="w-full bg-[#282828] border-none rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1db954] text-white placeholder:text-[#b3b3b3]"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-2" onScroll={handleScroll}>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#1db954]" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 text-[#b3b3b3] flex flex-col items-center">
              <Folder className="w-12 h-12 mb-3 opacity-20" />
              <p>Carpeta vacía o sin coincidencias.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayItems.map(item => {
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                const isAlreadySelected = selectedFileIds.includes(item.id);

                return (
                  <div 
                    key={item.id} 
                    className={`flex items-center justify-between p-2 rounded-lg hover:bg-white/10 transition-colors group ${
                      isFolder || !isAlreadySelected ? 'cursor-pointer' : 'opacity-60 pointer-events-none'
                    } ${isSelectingId === item.id ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => {
                    if (isFolder) navigateToFolder(item.id, item.name);
                    else if (!isAlreadySelected) handleSelect(item.id, item.name);
                  }}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                      isFolder ? 'bg-white/5 text-white' : 'bg-[#1db954]/10 text-[#1db954]'
                    }`}>
                      {isFolder ? <Folder className="w-5 h-5 fill-current opacity-80" /> : <FileAudio className="w-5 h-5" />}
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-medium text-white truncate group-hover:text-[#1db954] transition-colors">{item.name}</p>
                      {!isFolder && item.size && (
                        <p className="text-[11px] text-[#b3b3b3] truncate mt-0.5">
                          {(Number(item.size) / 1024 / 1024).toFixed(1)} MB
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {!isFolder && (
                    <Button 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAlreadySelected) handleSelect(item.id, item.name);
                      }}
                      disabled={isSelectingId === item.id || isAlreadySelected}
                      className={`shrink-0 bg-transparent border hover:scale-105 transition-all ml-4 ${
                        isAlreadySelected ? 'border-[#1db954] text-[#1db954] opacity-100 hover:scale-100' : 'border-[#b3b3b3] text-white hover:border-white'
                      }`}
                    >
                      {isSelectingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isAlreadySelected ? <><Check className="w-4 h-4 mr-1" /> Añadido</> : 'Seleccionar'}
                    </Button>
                  )}
                  {isFolder && (
                    <ChevronRight className="w-5 h-5 text-[#b3b3b3] opacity-0 group-hover:opacity-100 transition-opacity mr-2" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
