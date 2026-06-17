'use client';

import * as React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { 
  Loader2, UploadCloud, CheckCircle2, AlertCircle, X, Music, 
  FileText, FileCode, Clock, Trash2, Edit3, ArrowRight, FolderKanban
} from 'lucide-react';
import { formatFileSize } from '@/lib/utils';
import type { Artist } from '@/types';
import { FOLDER_NAME_MAP } from '@/lib/constants';

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles: File[];
  artists: Artist[];
  preselectedArtistId?: string;
}

interface FileToUpload {
  file: File;
  customName: string;
  artistId: string;
  projectId: string; // empty means artist root folder
  folderId: string; // target folder ID where it will be uploaded
  folderType: string; // 'Bounces' | 'Mix' | 'Master' | 'Sessions' | 'Other'
  expiresInMs: number | null; // expiration time in MS, or null for never
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
  resultId?: string;
  resultLink?: string;
}

export function SmartUploadModal({ isOpen, onClose, initialFiles, artists, preselectedArtistId }: SmartUploadModalProps) {
  const [files, setFiles] = React.useState<FileToUpload[]>([]);
  const [activeFileIndex, setActiveFileIndex] = React.useState<number>(0);
  const [artistFolders, setArtistFolders] = React.useState<Record<string, any[]>>({});
  const [projectSubfolders, setProjectSubfolders] = React.useState<Record<string, any[]>>({});
  const [loadingFolders, setLoadingFolders] = React.useState<Record<string, boolean>>({});

  // 1. Initialize files and apply smart detection
  React.useEffect(() => {
    if (initialFiles.length === 0) return;

    const initialized = initialFiles.map(file => {
      const nameLower = file.name.toLowerCase();
      
      // If a preselected artist was provided (e.g. dropped on artist card), use it
      let detectedArtistId = '';
      if (preselectedArtistId) {
        detectedArtistId = preselectedArtistId;
      } else {
        // Auto-detect Artist from filename
        for (const artist of artists) {
          const artistNameClean = artist.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const fileClean = nameLower.replace(/[^a-z0-9]/g, '');
          if (fileClean.includes(artistNameClean) || nameLower.includes(artist.name.toLowerCase())) {
            detectedArtistId = artist.id;
            break;
          }
        }
      }

      // Default to first artist if none detected
      if (!detectedArtistId && artists.length > 0) {
        detectedArtistId = artists[0].id;
      }

      // Auto-detect Folder Type
      let detectedFolderType = 'Other';
      if (nameLower.includes('bounce')) {
        detectedFolderType = 'Bounces';
      } else if (nameLower.includes('master')) {
        detectedFolderType = 'Master';
      } else if (nameLower.includes('mix') || nameLower.includes('mezcla')) {
        detectedFolderType = 'Mix';
      } else if (nameLower.includes('session') || nameLower.includes('sesion') || nameLower.includes('stem')) {
        detectedFolderType = 'Sessions';
      }

      return {
        file,
        customName: file.name,
        artistId: detectedArtistId,
        projectId: '', // will load projects dynamically
        folderId: '', // will resolve once folders are loaded
        folderType: detectedFolderType,
        expiresInMs: null,
        status: 'idle' as const,
        progress: 0
      };
    });

    setFiles(initialized);
    setActiveFileIndex(0);
  }, [initialFiles, artists]);

  // Load folders for selected artist
  const loadArtistFolders = React.useCallback(async (artistFolderId: string) => {
    if (!artistFolderId || artistFolders[artistFolderId] || loadingFolders[artistFolderId]) return;

    setLoadingFolders(prev => ({ ...prev, [artistFolderId]: true }));
    try {
      const res = await fetch(`/api/files?folderId=${artistFolderId}`);
      if (res.ok) {
        const data = await res.json();
        // Keep only folders
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setArtistFolders(prev => ({ ...prev, [artistFolderId]: folders }));
      }
    } catch (err) {
      console.error('Error loading artist folders:', err);
    } finally {
      setLoadingFolders(prev => ({ ...prev, [artistFolderId]: false }));
    }
  }, [artistFolders, loadingFolders]);

  // Load project subfolders (Bounces, Mix, Master, etc.)
  const loadProjectFolders = React.useCallback(async (projectFolderId: string) => {
    if (!projectFolderId || projectSubfolders[projectFolderId] || loadingFolders[projectFolderId]) return;

    setLoadingFolders(prev => ({ ...prev, [projectFolderId]: true }));
    try {
      const res = await fetch(`/api/files?folderId=${projectFolderId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setProjectSubfolders(prev => ({ ...prev, [projectFolderId]: folders }));
      }
    } catch (err) {
      console.error('Error loading project folders:', err);
    } finally {
      setLoadingFolders(prev => ({ ...prev, [projectFolderId]: false }));
    }
  }, [projectSubfolders, loadingFolders]);

  const activeFile = files[activeFileIndex];

  // Auto-fetch folders when active file changes or artistId/projectId changes
  React.useEffect(() => {
    if (!activeFile) return;
    loadArtistFolders(activeFile.artistId);
    if (activeFile.projectId) {
      loadProjectFolders(activeFile.projectId);
    }
  }, [activeFile, loadArtistFolders, loadProjectFolders]);

  // Auto-detect project based on filename once artist folders are loaded
  React.useEffect(() => {
    if (!activeFile || !activeFile.artistId) return;
    const folders = artistFolders[activeFile.artistId];
    if (!folders || folders.length === 0) return;

    // Filter projects (ignore standard items like Images, Contracts, etc.)
    const ignoreList = [
      'Images', 'Documents', 'Contracts', 'Stems', 'Bounces', 'Mix', 'Master', 'Sessions', 'Other',
      '01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos',
      '01_Sesiones_y_DAW', '02_Bounces_y_Grabaciones', '03_Revisiones_y_Mezclas', '04_Masters_Finales', '05_Referencias_y_Otros'
    ];
    const projects = folders.filter(f => !ignoreList.includes(f.name));

    if (projects.length > 0 && !activeFile.projectId) {
      let matchedProjectId = '';
      const nameLower = activeFile.file.name.toLowerCase();

      for (const proj of projects) {
        const projNameClean = proj.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (nameLower.includes(projNameClean) || nameLower.includes(proj.name.toLowerCase())) {
          matchedProjectId = proj.id;
          break;
        }
      }

      if (matchedProjectId) {
        updateActiveFile({ projectId: matchedProjectId });
      } else {
        // Default to first project if none matches
        updateActiveFile({ projectId: projects[0].id });
      }
    }
  }, [activeFile, artistFolders]);

  const updateActiveFile = (updates: Partial<FileToUpload>) => {
    setFiles(prev => prev.map((f, i) => i === activeFileIndex ? { ...f, ...updates } : f));
  };

  const handleUploadSingle = async (index: number) => {
    const f = files[index];
    if (!f || f.status === 'uploading' || f.status === 'success') return;

    // Set target folder ID
    const mappedFolderName = FOLDER_NAME_MAP[f.folderType] || f.folderType;
    const targetFolderId = f.projectId 
      ? (projectSubfolders[f.projectId]?.find(sf => sf.name.toLowerCase() === f.folderType.toLowerCase() || sf.name === mappedFolderName)?.id || f.projectId)
      : (artistFolders[f.artistId]?.find(sf => sf.name.toLowerCase() === f.folderType.toLowerCase() || sf.name === mappedFolderName)?.id || f.artistId);

    if (!targetFolderId) {
      setFiles(prev => prev.map((item, i) => i === index ? { 
        ...item, 
        status: 'error', 
        errorMessage: 'No se pudo resolver la carpeta de destino en Google Drive.' 
      } : item));
      return;
    }

    setFiles(prev => prev.map((item, i) => i === index ? { ...item, status: 'uploading', progress: 20 } : item));

    try {
      const formData = new FormData();
      // Use the customName provided by user, keeping the original extension
      const extension = f.file.name.substring(f.file.name.lastIndexOf('.'));
      let finalName = f.customName;
      if (!finalName.endsWith(extension)) {
        finalName += extension;
      }

      const renamedFile = new File([f.file], finalName, { type: f.file.type });
      formData.append('file', renamedFile);
      formData.append('parentId', targetFolderId);

      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Error al subir el archivo');
      }

      const data = await res.json();
      const uploadedFileId = data.file.id;

      // Handle expiration if selected
      if (f.expiresInMs) {
        await fetch(`/api/files/${uploadedFileId}/expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresInMs: f.expiresInMs })
        });
      }

      setFiles(prev => prev.map((item, i) => i === index ? { 
        ...item, 
        status: 'success', 
        progress: 100,
        resultId: uploadedFileId,
        resultLink: data.file.webViewLink
      } : item));

    } catch (err: any) {
      setFiles(prev => prev.map((item, i) => i === index ? { 
        ...item, 
        status: 'error', 
        progress: 0,
        errorMessage: err.message || 'Error en la subida.' 
      } : item));
    }
  };

  const handleUploadAll = async () => {
    // Start uploads sequentially
    for (let i = 0; i < files.length; i++) {
      await handleUploadSingle(i);
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'flp') {
      return (
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20 shadow-md">
          <span className="text-orange-500 font-extrabold text-[10px] tracking-tight">FLP</span>
        </div>
      );
    }
    const audioExts = ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'aif', 'aiff'];
    if (audioExts.includes(ext || '')) {
      return (
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 border border-accent/20">
          <Music className="w-5 h-5 text-accent" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center shrink-0 border border-border">
        <FileText className="w-5 h-5 text-text-secondary" />
      </div>
    );
  };

  if (files.length === 0) return null;

  const currentArtistFolders = activeFile ? (artistFolders[activeFile.artistId] || []) : [];
  const projectList = currentArtistFolders.filter(f => {
    const ignoreList = [
      'Images', 'Documents', 'Contracts', 'Stems', 'Bounces', 'Mix', 'Master', 'Sessions', 'Other',
      '01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos',
      '01_Sesiones_y_DAW', '02_Bounces_y_Grabaciones', '03_Revisiones_y_Mezclas', '04_Masters_Finales', '05_Referencias_y_Otros'
    ];
    return !ignoreList.includes(f.name);
  });

  const uploadSuccessCount = files.filter(f => f.status === 'success').length;
  const isUploadingAny = files.some(f => f.status === 'uploading');

  return (
    <Modal
      isOpen={isOpen}
      onClose={isUploadingAny ? () => {} : onClose}
      title="Subida Rápida Inteligente"
      description="Configura el destino, renombra o programa el borrado de los archivos arrastrados."
      className="max-w-4xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        
        {/* Left pane: File list */}
        <div className="lg:col-span-1 border-r border-border/40 pr-4 space-y-2 max-h-[420px] overflow-y-auto scroll-smooth">
          <Label className="text-xs text-text-secondary uppercase tracking-wider font-bold">Archivos cargados ({files.length})</Label>
          <div className="space-y-1.5 mt-2">
            {files.map((f, i) => {
              const isActive = i === activeFileIndex;
              return (
                <button
                  key={i}
                  onClick={() => setActiveFileIndex(i)}
                  className={`w-full p-2.5 rounded-xl border flex items-center gap-3 text-left transition-all ${
                    isActive 
                      ? 'bg-accent/10 border-accent/40 shadow-lg shadow-accent/5' 
                      : 'bg-surface/30 border-border/50 hover:bg-surface/70'
                  }`}
                >
                  {getFileIcon(f.file.name)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isActive ? 'text-accent-light' : 'text-text-primary'}`}>
                      {f.customName}
                    </p>
                    <span className="text-[10px] text-text-secondary">
                      {formatFileSize(f.file.size)}
                    </span>
                  </div>

                  {/* Status Indicator */}
                  {f.status === 'uploading' && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                  )}
                  {f.status === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  )}
                  {f.status === 'error' && (
                    <AlertCircle className="w-3.5 h-3.5 text-error" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right pane: Config details for selected file */}
        {activeFile && (
          <div className="lg:col-span-2 space-y-5">
            {/* File info header */}
            <div className="p-3 bg-surface-elevated/40 border border-border/30 rounded-xl flex items-center gap-3">
              {getFileIcon(activeFile.file.name)}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">Archivo Seleccionado</span>
                <p className="text-sm font-semibold text-text-primary truncate">{activeFile.file.name}</p>
              </div>
            </div>

            {/* Editable Name */}
            <div className="space-y-2">
              <Label htmlFor="custom-name">Nombre del archivo en Google Drive</Label>
              <input
                id="custom-name"
                type="text"
                value={activeFile.customName.replace(/\.[^/.]+$/, "")}
                onChange={(e) => {
                  const ext = activeFile.file.name.substring(activeFile.file.name.lastIndexOf('.'));
                  updateActiveFile({ customName: e.target.value + ext });
                }}
                disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Target Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Artist Select */}
              <div className="space-y-2">
                <Label htmlFor="artist-select">Artista de destino</Label>
                <select
                  id="artist-select"
                  value={activeFile.artistId}
                  onChange={(e) => {
                    updateActiveFile({ artistId: e.target.value, projectId: '' });
                  }}
                  disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none animate-fade-in"
                >
                  {artists.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Project Select */}
              <div className="space-y-2">
                <Label htmlFor="project-select">Proyecto / Carpeta del Proyecto</Label>
                <select
                  id="project-select"
                  value={activeFile.projectId}
                  onChange={(e) => {
                    updateActiveFile({ projectId: e.target.value });
                  }}
                  disabled={activeFile.status === 'uploading' || activeFile.status === 'success' || loadingFolders[activeFile.artistId]}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="">Carpeta General (Artista)</option>
                  {projectList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Folder Type */}
              <div className="space-y-2">
                <Label htmlFor="folder-type">Subcarpeta de destino</Label>
                <select
                  id="folder-type"
                  value={activeFile.folderType}
                  onChange={(e) => updateActiveFile({ folderType: e.target.value })}
                  disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="Bounces">Bounces</option>
                  <option value="Mix">Mix / Mezcla</option>
                  <option value="Master">Master / Masterización</option>
                  <option value="Sessions">Sessions / Sesiones</option>
                  <option value="Other">Other / Otros</option>
                </select>
              </div>

              {/* Expiration Timer (Autoborrado) */}
              <div className="space-y-2">
                <Label htmlFor="expiration-select">Eliminación Programada (Autoborrado)</Label>
                <select
                  id="expiration-select"
                  value={activeFile.expiresInMs || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    updateActiveFile({ expiresInMs: val });
                  }}
                  disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none"
                >
                  <option value="">No borrar nunca (Permanente)</option>
                  <option value={24 * 60 * 60 * 1000}>Borrar en 1 día</option>
                  <option value={3 * 24 * 60 * 60 * 1000}>Borrar en 3 días</option>
                  <option value={7 * 24 * 60 * 60 * 1000}>Borrar en 7 días</option>
                  <option value={30 * 24 * 60 * 60 * 1000}>Borrar en 30 días</option>
                </select>
              </div>
            </div>

            {/* Individual File Status / Progress */}
            {activeFile.status !== 'idle' && (
              <div className="p-3 bg-surface-elevated/45 rounded-xl border border-border/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-primary">
                    {activeFile.status === 'uploading' && 'Subiendo archivo...'}
                    {activeFile.status === 'success' && 'Subido correctamente'}
                    {activeFile.status === 'error' && 'Error al subir'}
                  </span>
                  <span className="text-text-secondary font-mono">{activeFile.progress}%</span>
                </div>
                {activeFile.status === 'uploading' && (
                  <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-accent transition-all duration-300 rounded-full"
                      style={{ width: `${activeFile.progress}%` }}
                    />
                  </div>
                )}
                {activeFile.status === 'error' && (
                  <p className="text-[11px] text-error flex items-center gap-1.5 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{activeFile.errorMessage}</span>
                  </p>
                )}
                {activeFile.status === 'success' && activeFile.resultLink && (
                  <a 
                    href={activeFile.resultLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 mt-1"
                  >
                    Ver archivo en Google Drive <ArrowRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Single item quick actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFiles(prev => prev.filter((_, idx) => idx !== activeFileIndex));
                  setActiveFileIndex(prev => Math.max(0, prev - 1));
                }}
                disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
              >
                Descartar Archivo
              </Button>
              <Button
                size="sm"
                onClick={() => handleUploadSingle(activeFileIndex)}
                disabled={activeFile.status === 'uploading' || activeFile.status === 'success'}
              >
                Subir este archivo
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Global actions */}
      <div className="flex items-center justify-between border-t border-border/40 mt-6 pt-4">
        <div className="text-xs text-text-secondary flex items-center gap-2">
          {uploadSuccessCount > 0 && (
            <span className="text-success font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {uploadSuccessCount} subido(s)
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isUploadingAny}
          >
            {uploadSuccessCount === files.length ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            onClick={handleUploadAll}
            disabled={isUploadingAny || uploadSuccessCount === files.length}
            className="glow"
          >
            {isUploadingAny ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Subiendo...
              </>
            ) : (
              'Subir todos los archivos'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
