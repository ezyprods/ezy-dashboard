'use client';

import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Music, 
  Mic, 
  Layers, 
  Users2, 
  Disc3, 
  Sparkles, 
  Loader2, 
  Calendar,
  X,
  SlidersHorizontal,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePersonalProjects } from '@/lib/hooks/usePersonalProjects';
import { PersonalProjectCard } from '@/components/personal-projects/PersonalProjectCard';
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

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | PersonalProjectCategory>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | PersonalProjectStatus>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');

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

  // Filtered list
  const filteredProjects = useMemo(() => {
    return projects.filter(proj => {
      // Category filter
      if (selectedCategory !== 'all' && proj.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && proj.status !== selectedStatus) {
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
  }, [projects, selectedCategory, selectedStatus, selectedYear, selectedMonth, selectedTag, searchQuery]);

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

  const hasActiveFilters = selectedCategory !== 'all' || selectedStatus !== 'all' || selectedYear !== 'all' || selectedMonth !== 'all' || selectedTag !== 'all' || !!searchQuery.trim();

  const resetFilters = () => {
    setSelectedCategory('all');
    setSelectedStatus('all');
    setSelectedYear('all');
    setSelectedMonth('all');
    setSelectedTag('all');
    setSearchQuery('');
  };

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300">
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
            Catálogo de beats, grabaciones, sound kits, colaboraciones y producciones propias
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchProjects()}
            disabled={isLoading}
            className="p-2.5"
            title="Refrescar catálogo"
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
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

      {/* Search & Combinable Filters Bar */}
      <div className="glass p-4 rounded-2xl border border-border/80 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-text-secondary absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, BPM, tonalidad, tags, notas..."
              className="w-full pl-10 bg-surface border-border/70"
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

          {/* Quick Filters */}
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors"
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
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors"
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
              className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors"
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
                className="bg-surface border border-border rounded-xl px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent transition-colors"
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
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid View */}
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
      ) : filteredProjects.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProjects.map((project) => (
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

      {/* Modals */}
      <NewPersonalProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSubmit={createProject}
      />

      <EditPersonalProjectModal
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
        project={editingProject}
        onUpdate={updateProject}
      />

      <CloneToArtistModal
        isOpen={!!cloningProject}
        onClose={() => setCloningProject(null)}
        project={cloningProject}
        onClone={cloneToArtist}
      />
    </div>
  );
}
