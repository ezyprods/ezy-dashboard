'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, AudioWaveform, Music, Send, UploadCloud, UserCheck } from 'lucide-react';
import { FileExplorer } from '@/components/explorer/FileExplorer';
import { loadIndex, useIndex } from '@/components/explorer/driveStore';
import { loadLibrary, useLibrary } from '@/components/library/libraryStore';
import { useDropContext, useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';

function Stat({ icon: Icon, value, label, onClick }: { icon: React.ElementType; value: string | number; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl bg-surface border border-border px-3 py-2.5 text-left hover:border-accent/40 transition-colors min-w-0">
      <p className="text-lg font-black text-text-primary leading-none flex items-center gap-1.5"><Icon className="w-4 h-4 text-accent shrink-0" />{value}</p>
      <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1 truncate">{label}</p>
    </button>
  );
}

/** Beat library: free folders (years, styles, packs…), sends to artists and one-click assignments. */
export default function PersonalProjectsPage() {
  const library = useLibrary();
  const searchParams = useSearchParams();
  const { openSmartUpload } = useGlobalDragDrop();
  const index = useIndex(library.rootId || '__none__', !!library.rootId);
  const folderId = searchParams.get('folderId');

  const audioCount = useMemo(() => index.items.filter(i => i.kind === 'audio').length, [index.items]);

  useDropContext(library.rootId ? {
    mode: 'library',
    label: 'Subir a Proyectos personales',
    hint: 'Suéltalo sobre una carpeta para elegir el destino exacto. Las carpetas mantienen su estructura.',
    folderId: folderId || undefined,
    onFinished: () => loadIndex(library.rootId, { force: true }),
  } : null);

  const goTo = (view: 'sends' | 'assigned' | 'audio') => {
    const url = new URL(window.location.href);
    url.searchParams.delete('folderId');
    url.searchParams.delete('fileId');
    url.searchParams.set('view', view);
    window.history.pushState(null, '', `${url.pathname}?${url.searchParams.toString()}`);
  };

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 md:p-6">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent/10 blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-accent/15 text-accent border border-accent/20 flex items-center justify-center shrink-0">
              <Music className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">Proyectos personales</h1>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-[360px] shrink-0">
            <Stat icon={AudioWaveform} value={index.status === 'ready' || index.items.length ? audioCount : '…'} label="Beats" onClick={() => goTo('audio')} />
            <Stat icon={Send} value={library.status === 'ready' ? library.sends.length : '…'} label="Envíos" onClick={() => goTo('sends')} />
            <Stat icon={UserCheck} value={library.status === 'ready' ? library.assignments.length : '…'} label="Asignados" onClick={() => goTo('assigned')} />
          </div>
        </div>
        <div className="relative flex items-center gap-2 mt-5">
          <button
            type="button"
            disabled={!library.rootId}
            onClick={() => openSmartUpload({ files: [], targetType: 'library', folderId: folderId || undefined })}
            className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-accent/90 shadow-sm shadow-accent/20 disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" /> Subir beats
          </button>
        </div>
      </section>

      {library.rootId ? (
        <FileExplorer rootId={library.rootId} rootName={library.rootName} scope={{ type: 'library' }} />
      ) : library.status === 'error' ? (
        <div className="rounded-2xl border border-error/20 bg-surface-elevated p-10 text-center">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-sm font-semibold text-text-primary">No se pudo abrir la biblioteca</p>
          <p className="text-xs text-text-secondary mt-1">{library.error}</p>
          <button type="button" onClick={() => loadLibrary({ force: true })} className="mt-4 h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">Reintentar</button>
        </div>
      ) : (
        <div className="h-[480px] rounded-2xl bg-surface-elevated border border-border animate-pulse" />
      )}
    </div>
  );
}
