'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Folder, FileAudio, File as FileIcon, UploadCloud, Loader2, Music, CheckSquare, Send } from "lucide-react";
import { AudioPlayer } from '@/components/projects/AudioPlayer';
import { ProjectChecklist } from '@/components/projects/ProjectChecklist';
import { CommunicationsTab } from '@/components/projects/CommunicationsTab';
import { ProjectPaymentsWidget } from '@/components/projects/ProjectPaymentsWidget';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('files');
  const [uploadingTo, setUploadingTo] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Error cargando el proyecto');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (folderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTo(folderId);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', folderId);

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Error subiendo archivo');
      await fetchProject(); // Recargar archivos
    } catch (err) {
      alert('Error subiendo el archivo');
    } finally {
      setUploadingTo(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (error || !data) {
    return (
      <div className="glass p-8 rounded-xl text-center border-error/20">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="text-text-secondary mb-6">{error}</p>
        <Button onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }

  const { project, folders } = data;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{project.title}</h1>
          <p className="text-text-secondary text-sm uppercase tracking-widest">{project.type}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border/50 px-2 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('files')}
          className={`pb-3 border-b-2 font-medium whitespace-nowrap ${activeTab === 'files' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          <div className="flex items-center gap-2"><Music className="w-4 h-4" /> Archivos</div>
        </button>
        <button 
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 border-b-2 font-medium whitespace-nowrap ${activeTab === 'tasks' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          <div className="flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Estado</div>
        </button>
        <button 
          onClick={() => setActiveTab('communications')}
          className={`pb-3 border-b-2 font-medium whitespace-nowrap ${activeTab === 'communications' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          <div className="flex items-center gap-2"><Send className="w-4 h-4" /> Comms</div>
        </button>
        <button 
          onClick={() => setActiveTab('payments')}
          className={`pb-3 border-b-2 font-medium whitespace-nowrap ${activeTab === 'payments' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
        >
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> Pagos</div>
        </button>
      </div>

      {/* Tab: Files */}
      {activeTab === 'files' && (
        <div className="space-y-8 animate-fade-in">
          {folders.map((folder: any) => (
            <div key={folder.id} className="glass rounded-xl border border-border overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-border bg-surface/50">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-accent" />
                  <h3 className="font-bold text-lg">{folder.name}</h3>
                </div>
                
                <div>
                  <input 
                    type="file" 
                    id={`upload-${folder.id}`} 
                    className="hidden" 
                    onChange={(e) => handleFileUpload(folder.id, e)}
                  />
                  <label htmlFor={`upload-${folder.id}`}>
                    <Button variant="secondary" size="sm" className="cursor-pointer" asChild>
                      <span>
                        {uploadingTo === folder.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                        Subir Archivo
                      </span>
                    </Button>
                  </label>
                </div>
              </div>
              
              <div className="p-4">
                {folder.files.length === 0 ? (
                  <p className="text-text-secondary text-sm text-center py-4">La carpeta está vacía.</p>
                ) : (
                  <div className="space-y-3">
                    {folder.files.map((file: any) => {
                      const isAudio = file.mimeType?.startsWith('audio/');
                      return isAudio ? (
                        <AudioPlayer key={file.id} fileId={file.id} fileName={file.name} />
                      ) : (
                        <div key={file.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface/30">
                          <div className="flex items-center gap-3">
                            <FileIcon className="w-5 h-5 text-text-secondary" />
                            <span className="text-sm font-medium">{file.name}</span>
                          </div>
                          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">Ver en Drive</a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Tasks */}
      {activeTab === 'tasks' && (
        <ProjectChecklist projectId={projectId} />
      )}

      {/* Tab: Communications */}
      {activeTab === 'communications' && (
        <CommunicationsTab projectId={projectId} projectTitle={project.title} artistId={project.artistId} />
      )}

      {/* Tab: Payments */}
      {activeTab === 'payments' && (
        <ProjectPaymentsWidget projectId={projectId} initialBudget={project.budget || 0} artistId={project.artistId} />
      )}
    </div>
  );
}
