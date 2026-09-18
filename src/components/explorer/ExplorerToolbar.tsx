'use client';

import React from 'react';
import {
  ChevronRight, ChevronLeft, Search, X, LayoutGrid, List, UploadCloud, FolderPlus, Plus, ArrowUpDown,
  PanelLeft, PanelRight, MoreHorizontal, RefreshCw, Loader2, Menu, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useExplorer, VIEW_LABEL } from './useExplorerController';
import type { TypeFilter } from './types';

const FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'folder', label: 'Carpetas' },
  { id: 'audio', label: 'Audio' },
  { id: 'image', label: 'Imágenes' },
  { id: 'video', label: 'Vídeo' },
  { id: 'document', label: 'Documentos' },
  { id: 'project', label: 'Proyectos' },
  { id: 'other', label: 'Otros' },
];

const iconBtn = 'items-center justify-center h-10 w-10 md:h-9 md:w-9 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface transition-colors shrink-0 disabled:opacity-40 disabled:pointer-events-none';

function Breadcrumbs() {
  const ex = useExplorer();
  const { showMenu } = useContextMenu();

  if (ex.view !== 'folder') {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" onClick={() => ex.setView('folder')} className="text-sm text-text-secondary hover:text-text-primary truncate">
          {ex.rootName}
        </button>
        <ChevronRight className="w-4 h-4 text-text-secondary/60 shrink-0" />
        <span className="text-sm font-semibold text-text-primary truncate">{VIEW_LABEL[ex.view]}</span>
      </div>
    );
  }

  const crumbs = ex.crumbs;
  // On narrow screens collapse the middle of long paths into "…" (tap it to see the full path)
  const collapsed = crumbs.length > 3;

  const renderCrumb = (crumb: { id: string; name: string }, i: number, extraClass?: string) => {
    const last = i === crumbs.length - 1;
    const drop = !last ? ex.getFolderDropProps(crumb.id) : {};
    return (
      <React.Fragment key={crumb.id}>
        {i > 0 && <ChevronRight className={cn('w-4 h-4 text-text-secondary/50 shrink-0', extraClass)} />}
        <button
          type="button"
          {...drop}
          onClick={() => !last && ex.openFolder(crumb)}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            if (last) ex.showBackgroundMenu(e.clientX, e.clientY);
          }}
          className={cn(
            'px-2 py-1 rounded-lg text-sm truncate max-w-[220px] transition-colors',
            last ? 'font-semibold text-text-primary cursor-default' : 'text-text-secondary hover:text-text-primary hover:bg-surface',
            ex.dropTargetId === crumb.id && 'bg-accent/15 text-accent ring-2 ring-accent',
            extraClass,
          )}
          title={crumb.name}
        >
          {crumb.name}
        </button>
      </React.Fragment>
    );
  };

  return (
    <nav aria-label="Ruta" className="flex items-center min-w-0 overflow-hidden">
      {/* Wide screens: full path */}
      <div className={cn('items-center min-w-0', collapsed ? 'hidden lg:flex' : 'flex')}>
        {crumbs.map((c, i) => renderCrumb(c, i))}
      </div>
      {/* Narrow screens with deep paths: root / … / parent / current */}
      {collapsed && (
        <div className="flex lg:hidden items-center min-w-0">
          {renderCrumb(crumbs[0], 0)}
          <ChevronRight className="w-4 h-4 text-text-secondary/50 shrink-0" />
          <button
            type="button"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              showMenu(rect.left, rect.bottom + 4, [
                { heading: 'Ruta' },
                ...crumbs.slice(0, -1).map(c => ({ label: c.name, icon: 'FolderOpen', action: () => ex.openFolder(c) })),
              ]);
            }}
            className="px-2 py-1 rounded-lg text-sm text-text-secondary hover:bg-surface shrink-0"
            aria-label="Mostrar ruta completa"
          >
            …
          </button>
          {renderCrumb(crumbs[crumbs.length - 2], crumbs.length - 2)}
          {renderCrumb(crumbs[crumbs.length - 1], crumbs.length - 1)}
        </div>
      )}
    </nav>
  );
}

