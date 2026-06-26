'use client';

import { useState, useMemo } from 'react';
import { X, Search, Music, Check } from 'lucide-react';

interface PortalTrackPickerModalProps {
  bounces: any[]; // Flat list of bounces provided by the portal API
  selectedFileIds?: string[];
  onClose: () => void;
  onSelect: (fileId: string, fileName: string) => void;
}

export function PortalTrackPickerModal({ bounces, selectedFileIds = [], onClose, onSelect }: PortalTrackPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectingId, setIsSelectingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const handleSelect = async (fileId: string, fileName: string) => {
    setIsSelectingId(fileId);
    try {
      await onSelect(fileId, fileName);
    } finally {
      setIsSelectingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery) return bounces;
    const q = searchQuery.toLowerCase();
    return bounces.filter(item => (item.name || '').toLowerCase().includes(q));
  }, [bounces, searchQuery]);

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
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
      />
      
      <div className="bg-surface border border-border w-full md:w-[600px] h-[85vh] md:h-[600px] rounded-t-2xl md:rounded-2xl shadow-2xl relative flex flex-col animate-slide-up md:animate-scale-in">
        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-surface-elevated rounded-t-2xl">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-text-primary">Seleccionar Canción</h2>
            <p className="text-xs text-text-secondary mt-0.5">Añade pistas desde tus carpetas</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border/50 bg-surface">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(50);
              }}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-elevated border border-border/50 rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2" onScroll={handleScroll}>
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-secondary p-8 text-center opacity-50">
              <Music className="w-12 h-12 mb-4" />
              <p className="text-sm">No se encontraron archivos de audio.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayItems.map(item => {
                const isSelected = selectedFileIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => !isSelected && handleSelect(item.id, item.name)}
                    disabled={isSelected || isSelectingId === item.id}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${
                      isSelected 
                        ? 'opacity-50 cursor-not-allowed bg-surface' 
                        : 'hover:bg-accent/10 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-surface border border-border/50 text-text-secondary' : 'bg-surface-elevated border border-border/50 text-accent shadow-sm'}`}>
                        <Music className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-sm font-semibold text-text-primary truncate max-w-[200px] md:max-w-[300px]">
                          {item.name}
                        </span>
                        {item.parentFolderName && (
                          <span className="text-[10px] text-text-secondary truncate mt-0.5 max-w-[200px] md:max-w-[300px]">
                            {item.parentFolderName}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="shrink-0 ml-4">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-text-secondary text-xs font-bold bg-surface px-2 py-1 rounded border border-border/50">
                          <Check className="w-3.5 h-3.5" /> Añadido
                        </div>
                      ) : isSelectingId === item.id ? (
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      ) : (
                        <div className="text-xs font-bold text-accent bg-accent/10 px-3 py-1.5 rounded-lg opacity-0 md:group-hover:opacity-100 transition-opacity">
                          Seleccionar
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
