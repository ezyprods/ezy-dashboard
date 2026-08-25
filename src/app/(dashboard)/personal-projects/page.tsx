'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Music, 
  Mic, 
  Layers, 
  Users2, 
  Disc3, 
  Loader2, 
  X, 
  RefreshCw,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  Volume2,
  VolumeX,
  Sparkles,
  ChevronDown,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePersonalProjects } from '@/lib/hooks/usePersonalProjects';
import { PersonalProjectCard } from '@/components/personal-projects/PersonalProjectCard';
import { PersonalProjectListItem } from '@/components/personal-projects/PersonalProjectListItem';
import { NewPersonalProjectModal } from '@/components/personal-projects/NewPersonalProjectModal';
import { EditPersonalProjectModal } from '@/components/personal-projects/EditPersonalProjectModal';
import { CloneToArtistModal } from '@/components/personal-projects/CloneToArtistModal';
import { 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_STATUS_CONFIG 
} from '@/lib/constants';
import type { 
  PersonalProject, 
  PersonalProjectCategory, 
  PersonalProjectStatus 
} from '@/types';
import { customAlert, customConfirm } from '@/lib/dialog';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'grid';
type AudioFilter = 'all' | 'with_audio' | 'without_audio';
type SortOption = 'recent' | 'oldest' | 'bpm_desc' | 'bpm_asc' | 'title_asc' | 'title_desc';

const PAGE_SIZE = 36;

const CATEGORY_ITEMS: { key: 'all' | PersonalProjectCategory; label: string; icon: any }[] = [
  { key: 'all', label: 'Todos', icon: Music },
  { key: 'beat', label: 'Beats', icon: Music },
  { key: 'grabacion', label: 'Grabaciones', icon: Mic },
  { key: 'loop_pack', label: 'Sound Kits', icon: Layers },
  { key: 'colaboracion', label: 'Colaboraciones', icon: Users2 },
  { key: 'mashup', label: 'Mashups', icon: Disc3 },
];

