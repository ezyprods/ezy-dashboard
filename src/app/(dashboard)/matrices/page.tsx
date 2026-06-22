'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Plus, Table2, Trash2, Calendar, FileText, ChevronRight, User, ArrowLeft, Search, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';

export default function MatricesPage() {
  const [matrices, setMatrices] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
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
          customAlert('Tu sesión de Google Drive ha expirado por seguridad. Redirigiendo para reconectar...');
          setTimeout(() => {
            window.location.href = '/api/auth/google';
          }, 2000);
          return;
        }
        
        setMatrices(matricesData.matrices || []);
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
      console.error(e);
    }
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
            <span className="text-xs text-text-secondary font-medium px-2 py-0.5 bg-surface border border-border rounded">
              {activeMatrix.artistName}
            </span>
            <h2 className="font-bold text-text-primary text-xl">{activeMatrix.name}</h2>
          </div>
        </div>
        
        <div className="glass rounded-xl p-6 border border-border">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Matrices de Producción Globales</h1>
          <p className="text-sm text-text-secondary mt-1">Crea, visualiza y gestiona las tareas y fases de todos tus artistas de forma unificada.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Matriz
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matrices.map((m: any) => (
            <div 
              key={m.id} 
              className="glass rounded-xl p-5 border border-border hover:border-accent/50 transition-all group relative flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Table2 className="w-5 h-5 text-accent shrink-0" />
                    <h4 className="font-bold text-base text-text-primary truncate">{m.name}</h4>
                  </div>
                  <button 
                    onClick={() => handleDeleteMatrix(m.artistId, m.id)} 
                    className="p-1.5 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Eliminar Matriz"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium mb-4">
                  <User className="w-3.5 h-3.5 text-accent-light" />
                  <span>Artista:</span>
                  <span className="text-text-primary">{m.artistName || 'Desconocido'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-4 text-[10px] text-text-secondary">
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Sinc. Drive</span>
                  <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Trackeo</span>
                </div>
                
                <Button 
                  className="w-full text-xs h-8" 
                  variant="secondary" 
                  onClick={() => setActiveMatrix({ id: m.id, name: m.name, artistId: m.artistId, artistName: m.artistName })}
                >
                  Abrir Matriz
                </Button>
              </div>
            </div>
          ))}
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
