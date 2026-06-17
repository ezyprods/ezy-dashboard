'use client';

import { useState, useEffect } from 'react';
import { Loader2, Music, Image as ImageIcon, File, UploadCloud, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customConfirm, customAlert } from '@/lib/dialog';

export interface SmartUploadFile {
  file: File;
  id: string; // internal id
  mimeGroup: 'audio' | 'image' | 'video' | 'other';
  subType: 'bounce' | 'master' | 'mix' | 'stem' | 'cover' | 'promo' | 'none';
  folderId: string; // The selected project folder
  customName: string; // Generated name
}

export function SmartUploadModal({
  files,
  defaultFolderId,
  folders,
  artistName,
  onUpload,
  onCancel
}: {
  files: File[];
  defaultFolderId: string;
  folders: { id: string; name: string }[];
  artistName?: string;
  onUpload: (processedFiles: { file: File; folderId: string; customName: string; overwriteId?: string }[]) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<SmartUploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initialize items
    const initial = files.map((f, i) => {
      let mimeGroup: SmartUploadFile['mimeGroup'] = 'other';
      if (f.type.startsWith('audio/')) mimeGroup = 'audio';
      else if (f.type.startsWith('image/')) mimeGroup = 'image';
      else if (f.type.startsWith('video/')) mimeGroup = 'video';

      let subType: SmartUploadFile['subType'] = 'none';
      if (mimeGroup === 'audio') {
        const nameLower = f.name.toLowerCase();
        if (nameLower.includes('master')) subType = 'master';
        else if (nameLower.includes('mix')) subType = 'mix';
        else if (nameLower.includes('stem')) subType = 'stem';
        else subType = 'bounce'; // default audio to bounce
      }

      return {
        file: f,
        id: `file-${i}`,
        mimeGroup,
        subType,
        folderId: defaultFolderId,
        customName: generateName(f.name, subType)
      };
    });
    setItems(initial);
  }, [files, defaultFolderId]);

  const generateName = (original: string, subType: string) => {
    if (subType === 'none') return original;
    
    // Extraer extensión
    const extMatch = original.match(/\.[^.]+$/);
    const ext = extMatch ? extMatch[0] : '';
    const baseName = original.replace(/\.[^.]+$/, '');

    // Limpiar prefijos existentes si se detectan
    let cleanName = baseName.replace(/^\[.*?\]\s*/, '').replace(/^(Master|Bounce|Mix|Stem)_/i, '').trim();

    if (subType === 'bounce') {
      const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const artistPrefix = artistName ? `${artistName} - ` : '';
      return `${artistPrefix}${cleanName} [${dateStr}]${ext}`;
    } else if (subType === 'master') {
      return `[MASTER] ${cleanName}${ext}`;
    } else if (subType === 'mix') {
      return `[MIX] ${cleanName}${ext}`;
    } else if (subType === 'stem') {
      return `[STEM] ${cleanName}${ext}`;
    }
    
    return original;
  };

  const updateItem = (id: string, updates: Partial<SmartUploadFile>) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, ...updates };
        if (updates.subType !== undefined) {
          updated.customName = generateName(item.file.name, updated.subType);
        }
        return updated;
      }
      return item;
    }));
  };

  const handleUpload = async () => {
    setIsProcessing(true);
    const processed: { file: File; folderId: string; customName: string; overwriteId?: string }[] = [];

    for (const item of items) {
      let overwriteId: string | undefined = undefined;

      // Si es un Master, aplicar la inteligencia para buscar el anterior y reemplazarlo
      if (item.subType === 'master') {
        try {
          const res = await fetch(`/api/files?folderId=${item.folderId}`);
          if (res.ok) {
            const data = await res.json();
            const existingFiles = data.items || [];
            
            const possibleMasters = existingFiles.filter((f: any) => 
              f.mimeType.startsWith('audio/') && 
              (f.name.toLowerCase().includes('master') || f.name.toLowerCase() === item.customName.toLowerCase())
            );

            if (possibleMasters.length > 0) {
              const target = possibleMasters[0];
              const confirm = await customConfirm(`Para el archivo "${item.file.name}", hemos detectado un Master anterior en este proyecto: "${target.name}".\n\n¿Deseas reemplazarlo con esta nueva versión? (Si cancelas, se subirá como archivo nuevo)`);
              if (confirm) {
                overwriteId = target.id;
              }
            }
          }
        } catch (e) {
          console.error('Error verificando masters existentes', e);
        }
      } else if (item.subType === 'bounce') {
        try {
          // Inteligencia para Bounces: detectar versiones previas
          const res = await fetch(`/api/files?folderId=${item.folderId}`);
          if (res.ok) {
            const data = await res.json();
            const existingFiles = data.items || [];
            
            // Buscar otros audios que contengan el nombre base de la canción (limpio de fechas)
            const cleanBase = item.file.name.replace(/\.[^.]+$/, '').replace(/^\[.*?\]\s*/, '').replace(/^(Master|Bounce|Mix|Stem)_/i, '').trim().toLowerCase();
            
            const existingBounces = existingFiles.filter((f: any) => {
               if (!f.mimeType.startsWith('audio/')) return false;
               const fClean = f.name.toLowerCase();
               return fClean.includes(cleanBase) && (fClean.includes('bounce') || fClean.match(/\[\d{4}-\d{2}-\d{2}\]/));
            });

            if (existingBounces.length > 0) {
              const confirmReplace = await customConfirm(`Hemos detectado ${existingBounces.length} versión(es) anterior(es) de este Bounce ("${cleanBase}").\n\nPor defecto, los bounces se acumulan como historial.\n\nPresiona 'Aceptar' si prefieres REEMPLAZAR la última versión.\nPresiona 'Cancelar' para guardarlo como un historial nuevo.`);
              if (confirmReplace) {
                // Sobrescribir el más reciente
                const sorted = existingBounces.sort((a: any, b: any) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
                overwriteId = sorted[0].id;
              }
            }
          }
        } catch (e) {
          console.error('Error verificando bounces existentes', e);
        }
      }

      processed.push({
        file: item.file,
        folderId: item.folderId,
        customName: item.customName,
        overwriteId
      });
    }

    setIsProcessing(false);
    onUpload(processed);
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass w-full max-w-3xl max-h-[90vh] rounded-xl border border-border p-6 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <UploadCloud className="w-6 h-6 text-accent" />
              Subida Inteligente
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Organiza tus archivos antes de subirlos. El sistema nombrará los bounces por fecha y detectará Masters para reemplazos.
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-text-secondary hover:text-white bg-surface rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {items.map(item => (
            <div key={item.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {item.mimeGroup === 'audio' ? <Music className="w-5 h-5 text-accent" /> : 
                 item.mimeGroup === 'image' ? <ImageIcon className="w-5 h-5 text-success" /> : 
                 <File className="w-5 h-5 text-text-secondary" />}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-text-primary text-sm truncate" title={item.file.name}>{item.file.name}</p>
                  <p className="text-xs text-text-secondary">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {item.mimeGroup === 'audio' && (
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Tipo de Audio</label>
                    <select 
                      value={item.subType} 
                      onChange={e => updateItem(item.id, { subType: e.target.value as any })}
                      className="w-full bg-surface-elevated border border-border/50 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-accent outline-none"
                    >
                      <option value="bounce">Bounce (Demo / Prueba)</option>
                      <option value="mix">Mix (Mezcla)</option>
                      <option value="master">Master (Definitivo)</option>
                      <option value="stem">Stem</option>
                      <option value="none">Otro Audio</option>
                    </select>
                  </div>
                )}
                
                <div className={item.mimeGroup === 'audio' ? 'md:col-span-2' : 'md:col-span-3'}>
                  <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Proyecto / Destino</label>
                  <select 
                    value={item.folderId} 
                    onChange={e => updateItem(item.id, { folderId: e.target.value })}
                    className="w-full bg-surface-elevated border border-border/50 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-accent outline-none"
                  >
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">Nombre Final</label>
                <input 
                  type="text" 
                  value={item.customName}
                  onChange={e => updateItem(item.id, { customName: e.target.value })}
                  className="w-full bg-transparent border-b border-border/50 px-1 py-1 text-sm text-accent-light focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="ghost" onClick={onCancel} disabled={isProcessing}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
            Confirmar y Subir
          </Button>
        </div>
      </div>
    </div>
  );
}