const MONTH_OPTIONS = [
  { value: 'all', label: 'Todos los meses' },
  { value: '1', label: 'Enero' },
  { value: '2', label: 'Febrero' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Mayo' },
  { value: '6', label: 'Junio' },
  { value: '7', label: 'Julio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Más recientes primero' },
  { value: 'oldest', label: 'Más antiguos primero' },
  { value: 'bpm_desc', label: 'BPM: Mayor a menor' },
  { value: 'bpm_asc', label: 'BPM: Menor a mayor' },
  { value: 'title_asc', label: 'Título: A → Z' },
  { value: 'title_desc', label: 'Título: Z → A' },
];

export default function PersonalProjectsPage() {
  const { 
    projects, 
    isLoading, 
    error, 
    fetchProjects, 
    createProject, 
    updateProject, 
    deleteProject, 
    cloneToArtist 
  } = usePersonalProjects();

  // View Mode: Persistent in localStorage (default to 'list' for high density)
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ezy_personal_projects_view_mode') as ViewMode | null;
      if (saved === 'grid' || saved === 'list') {
        setViewMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('ezy_personal_projects_view_mode', mode);
    } catch {
      // ignore
    }
  };

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | PersonalProjectCategory>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | PersonalProjectStatus>('all');
  const [audioFilter, setAudioFilter] = useState<AudioFilter>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Progressive rendering / pagination
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Modals
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<PersonalProject | null>(null);
  const [cloningProject, setCloningProject] = useState<PersonalProject | null>(null);

  // Derive unique years & tags
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(projects.map(p => p.year).filter(Boolean))) as number[];
    return years.sort((a, b) => b - a);
  }, [projects]);

  const availableTags = useMemo(() => {
    const tags = Array.from(new Set(projects.flatMap(p => p.tags || []).filter(Boolean)));
    return tags.sort();
  }, [projects]);

  // Reset pagination when any filter or sort changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedCategory, selectedStatus, audioFilter, selectedYear, selectedMonth, selectedTag, sortBy]);

  // Filtered & Sorted list
  const filteredAndSortedProjects = useMemo(() => {
    const filtered = projects.filter(proj => {
      // Category filter
      if (selectedCategory !== 'all' && proj.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && proj.status !== selectedStatus) {
        return false;
      }

      // Audio filter (has bounce or pack tracks)
      const hasAudio = Boolean(proj.latestBounceFileId || (proj.packTracks && proj.packTracks.length > 0));
      if (audioFilter === 'with_audio' && !hasAudio) {
        return false;
      }
      if (audioFilter === 'without_audio' && hasAudio) {
        return false;
      }

      // Year filter
      if (selectedYear !== 'all' && proj.year !== parseInt(selectedYear, 10)) {
        return false;
      }

      // Month filter
      if (selectedMonth !== 'all' && proj.month !== parseInt(selectedMonth, 10)) {
        return false;
      }

      // Tag filter
      if (selectedTag !== 'all' && !proj.tags?.includes(selectedTag)) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = proj.title.toLowerCase().includes(q);
        const matchTags = proj.tags?.some(t => t.toLowerCase().includes(q));
        const matchNotes = proj.notes?.toLowerCase().includes(q);
        const matchCollabs = proj.collaborators?.some(c => c.toLowerCase().includes(q));
        const matchKey = proj.key?.toLowerCase().includes(q);
        const matchBpm = proj.bpm ? String(proj.bpm).includes(q) : false;

        if (!matchTitle && !matchTags && !matchNotes && !matchCollabs && !matchKey && !matchBpm) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'recent') {
        const yearDiff = (b.year || 0) - (a.year || 0);
        if (yearDiff !== 0) return yearDiff;
        const monthDiff = (b.month || 0) - (a.month || 0);
        if (monthDiff !== 0) return monthDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }

      if (sortBy === 'oldest') {
        const yearDiff = (a.year || 9999) - (b.year || 9999);
        if (yearDiff !== 0) return yearDiff;
        const monthDiff = (a.month || 99) - (b.month || 99);
        if (monthDiff !== 0) return monthDiff;
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }

      if (sortBy === 'bpm_desc') {
        return (b.bpm || 0) - (a.bpm || 0);
      }

      if (sortBy === 'bpm_asc') {
        return (a.bpm || 999) - (b.bpm || 999);
      }

      if (sortBy === 'title_asc') {
        return a.title.localeCompare(b.title);
      }

      if (sortBy === 'title_desc') {
        return b.title.localeCompare(a.title);
      }

      return 0;
    });
  }, [projects, selectedCategory, selectedStatus, audioFilter, selectedYear, selectedMonth, selectedTag, searchQuery, sortBy]);

  // Sliced items for progressive render
  const displayedProjects = useMemo(() => {
    return filteredAndSortedProjects.slice(0, visibleCount);
  }, [filteredAndSortedProjects, visibleCount]);

  const hasMore = visibleCount < filteredAndSortedProjects.length;

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  };

  const handleDelete = async (proj: PersonalProject) => {
    const confirmed = await customConfirm(
      `¿Estás seguro de eliminar el proyecto "${proj.title}" de tu Google Drive?\n\nEsta acción borrará su carpeta y archivos asociados.`
    );
    if (!confirmed) return;

    try {
      await deleteProject(proj.id);
      customAlert('Proyecto eliminado correctamente.');
    } catch (err: any) {
      console.error(err);
      customAlert(err.message || 'Error al eliminar el proyecto.');
    }
  };

  const hasActiveFilters = selectedCategory !== 'all' || 
    selectedStatus !== 'all' || 
    audioFilter !== 'all' || 
    selectedYear !== 'all' || 
    selectedMonth !== 'all' || 
    selectedTag !== 'all' || 
    !!searchQuery.trim();

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedStatus('all');
    setAudioFilter('all');
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedTag('all');
    setSearchQuery('');
  };

  return (
    <div className="flex-1 w-full max-w-[1650px] mx-auto space-y-5 animate-in fade-in duration-300">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-accent/15 text-accent border border-accent/20">
              <Music className="w-6 h-6" />
            </span>
            Proyectos Personales
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Catálogo de beats, grabaciones, sound kits, colaboraciones y producciones propias ({projects.length} totales)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher (List / Grid) */}
          <div className="flex items-center bg-surface border border-border/80 rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                viewMode === 'list' 
                  ? "bg-accent text-white shadow-sm" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
              )}
              title="Vista de Lista compacta (DAW / Tabla)"
            >
              <LayoutList className="w-4 h-4" />
              <span className="hidden md:inline pr-1">Lista</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('grid')}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                viewMode === 'grid' 
                  ? "bg-accent text-white shadow-sm" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
              )}
              title="Vista de Tarjetas / Grid"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden md:inline pr-1">Grid</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchProjects()}
            disabled={isLoading}
            className="p-2.5"
            title="Refrescar catálogo desde Drive"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            onClick={() => setIsNewModalOpen(true)}
            className="bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/25"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo Proyecto
          </Button>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {CATEGORY_ITEMS.map(item => {
          const isSelected = selectedCategory === item.key;
          const count = item.key === 'all' 
            ? projects.length 
            : projects.filter(p => p.category === item.key).length;
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedCategory(item.key)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-accent text-white border-accent shadow-md shadow-accent/20'
                  : 'bg-surface/80 hover:bg-surface border-border/70 text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-surface-elevated text-text-secondary'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Audio Filter & Sorting Bar */}
      <div className="glass p-3.5 rounded-2xl border border-border/80 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, BPM, tonalidad, tags, notas..."
              className="w-full pl-10 bg-surface border-border/70 text-xs sm:text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filters, Audio & Sorting Controls */}
          <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 custom-scrollbar">
            {/* Quick Audio Filter */}
            <div className="flex items-center bg-surface border border-border rounded-xl p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setAudioFilter('all')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  audioFilter === 'all' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                )}
                title="Todos los proyectos"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setAudioFilter('with_audio')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors",
                  audioFilter === 'with_audio' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                )}
                title="Solo proyectos con audio / bounce exportado"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Con Audio</span>
              </button>
              <button
                type="button"
                onClick={() => setAudioFilter('without_audio')}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors",
                  audioFilter === 'without_audio' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                )}
                title="Solo bocetos / .flp sin bounce"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sin Audio</span>
              </button>
            </div>

            {/* Sorting Dropdown */}
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors"
                title="Criterio de ordenación"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              <option value="all">Todos los estados</option>
              {(Object.entries(PERSONAL_PROJECT_STATUS_CONFIG) as [PersonalProjectStatus, any][]).map(([sKey, sConf]) => (
                <option key={sKey} value={sKey}>
                  {sConf.icon} {sConf.label}
                </option>
              ))}
            </select>

            {/* Year Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              <option value="all">Todos los años</option>
              {availableYears.map(yr => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>

            {/* Month Filter */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              {MONTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Tag Filter */}
            {availableTags.length > 0 && (
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors shrink-0"
              >
                <option value="all">Todas las etiquetas</option>
                {availableTags.map(tag => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-xs text-text-secondary hover:text-text-primary shrink-0"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Limpiar Filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="glass p-16 rounded-2xl border border-border flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-xs font-medium text-text-secondary">Cargando proyectos personales desde Drive...</p>
        </div>
      ) : error ? (
        <div className="glass p-8 rounded-2xl border border-danger/40 bg-danger/5 text-center space-y-3">
          <p className="text-sm font-semibold text-danger">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchProjects()}>
            Reintentar
          </Button>
        </div>
      ) : filteredAndSortedProjects.length === 0 ? (
        <div className="glass p-16 rounded-2xl border border-dashed border-border/80 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center border border-border/50 shadow-inner">
            <Music className="w-8 h-8 text-text-secondary/50" />
          </div>

          <div>
            <h3 className="font-bold text-base text-text-primary">
              {projects.length === 0 ? 'No hay proyectos personales creados' : 'No se encontraron proyectos con estos filtros'}
            </h3>
            <p className="text-xs text-text-secondary mt-1 max-w-sm">
              {projects.length === 0
                ? 'Empieza creando tu primer beat, grabación o sound kit para organizarlo en Drive.'
                : 'Intenta ajustar la búsqueda o limpiar los filtros seleccionados.'}
            </p>
          </div>

          {projects.length === 0 ? (
            <Button
              onClick={() => setIsNewModalOpen(true)}
              className="bg-accent hover:bg-accent-light text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Crear Primer Proyecto
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Limpiar Filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* VIEW: LIST MODE (Table Layout) */}
          {viewMode === 'list' && (
            <div className="space-y-1.5">
              {/* Table Column Headers (Sortable on click) */}
              <div className="hidden sm:flex items-center justify-between gap-3 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary border-b border-border/60">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-8 text-center shrink-0">Play</span>
                  <button
                    type="button"
                    onClick={() => setSortBy(sortBy === 'title_asc' ? 'title_desc' : 'title_asc')}
                    className="flex items-center gap-1 hover:text-text-primary transition-colors text-left"
                  >
                    <span>Título del Proyecto</span>
                    {sortBy === 'title_asc' && <ArrowUp className="w-3 h-3 text-accent" />}
                    {sortBy === 'title_desc' && <ArrowDown className="w-3 h-3 text-accent" />}
                  </button>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="hidden sm:inline w-24">Categoría</span>
                  <button
                    type="button"
                    onClick={() => setSortBy(sortBy === 'bpm_desc' ? 'bpm_asc' : 'bpm_desc')}
                    className="flex items-center gap-1 hover:text-text-primary transition-colors w-24"
                  >
                    <span>BPM / Key</span>
                    {sortBy === 'bpm_desc' && <ArrowDown className="w-3 h-3 text-accent" />}
                    {sortBy === 'bpm_asc' && <ArrowUp className="w-3 h-3 text-accent" />}
                  </button>
                  <span className="hidden sm:inline w-28">Estado</span>
                  <button
                    type="button"
                    onClick={() => setSortBy(sortBy === 'recent' ? 'oldest' : 'recent')}
                    className="hidden md:flex items-center justify-end gap-1 hover:text-text-primary transition-colors w-20 text-right"
                  >
                    <span>Fecha</span>
                    {sortBy === 'recent' && <ArrowDown className="w-3 h-3 text-accent" />}
                    {sortBy === 'oldest' && <ArrowUp className="w-3 h-3 text-accent" />}
                  </button>
                  <span className="w-6 text-right">···</span>
                </div>
              </div>

              {/* List Items */}
              <div className="space-y-1.5">
                {displayedProjects.map((project) => (
                  <PersonalProjectListItem
                    key={project.id}
                    project={project}
                    onEdit={(p) => setEditingProject(p)}
                    onDelete={handleDelete}
                    onCloneToArtist={(p) => setCloningProject(p)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* VIEW: GRID MODE (Compact Cards) */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3.5">
              {displayedProjects.map((project) => (
                <PersonalProjectCard
                  key={project.id}
                  project={project}
                  onEdit={(p) => setEditingProject(p)}
                  onDelete={handleDelete}
                  onCloneToArtist={(p) => setCloningProject(p)}
                />
              ))}
            </div>
          )}

          {/* Progressive Loading / Load More Bar */}
          {hasMore && (
            <div className="pt-4 flex flex-col items-center justify-center space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                className="px-6 py-2 bg-surface hover:bg-surface-elevated text-xs font-semibold shadow-sm"
              >
                Cargar más proyectos ({filteredAndSortedProjects.length - visibleCount} restantes)
              </Button>
              <p className="text-[11px] text-text-secondary">
                Mostrando {displayedProjects.length} de {filteredAndSortedProjects.length} proyectos
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <NewPersonalProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={async (data) => {
          await createProject(data);
        }}
      />

      <EditPersonalProjectModal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        project={editingProject}
        onUpdate={async (id, updates) => {
          await updateProject(id, updates);
        }}
      />

      <CloneToArtistModal
        isOpen={!!cloningProject}
        onClose={() => setCloningProject(null)}
        project={cloningProject}
        onClone={async (id, artistId, customTitle, projectType) => {
          await cloneToArtist(id, artistId, customTitle, projectType);
        }}
      />
    </div>
  );
}
