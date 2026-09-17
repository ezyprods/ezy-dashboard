'use client';

import React from 'react';
import {
  Download, HardDrive, Share2, Link as LinkIcon, Edit3, ArrowRightLeft, Trash2, Star, Timer, Scissors, Eye,
  FolderOpen, Play, Pause, X, Mail, RotateCcw, UploadCloud, FolderPlus, CopyPlus, Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RealtimeCountdown } from '@/components/ui/RealtimeCountdown';
import { useExplorer, VIEW_LABEL } from './useExplorerController';
import {
  bpmTone, formatBytes, formatDuration, formatLongDate, KIND_LABEL, KindIcon, kindStyle,
} from './fileKinds';
import { Thumbnail } from './ItemsView';
import type { DriveItem, FileKind } from './types';

function Action({ icon: Icon, label, onClick, danger, active }: { icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 min-h-[62px] rounded-xl border text-[11px] font-medium transition-colors px-1 text-center',
        danger ? 'border-error/25 text-error hover:bg-error/10' : active ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border/60 text-text-secondary hover:text-text-primary hover:bg-surface',
      )}
    >
      <Icon className={cn('w-[18px] h-[18px]', active && 'fill-current/20')} />
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-b-0">
      <span className="text-xs text-text-secondary shrink-0">{label}</span>
      <span className="text-xs text-text-primary text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function SingleItemDetails({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  const inTrash = ex.view === 'trash';
  const playing = ex.currentTrackId === item.id && ex.isPlaying;
  const location = ex.locationOf(item);

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="relative rounded-2xl overflow-hidden border border-border/60 aspect-[4/3] bg-surface">
        {item.isFolder ? (
          <button type="button" onClick={() => ex.open(item)} className={cn('w-full h-full flex items-center justify-center', kindStyle('folder').bg)}>
            <KindIcon item={item} className="w-20 h-20" />
          </button>
        ) : item.kind === 'audio' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-violet-500/25 via-accent/10 to-transparent">
            <button
              type="button"
              onClick={() => ex.play(item)}
              disabled={inTrash}
              className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/30 hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
              aria-label={playing ? 'Pausar' : 'Reproducir'}
            >
              {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current translate-x-0.5" />}
            </button>
            {(item.bpm || item.musicalKey) && (
              <div className="flex gap-1.5">
                {item.bpm && <span className={cn('font-mono text-[11px] font-bold px-2 py-0.5 rounded border', bpmTone(item.bpm))}>{item.bpm} BPM</span>}
                {item.musicalKey && <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">{item.musicalKey}</span>}
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => ex.preview(item)} className="w-full h-full group">
            <Thumbnail item={item} size={640} className="w-full h-full group-hover:scale-[1.02] transition-transform" iconClassName="w-16 h-16" />
          </button>
        )}
      </div>

      {/* Name + star */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary break-words leading-snug">{item.name}</h3>
          <p className="text-xs text-text-secondary mt-0.5">{KIND_LABEL[item.kind]}{item.extension && !item.isFolder ? ` · .${item.extension}` : ''}</p>
        </div>
        {!inTrash && (
          <button
            type="button"
            onClick={() => ex.toggleStar([item])}
            className={cn('w-9 h-9 flex items-center justify-center rounded-xl shrink-0 transition-colors', item.starred ? 'text-amber-400 bg-amber-400/10' : 'text-text-secondary hover:bg-surface')}
            aria-label={item.starred ? 'Quitar de destacados' : 'Añadir a destacados'}
            title={item.starred ? 'Quitar de destacados' : 'Añadir a destacados'}
          >
            <Star className={cn('w-[18px] h-[18px]', item.starred && 'fill-current')} />
          </button>
        )}
      </div>

      {item.expiresAt && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-warning flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Se eliminará</span>
            <RealtimeCountdown expiresAt={item.expiresAt} />
          </div>
          <p className="text-[11px] text-text-secondary">{formatLongDate(item.expiresAt)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => ex.cancelSchedule([item])} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium hover:bg-surface flex items-center justify-center gap-1.5">
              <Undo2 className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button type="button" onClick={() => ex.setDeleteDialog([item])} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium hover:bg-surface">
              Cambiar
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {inTrash ? (
        <div className="grid grid-cols-2 gap-2">
          <Action icon={RotateCcw} label="Restaurar" onClick={() => ex.restoreItems([item])} />
          <Action icon={Trash2} label="Eliminar para siempre" danger onClick={() => ex.deleteForever([item])} />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {item.isFolder
            ? <Action icon={FolderOpen} label="Abrir" onClick={() => ex.open(item)} />
            : item.kind === 'audio'
              ? <Action icon={Scissors} label="Mini-DAW" onClick={() => ex.setMiniDawItem(item)} />
              : <Action icon={Eye} label="Ver" onClick={() => ex.preview(item)} />}
          <Action icon={Download} label="Descargar" onClick={() => ex.download([item])} />
          <Action icon={Share2} label="Compartir" onClick={() => ex.setShareItem(item)} />
          <Action icon={LinkIcon} label="Enlace" onClick={() => ex.copyLinks([item])} />
          <Action icon={Edit3} label="Renombrar" onClick={() => { ex.setDetailsSheetId(null); ex.startRename(item); }} />
          <Action icon={ArrowRightLeft} label="Mover" onClick={() => ex.setMoveDialog({ items: [item], mode: 'move' })} />
          <Action icon={HardDrive} label="Drive" onClick={() => ex.openInDrive(item)} />
          {item.isFolder
            ? <Action icon={Trash2} label="Papelera" danger onClick={() => ex.trashItems([item])} />
            : <Action icon={Timer} label="Autoborrar" active={!!item.expiresAt} onClick={() => ex.setDeleteDialog([item])} />}
        </div>
      )}
      {!inTrash && ex.artistEmail && (
        <button type="button" onClick={() => ex.shareWithArtist([item])} className="w-full h-10 rounded-xl border border-border/60 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface flex items-center justify-center gap-2">
          <Mail className="w-4 h-4" /> Compartir con el artista
        </button>
      )}

      {/* Metadata */}
      <div className="rounded-xl border border-border/60 px-3">
        {!item.isFolder && <Row label="Tamaño">{formatBytes(item.size)}</Row>}
        {item.durationMs ? <Row label="Duración">{formatDuration(item.durationMs)}</Row> : null}
        {item.width && item.height ? <Row label="Dimensiones">{`${item.width} × ${item.height}`}</Row> : null}
        {item.bpm ? <Row label="Tempo">{`${item.bpm} BPM`}</Row> : null}
        {item.musicalKey ? <Row label="Tonalidad">{item.musicalKey}</Row> : null}
        {location ? (
          <Row label="Ubicación">
            {ex.view !== 'folder' || ex.query ? (
              <button type="button" onClick={() => ex.revealInFolder(item)} className="text-accent hover:underline">{location}</button>
            ) : location}
          </Row>
        ) : null}
        <Row label="Modificado">{formatLongDate(item.modifiedTime)}</Row>
        {item.lastModifiedBy ? <Row label="Por">{item.lastModifiedBy}</Row> : null}
        <Row label="Creado">{formatLongDate(item.createdTime)}</Row>
        {item.trashedTime ? <Row label="Eliminado">{formatLongDate(item.trashedTime)}</Row> : null}
        <Row label="Acceso">{item.shared ? 'Compartido' : 'Privado'}</Row>
      </div>
    </div>
  );
}

function MultiDetails({ items }: { items: DriveItem[] }) {
  const ex = useExplorer();
  const files = items.filter(i => !i.isFolder);
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  const byKind = items.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] || 0) + 1 }), {});
  const inTrash = ex.view === 'trash';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-accent/5 p-5 text-center">
        <p className="text-3xl font-bold text-text-primary">{items.length}</p>
        <p className="text-xs text-text-secondary mt-1">elementos seleccionados{total ? ` · ${formatBytes(total)}` : ''}</p>
        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {Object.entries(byKind).map(([kind, n]) => (
            <span key={kind} className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-border/60 text-text-secondary">
              {n} {KIND_LABEL[kind as FileKind].toLowerCase()}
            </span>
          ))}
        </div>
      </div>
      {inTrash ? (
        <div className="grid grid-cols-2 gap-2">
          <Action icon={RotateCcw} label="Restaurar" onClick={() => ex.restoreItems(items)} />
          <Action icon={Trash2} label="Eliminar para siempre" danger onClick={() => ex.deleteForever(items)} />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Action icon={Download} label="Descargar" onClick={() => ex.download(items)} />
          <Action icon={ArrowRightLeft} label="Mover" onClick={() => ex.setMoveDialog({ items, mode: 'move' })} />
          <Action icon={Star} label={items.every(i => i.starred) ? 'Quitar' : 'Destacar'} onClick={() => ex.toggleStar(items)} />
          <Action icon={LinkIcon} label="Enlaces" onClick={() => ex.copyLinks(items)} />
          {files.length === items.length && <Action icon={CopyPlus} label="Duplicar" onClick={() => ex.performCopy(items)} />}
          {files.length > 0 && <Action icon={Timer} label="Autoborrar" onClick={() => ex.setDeleteDialog(files)} />}
          {ex.artistEmail && <Action icon={Mail} label="Al artista" onClick={() => ex.shareWithArtist(items)} />}
          <Action icon={Trash2} label="Papelera" danger onClick={() => ex.trashItems(items)} />
        </div>
      )}
      <button type="button" onClick={ex.clearSelection} className="w-full h-9 rounded-xl text-xs text-text-secondary hover:text-text-primary hover:bg-surface">
        Deseleccionar todo
      </button>
    </div>
  );
}

