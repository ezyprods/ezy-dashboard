'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Table2, Trash2, Calendar, FileText, ChevronRight, User, ArrowLeft, Search, ChevronDown, Check, Pencil, Copy, Link as LinkIcon, CheckCircle2, RotateCcw, BoxSelect } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';

export default function MatricesPage() {
  const router = useRouter();
  const [matrices, setMatrices] = useState<any[]>([]);
  const [completedMatrices, setCompletedMatrices] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMatrix, setActiveMatrix] = useState<{ id: string; name: string; artistId: string; artistName: string } | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMatrixName, setNewMatrixName] = useState('');
  const [selectedArtistId, setSelectedArtistId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsArtistDropdownOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [matricesRes, artistsRes] = await Promise.all([
        fetch('/api/dashboard/matrices'),
        fetch('/api/artists')
      ]);
      
      if (matricesRes.ok && artistsRes.ok) {
        const matricesData = await matricesRes.json();
        const artistsData = await artistsRes.json();

        if (artistsData.needsAuth || matricesData.needsAuth) {
          console.warn('Drive token needs refresh - check .env.local or Vercel env vars');
          return;
        }
        
        setMatrices(matricesData.matrices || []);
        setCompletedMatrices(matricesData.completedMatrices || []);
        setArtists(artistsData.artists || []);
      } else {
        console.error('Error fetching data');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateMatrix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatrixName.trim()) {
      customAlert('Por favor, escribe un nombre para la matriz');
      return;
    }

    let finalArtistId = selectedArtistId;
    let finalArtistName = '';

    if (!finalArtistId) {
      if (searchTerm.trim()) {
        setIsSubmitting(true);
        try {
          const artistRes = await fetch('/api/artists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: searchTerm.trim() })
          });
          if (artistRes.ok) {
            const newArtist = await artistRes.json();
            finalArtistId = newArtist.id;
            finalArtistName = newArtist.name;
          } else {
            const err = await artistRes.json();
            customAlert(`Error al crear nuevo artista: ${err.error}`);
            setIsSubmitting(false);
            return;
          }
        } catch (err: any) {
          customAlert(`Error al crear artista: ${err.message}`);
          setIsSubmitting(false);
          return;
        }
      } else {
        customAlert('Por favor, selecciona o escribe el nombre de un artista');
        return;
      }
    } else {
      finalArtistName = artists.find(a => a.id === finalArtistId)?.name || 'Desconocido';
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/artists/${finalArtistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMatrixName.trim() })
      });
      
      if (res.ok) {
        const result = await res.json();
        setNewMatrixName('');
        setSelectedArtistId('');
        setSearchTerm('');
        setIsModalOpen(false);
        await fetchData();
        customAlert('Matriz creada y asignada con éxito');
        
        if (result.matrix) {
          setActiveMatrix({
            id: result.matrix.id,
            name: result.matrix.name,
            artistId: finalArtistId,
            artistName: finalArtistName
          });
        }
      } else {
        const err = await res.json();
        customAlert(`Error al crear la matriz: ${err.error || 'Inténtalo de nuevo'}`);
      }
    } catch (e: any) {
      console.error(e);
      customAlert(`Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMatrix = async (artistId: string, matrixId: string) => {
    if (!await customConfirm('¿Seguro que quieres eliminar esta matriz por completo?')) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeMatrix && activeMatrix.id === matrixId) {
          setActiveMatrix(null);
        }
        await fetchData();
        customAlert('Matriz eliminada correctamente');
      } else {
        customAlert('Error al eliminar la matriz');
      }
    } catch (e) {
      customAlert('Error de conexión al eliminar la matriz');
    }
  };

  const handleRenameMatrix = async (artistId: string, matrixId: string, currentName: string) => {
    const newName = await customPrompt('Introduce el nuevo nombre para la matriz:', currentName, 'Renombrar Matriz');
    if (!newName || newName === currentName) return;
    
    // Optimistic Update
    setMatrices(prev => prev.map(m => m.id === matrixId ? { ...m, name: newName } : m));
    setCompletedMatrices(prev => prev.map(m => m.id === matrixId ? { ...m, name: newName } : m));
    if (activeMatrix && activeMatrix.id === matrixId) {
      setActiveMatrix({ ...activeMatrix, name: newName });
    }

    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
      if (!res.ok) {
        throw new Error('Error al renombrar la matriz');
      }
    } catch (e) {
      customAlert('Error de conexión al renombrar la matriz');
      fetchData(); // revert
    }
  };

  const { showMenu } = useContextMenu();

  const handleToggleStatus = async (artistId: string, matrixId: string, isCurrentlyCompleted: boolean) => {
    const newStatus = isCurrentlyCompleted ? 'active' : 'completed';
    
    // Optimistic Update
    if (isCurrentlyCompleted) {
      const m = completedMatrices.find(x => x.id === matrixId);
      if (m) {
        setCompletedMatrices(prev => prev.filter(x => x.id !== matrixId));
        setMatrices(prev => [...prev, { ...m, forceStatus: newStatus }]);
      }
    } else {
      const m = matrices.find(x => x.id === matrixId);
      if (m) {
        setMatrices(prev => prev.filter(x => x.id !== matrixId));
        setCompletedMatrices(prev => [...prev, { ...m, forceStatus: newStatus }]);
      }
    }

    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceStatus: newStatus })
      });
      if (!res.ok) throw new Error('Error updating status');
    } catch (e) {
      customAlert('Error al cambiar el estado de la matriz');
      fetchData(); // revert
    }
  };

  const handleDuplicateMatrix = async (artistId: string, matrixId: string, currentName: string) => {
    const newName = await customPrompt('Nombre de la nueva matriz (plantilla):', `${currentName} (Copia)`, 'Duplicar Matriz');
    if (!newName) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, duplicateFromId: matrixId })
      });
      if (res.ok) {
        await fetchData();
        customAlert('Matriz duplicada con éxito. Se ha copiado la estructura.');
      } else {
        customAlert('Error al duplicar la matriz');
        setIsLoading(false);
      }
    } catch (e) {
      customAlert('Error de red al duplicar la matriz');
      setIsLoading(false);
    }
  };

  const handleCopyLink = (artistId: string, matrixId: string) => {
    const url = `${window.location.origin}/matrices?id=${matrixId}&artist=${artistId}`;
    navigator.clipboard.writeText(url);
    customAlert('Enlace directo a la matriz copiado al portapapeles');
  };

  const handleMatrixContextMenu = (e: React.MouseEvent, matrix: any, isCompleted: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    showMenu(e.clientX, e.clientY, [
      {
        label: 'Abrir Matriz',
        icon: 'Table2',
        action: () => setActiveMatrix({
          id: matrix.id,
          name: matrix.name,
          artistId: matrix.artistId,
          artistName: matrix.artistName
        }),
      },
      {
        label: 'Duplicar Matriz',
        icon: 'Copy',
        action: () => handleDuplicateMatrix(matrix.artistId, matrix.id, matrix.name),
      },
      {
        label: 'Copiar Enlace',
        icon: 'Link',
        action: () => handleCopyLink(matrix.artistId, matrix.id),
      },
      {
        label: 'Renombrar',
        icon: 'Pencil',
        action: () => handleRenameMatrix(matrix.artistId, matrix.id, matrix.name),
      },
      {
        label: isCompleted ? 'Marcar como Activa' : 'Marcar como Completada',
        icon: isCompleted ? 'RotateCcw' : 'CheckCircle2',
        className: isCompleted ? 'text-info hover:bg-info/10 hover:text-info' : 'text-success hover:bg-success/10 hover:text-success',
        iconClassName: isCompleted ? 'text-info' : 'text-success',
        action: () => handleToggleStatus(matrix.artistId, matrix.id, isCompleted),
      },
      {
        label: 'Eliminar',
        icon: 'Trash2',
        className: 'text-error hover:bg-error/10 hover:text-error',
        iconClassName: 'text-error',
        action: () => handleDeleteMatrix(matrix.artistId, matrix.id),
      }
    ]);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (activeMatrix) {
    return (
      <div className="space-y-6 animate-fade-in pb-20">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveMatrix(null)} 
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Matrices
          </Button>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
          <div className="flex items-center gap-2">
            <span 
              className="text-xs text-text-secondary font-medium px-2 py-0.5 bg-surface border border-border rounded cursor-pointer hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-colors"
              onClick={() => router.push(`/artists/${activeMatrix.artistId}`)}
              title="Ir al perfil del artista"
            >
              {activeMatrix.artistName}
            </span>
            <div 
              className="flex items-center gap-2 group/title cursor-pointer hover:bg-surface border border-transparent hover:border-border px-2 py-1 -ml-2 rounded transition-all" 
              onClick={() => handleRenameMatrix(activeMatrix.artistId, activeMatrix.id, activeMatrix.name)}
              title="Renombrar Matriz"
            >
              <h2 className="font-bold text-text-primary text-xl">{activeMatrix.name}</h2>
              <Pencil className="w-4 h-4 text-text-secondary opacity-0 group-hover/title:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
        
        <div className="glass rounded-xl p-3 md:p-6 border border-border overflow-x-auto custom-scrollbar w-full relative">
          <ProductionGridBoard 
            artistId={activeMatrix.artistId} 
            matrixId={activeMatrix.id} 
            matrixName={activeMatrix.name} 
            artistName={activeMatrix.artistName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-text-primary">Matrices de Producción</h1>
          <p className="text-sm text-text-secondary mt-1 hidden sm:block">Crea, visualiza y gestiona las tareas y fases de todos tus artistas de forma unificada.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} size="sm" className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Nueva
        </Button>
      </div>

      {matrices.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center text-text-secondary border border-dashed border-border">
          <Table2 className="w-16 h-16 mx-auto mb-4 opacity-50 text-accent" />
          <h3 className="text-lg font-semibold text-text-primary mb-1">No hay matrices de producción</h3>
          <p className="max-w-md mx-auto mb-6">Crea una matriz para organizar las fases de composición, grabación, mezcla y masterización.</p>
          <Button onClick={() => setIsModalOpen(true)}>
            Crear la primera matriz
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matrices.map((m: any) => (
            <div 
              key={m.id} 
              onClick={() => {
                setActiveMatrix({
                  id: m.id,
                  name: m.name,
                  artistId: m.artistId,
                  artistName: m.artistName
                });
              }}
              onContextMenu={(e) => handleMatrixContextMenu(e, m, false)}
              className="relative overflow-hidden glass rounded-[20px] p-5 border border-border hover:border-accent/50 transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/5 cursor-context-menu"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-transform duration-500 group-hover:scale-150" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center shrink-0 text-accent group-hover:scale-110 transition-transform duration-300 shadow-inner">
                      <Table2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-lg text-text-primary truncate">{m.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5">
                        <User className="w-3.5 h-3.5" />
                        <span className="truncate">Artista: <span className="font-medium text-text-primary hover:text-accent cursor-pointer transition-colors" onClick={(e) => { e.stopPropagation(); router.push(`/artists/${m.artistId}`); }} title="Ir al perfil del artista">{m.artistName || 'Desconocido'}</span></span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-success/10 text-success border border-success/20 px-2 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Activa
                  </div>
                </div>
                
                <div className="flex justify-between items-end mt-4 relative z-10">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1 text-text-secondary bg-surface-elevated px-2 py-1 rounded-md border border-border">
                      <FileText className="w-3 h-3" />
                      {m.projectId ? 'Sincronizada' : 'Sincronizada'}
                    </span>
                    <span className="flex items-center gap-1 text-text-secondary bg-surface-elevated px-2 py-1 rounded-md border border-border">
                      <Check className="w-3 h-3" />
                      Trackeo Activo
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Matrices Section */}
      {completedMatrices.length > 0 && (
        <div className="mt-12">
          <button 
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4 w-full"
          >
            <ChevronRight className={`w-5 h-5 transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
            <h2 className="text-xl font-bold">Matrices Completadas ({completedMatrices.length})</h2>
            <div className="h-px bg-border flex-1 ml-4" />
          </button>
          
          {showCompleted && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-4 duration-300">
              {completedMatrices.map((m: any) => (
                <div 
                  key={m.id} 
                  onClick={() => {
                    setActiveMatrix({
                      id: m.id,
                      name: m.name,
                      artistId: m.artistId,
                      artistName: m.artistName
                    });
                  }}
                  onContextMenu={(e) => handleMatrixContextMenu(e, m, true)}
                  className="glass rounded-xl p-5 border border-border/50 hover:border-accent/30 transition-all group relative flex flex-col justify-between min-h-[180px] opacity-70 hover:opacity-100 bg-surface/50 cursor-context-menu"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Check className="w-5 h-5 text-success shrink-0" />
                        <h4 className="font-bold text-base text-text-primary truncate line-through decoration-text-secondary/50">{m.name}</h4>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium mb-4">
                      <User className="w-3.5 h-3.5 text-accent-light" />
                      <span>Artista:</span>
                      <span className="text-text-primary hover:text-accent hover:underline transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); router.push(`/artists/${m.artistId}`); }}>
                        {m.artistName || 'Desconocido'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-[10px] text-text-secondary">
                      <span className="text-success font-medium">Completada</span>
                    </div>
                    
                    <Button 
                      className="w-full text-xs h-8" 
                      variant="outline" 
                      onClick={() => setActiveMatrix({ id: m.id, name: m.name, artistId: m.artistId, artistName: m.artistName })}
                    >
                      Ver Matriz
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Nueva Matriz */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="glass w-full max-w-md rounded-xl border border-border p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Table2 className="w-5 h-5 text-accent" />
              Crear Nueva Matriz
            </h2>
            
            <form onSubmit={handleCreateMatrix} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Nombre de la Matriz
                </label>
                <input 
                  type="text" 
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Ej: Álbum 2026, Single de Verano..."
                  value={newMatrixName}
                  onChange={(e) => setNewMatrixName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Asignar a Artista
                </label>
                
                {/* Custom Searchable Combobox */}
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input 
                      type="text" 
                      className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="Buscar o crear nuevo artista..."
                      value={searchTerm}
                      onClick={() => setIsArtistDropdownOpen(true)}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsArtistDropdownOpen(true);
                        // Limpiar ID si cambian el texto
                        const exactMatch = artists.find(a => a.name.toLowerCase() === e.target.value.toLowerCase());
                        if (exactMatch) {
                          setSelectedArtistId(exactMatch.id);
                        } else {
                          setSelectedArtistId('');
                        }
                      }}
                      disabled={isSubmitting}
                    />
                  </div>

                  {isArtistDropdownOpen && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-full bg-surface-elevated border border-border rounded-xl shadow-2xl p-2 animate-fade-in max-h-60 flex flex-col">
                      <div className="overflow-y-auto flex-1 space-y-0.5 max-h-40">
                        {artists.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                          <div className="p-2 text-center">
                            <p className="text-[11px] text-text-secondary mb-1">No se encontró el artista.</p>
                            <p className="text-xs font-medium text-accent">"{searchTerm}" será creado como uno nuevo.</p>
                          </div>
                        ) : (
                          artists
                            .filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map((artist) => {
                              const isSelected = selectedArtistId === artist.id || searchTerm.toLowerCase() === artist.name.toLowerCase();
                              return (
                                <button
                                  key={artist.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedArtistId(artist.id);
                                    setSearchTerm(artist.name);
                                    setIsArtistDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors text-left ${
                                    isSelected 
                                      ? 'bg-accent/10 text-accent-light font-medium' 
                                      : 'text-text-primary hover:bg-surface hover:text-white'
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-accent/20 text-accent-light flex items-center justify-center text-[8px] font-bold">
                                      {artist.name.substring(0, 2).toUpperCase()}
                                    </span>
                                    {artist.name}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-accent-light" />}
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => {
                    setIsModalOpen(false);
                    setNewMatrixName('');
                    setSelectedArtistId('');
                    setSearchTerm('');
                    setIsArtistDropdownOpen(false);
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !newMatrixName.trim() || (!selectedArtistId && !searchTerm.trim())}
                >
                  {isSubmitting ? 'Creando...' : 'Crear Matriz'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