export function ExplorerToolbar() {
  const ex = useExplorer();
  const { showMenu } = useContextMenu();
  const busy = ex.folderEntry.status === 'loading' || ex.index.status === 'loading' || ex.trash.status === 'loading';

  const showNewMenu = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showMenu(rect.right - 210, rect.bottom + 6, [
      { heading: `Nuevo en ${ex.currentFolderName}` },
      { label: 'Subir archivos', icon: 'UploadCloud', action: () => ex.pickFiles() },
      { label: 'Nueva carpeta', icon: 'FolderPlus', action: () => ex.createFolder() },
    ]);
  };

  const showMoreMenu = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    ex.showBackgroundMenu(rect.right - 230, rect.bottom + 6);
  };

  const canGoUp = ex.view !== 'folder' || ex.crumbs.length > 1;
  const customView = ex.view === 'sends' || ex.view === 'assigned';

  return (
    <div className="border-b border-border/60 bg-surface-elevated">
      {/* Row 1: navigation + primary actions */}
      <div className="flex items-center gap-1 px-2 md:px-3 pt-2 md:pt-3 pb-1.5">
        <button
          type="button"
          className={cn(iconBtn, 'inline-flex lg:hidden')}
          onClick={() => ex.setDrawerOpen(true)}
          aria-label="Carpetas y accesos rápidos"
          title="Carpetas"
        >
          <Menu className="w-5 h-5" />
        </button>
        <button
          type="button"
          className={cn(iconBtn, 'hidden lg:inline-flex')}
          onClick={() => ex.setSidebarCollapsed(!ex.sidebarCollapsed)}
          aria-label={ex.sidebarCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
          title={ex.sidebarCollapsed ? 'Mostrar panel lateral' : 'Ocultar panel lateral'}
        >
          <PanelLeft className="w-[18px] h-[18px]" />
        </button>
        <button type="button" className={cn(iconBtn, 'inline-flex')} onClick={ex.goUp} disabled={!canGoUp} aria-label="Subir un nivel" title="Subir un nivel (Retroceso)">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <Breadcrumbs />
        </div>

        {busy && <Loader2 className="hidden sm:block w-4 h-4 animate-spin text-text-secondary shrink-0 mx-1" aria-label="Sincronizando" />}

        {ex.view === 'folder' && (
          <>
            <button
              type="button"
              onClick={() => ex.createFolder()}
              className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-sm font-medium text-text-primary hover:bg-surface transition-colors shrink-0"
            >
              <FolderPlus className="w-4 h-4" /> Nueva carpeta
            </button>
            <button
              type="button"
              onClick={() => ex.pickFiles()}
              className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 shadow-sm shadow-accent/20 transition-colors shrink-0 ml-1"
            >
              <UploadCloud className="w-4 h-4" /> Subir
            </button>
            <button
              type="button"
              onClick={showNewMenu}
              className="lg:hidden inline-flex items-center justify-center gap-1.5 h-10 md:h-9 px-3 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 shrink-0"
              aria-label="Nuevo"
            >
              <Plus className="w-5 h-5" /> <span className="hidden sm:inline">Nuevo</span>
            </button>
          </>
        )}
        {ex.view === 'trash' && ex.trash.items.length > 0 && (
          <button
            type="button"
            onClick={() => ex.deleteForever(ex.trash.items)}
            className="inline-flex items-center h-9 px-3 rounded-xl border border-error/40 text-error text-sm font-medium hover:bg-error/10 shrink-0"
          >
            Vaciar
          </button>
        )}
        <button type="button" className={cn(iconBtn, 'inline-flex')} onClick={showMoreMenu} aria-label="Más opciones" title="Más opciones">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Row 2: search, filters, sort, view */}
      <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 pb-2.5">
        <div className="relative flex-1 min-w-0 md:flex-none md:w-64 lg:w-80">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={ex.searchInputRef}
            type="search"
            value={ex.query}
            onChange={e => ex.setQuery(e.target.value)}
            placeholder={ex.view === 'folder' ? `Buscar en ${ex.rootName}…` : `Buscar en ${VIEW_LABEL[ex.view].toLowerCase()}…`}
            className="w-full h-10 md:h-9 bg-surface border border-border/70 rounded-xl pl-9 pr-9 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Buscar archivos"
            enterKeyHint="search"
          />
          {ex.query ? (
            <button type="button" onClick={() => { ex.setQuery(''); ex.searchInputRef.current?.focus(); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary" aria-label="Borrar búsqueda">
              <X className="w-4 h-4" />
            </button>
          ) : ex.canHover ? (
            <kbd className="hidden md:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary/70 border border-border rounded px-1.5 leading-4">/</kbd>
          ) : null}
        </div>

        <div className={cn('hidden flex-1 min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-hide', !customView && 'md:flex')} data-no-swipe>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => ex.setTypeFilter(f.id)}
              className={cn(
                'h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors shrink-0',
                ex.typeFilter === f.id
                  ? 'bg-accent/15 border-accent/60 text-accent'
                  : 'border-border/70 text-text-secondary hover:text-text-primary hover:border-accent/40',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={cn('items-center gap-0.5 shrink-0 md:ml-auto', customView ? 'hidden' : 'flex')}>
          <button
            type="button"
            className={cn(iconBtn, 'inline-flex md:hidden relative', ex.typeFilter !== 'all' && 'text-accent bg-accent/10')}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              showMenu(rect.right - 210, rect.bottom + 6, [
                { heading: 'Mostrar' },
                ...FILTERS.map(f => ({ label: f.label, checked: ex.typeFilter === f.id, action: () => ex.setTypeFilter(f.id) })),
              ]);
            }}
            aria-label="Filtrar por tipo"
            title="Filtrar por tipo"
          >
            <Filter className="w-[18px] h-[18px]" />
            {ex.typeFilter !== 'all' && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />}
          </button>
          <button
            type="button"
            className={cn(iconBtn, 'inline-flex')}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              ex.showSortMenu(rect.right - 210, rect.bottom + 6);
            }}
            disabled={ex.view === 'recent' || ex.view === 'scheduled' || ex.view === 'trash'}
            aria-label="Ordenar"
            title="Ordenar"
          >
            <ArrowUpDown className="w-[18px] h-[18px]" />
          </button>
          <div className="flex items-center bg-surface border border-border/70 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => ex.setViewMode('list')}
              className={cn('h-9 w-9 md:h-8 md:w-8 flex items-center justify-center rounded-lg transition-colors', ex.viewMode === 'list' ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
              aria-label="Vista de lista"
              aria-pressed={ex.viewMode === 'list'}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => ex.setViewMode('grid')}
              className={cn('h-9 w-9 md:h-8 md:w-8 flex items-center justify-center rounded-lg transition-colors', ex.viewMode === 'grid' ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
              aria-label="Vista de cuadrícula"
              aria-pressed={ex.viewMode === 'grid'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button type="button" className={cn(iconBtn, 'hidden md:inline-flex')} onClick={ex.refresh} aria-label="Actualizar" title="Actualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={cn(iconBtn, 'hidden xl:inline-flex', ex.inspectorVisible && 'text-accent')}
            onClick={() => ex.setInspectorVisible(!ex.inspectorVisible)}
            aria-label={ex.inspectorVisible ? 'Ocultar detalles' : 'Mostrar detalles'}
            title="Panel de detalles"
          >
            <PanelRight className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