function FolderSummary() {
  const ex = useExplorer();
  const items = ex.visibleItems;
  const files = items.filter(i => !i.isFolder);
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  const kinds = files.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] || 0) + 1 }), {});
  const title = ex.view === 'folder' ? ex.currentFolderName : VIEW_LABEL[ex.view];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 p-5 flex flex-col items-center text-center bg-surface/50">
        <KindIcon item={{ kind: 'folder', extension: '' }} className="w-14 h-14" />
        <h3 className="text-sm font-semibold text-text-primary mt-2 break-words">{title}</h3>
        <p className="text-xs text-text-secondary mt-1">
          {items.length - files.length} carpetas · {files.length} archivos{total ? ` · ${formatBytes(total)}` : ''}
        </p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1.5">
          {Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kind, n]) => (
            <div key={kind} className="flex items-center gap-2 text-xs">
              <KindIcon item={{ kind: kind as FileKind, extension: '' }} className="w-4 h-4" />
              <span className="flex-1 text-text-secondary">{KIND_LABEL[kind as FileKind]}</span>
              <div className="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
                <div className="h-full bg-accent/70 rounded-full" style={{ width: `${(n / files.length) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums text-text-primary">{n}</span>
            </div>
          ))}
        </div>
      )}
      {ex.view === 'folder' && (
        <div className="grid grid-cols-2 gap-2">
          <Action icon={UploadCloud} label="Subir archivos" onClick={() => ex.pickFiles()} />
          <Action icon={FolderPlus} label="Nueva carpeta" onClick={() => ex.createFolder()} />
        </div>
      )}
      <p className="text-[11px] text-text-secondary text-center leading-relaxed px-2">
        Selecciona un elemento para ver sus detalles. {ex.canHover ? 'Clic derecho para todas las acciones.' : 'Mantén pulsado para ver todas las acciones.'}
      </p>
    </div>
  );
}

export function DetailsContent() {
  const ex = useExplorer();
  const sheetItem = ex.detailsSheetId && ex.detailsSheetId !== '__folder__'
    ? ex.visibleItems.find(i => i.id === ex.detailsSheetId)
    : null;
  if (sheetItem) return <SingleItemDetails item={sheetItem} />;
  if (ex.detailsSheetId === '__folder__') return <FolderSummary />;
  if (ex.selectedItems.length === 1) return <SingleItemDetails item={ex.selectedItems[0]} />;
  if (ex.selectedItems.length > 1) return <MultiDetails items={ex.selectedItems} />;
  return <FolderSummary />;
}

export function InspectorPanel() {
  const ex = useExplorer();
  return (
    <aside className="w-[320px] shrink-0 border-l border-border/60 bg-surface-elevated" aria-label="Detalles">
      <div className="sticky top-[var(--x-top)] h-[var(--x-panel-h)] flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border/60 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Detalles</span>
          <button type="button" onClick={() => ex.setInspectorVisible(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary" aria-label="Cerrar detalles">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
          <DetailsContent />
        </div>
      </div>
    </aside>
  );
}
