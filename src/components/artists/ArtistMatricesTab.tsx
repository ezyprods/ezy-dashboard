'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, Table2, Trash2, Calendar, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


export function ArtistMatricesTab({ artistId, artistName }: { artistId: string; artistName?: string }) {
  const [matrices, setMatrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMatrixId, setActiveMatrixId] = useState<string | null>(null);

  useEffect(() => {
    fetchMatrices();
  }, [artistId]);

  const fetchMatrices = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`);
      if (res.ok) {
        const data = await res.json();
        setMatrices(data.matrices || []);
      } else {
        const err = await res.json();
        console.error('fetchMatrices error:', err);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const createMatrix = async () => {
    const name = await customPrompt('Nombre de la nueva matriz (ej: Álbum 2024):');
    if (!name) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        fetchMatrices();
      } else {
        const err = await res.json();
        customAlert(`Error al crear matriz: ${err.error} - ${err.details}`);
      }
    } catch (e: any) {
      console.error(e);
      customAlert(`Error: ${e.message}`);
    }
  };

  const deleteMatrix = async (matrixId: string) => {
    if (!await customConfirm('¿Seguro que quieres eliminar esta matriz por completo?')) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeMatrixId === matrixId) setActiveMatrixId(null);
        fetchMatrices();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (activeMatrixId) {
    const matrix = matrices.find(m => m.id === activeMatrixId);
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setActiveMatrixId(null)} className="text-text-secondary hover:text-text-primary">
            Volver a Matrices
          </Button>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
          <h2 className="font-bold text-text-primary text-xl">{matrix?.name || 'Matriz'}</h2>
        </div>
        
        <div className="glass rounded-xl p-6 border border-border">
          <ProductionGridBoard 
            artistId={artistId} 
            matrixId={activeMatrixId} 
            matrixName={matrix?.name} 
            artistName={artistName}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text-primary">Matrices de Producción</h3>
          <p className="text-sm text-text-secondary">Trackea tus proyectos, canciones y fases.</p>
        </div>
        <Button onClick={createMatrix}><Plus className="w-4 h-4 mr-2" /> Nueva Matriz</Button>
      </div>

      {matrices.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <Table2 className="w-12 h-12 mx-auto mb-4 opacity-50 text-accent" />
          <p>No tienes matrices creadas para este artista.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matrices.map(m => (
            <div key={m.id} className="glass rounded-xl p-5 border border-border hover:border-accent/50 transition-all group relative">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-accent" />
                  <h4 className="font-bold text-lg text-text-primary">{m.name}</h4>
                </div>
                <button onClick={() => deleteMatrix(m.id)} className="p-1.5 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-text-secondary mb-6">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Sinc. Google Calendar</span>
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Fases Personalizables</span>
              </div>

              <Button className="w-full" variant="secondary" onClick={() => setActiveMatrixId(m.id)}>
                Abrir Matriz
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
