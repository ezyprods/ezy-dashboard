'use client';

import React, { useState } from 'react';
import { 
  Music, 
  Mic, 
  Layers, 
  Users2, 
  Disc3, 
  Activity, 
  Sparkles, 
  Calendar, 
  Tag, 
  Loader2, 
  Plus 
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { toast } from 'sonner';
import { 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_STATUS_CONFIG 
} from '@/lib/constants';
import type { 
  CreatePersonalProjectInput, 
  PersonalProjectCategory, 
  PersonalProjectStatus 
} from '@/types';
import { parseAudioFilename, formatMusicalKey, getShortKey } from '@/lib/utils/audio';

interface NewPersonalProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePersonalProjectInput) => Promise<any>;
}

export function NewPersonalProjectModal({
  isOpen,
  onClose,
  onSubmit,
}: NewPersonalProjectModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PersonalProjectCategory>('beat');
  const [status, setStatus] = useState<PersonalProjectStatus>('idea');
  const [bpm, setBpm] = useState<string>('');
  const [key, setKey] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [tagsInput, setTagsInput] = useState('');
  const [collaboratorsInput, setCollaboratorsInput] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-detection of BPM and Key from title as user types
  const handleTitleChange = (val: string) => {
    setTitle(val);

    const parsed = parseAudioFilename(val);
    if (parsed.bpm) {
      setBpm(parsed.bpm.toString());
    }
    if (parsed.shortKey) {
      setKey(parsed.shortKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Por favor, introduce el nombre del proyecto.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const collaborators = collaboratorsInput
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      await onSubmit({
        title: title.trim(),
        category,
        status,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        key: key.trim() || undefined,
        year: Number(year) || new Date().getFullYear(),
        month: Number(month) || (new Date().getMonth() + 1),
        tags,
        collaborators,
        notes: notes.trim() || undefined,
      });

      // Reset form
      setTitle('');
      setCategory('beat');
      setStatus('idea');
      setBpm('');
      setKey('');
      setTagsInput('');
      setCollaboratorsInput('');
      setNotes('');
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al crear el proyecto personal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Proyecto Personal"
      description="Crea un beat, grabación, sound kit, colaboración o mashup en Google Drive"
      className="md:max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category selection */}
        <div>
          <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            Categoría del Proyecto
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.entries(PERSONAL_PROJECT_CATEGORIES) as [PersonalProjectCategory, any][]).map(([catKey, catConfig]) => {
              const isSelected = category === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setCategory(catKey)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all text-left ${
                    isSelected
                      ? 'border-accent shadow-sm ring-1 ring-accent'
                      : 'border-border/70 hover:border-border bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                  style={{
                    backgroundColor: isSelected ? catConfig.bgColor : undefined,
                    color: isSelected ? catConfig.color : undefined,
                  }}
                >
                  <span className="shrink-0">{catConfig.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <Label htmlFor="proj-title" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Nombre / Título *
          </Label>
          <Input
            id="proj-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Ej: 01 - G#m 130BPM - Midnight Dream @ezyprods"
            required
            className="w-full"
            autoFocus
          />
          {(() => {
            const parsed = parseAudioFilename(title);
            if (title.trim() && parsed.cleanTitle && parsed.cleanTitle !== title.trim()) {
              return (
                <div className="flex items-center justify-between mt-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-xs text-text-secondary animate-in fade-in">
                  <span className="truncate">💡 Título limpio: <strong className="text-text-primary">{parsed.cleanTitle}</strong></span>
                  <button
                    type="button"
                    onClick={() => setTitle(parsed.cleanTitle)}
                    className="text-accent hover:text-accent-light font-bold ml-2 shrink-0 underline"
                  >
                    Usar
                  </button>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* BPM & Key */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="proj-bpm" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              BPM (Tempo)
            </Label>
            <div className="relative">
              <Input
                id="proj-bpm"
                type="number"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                placeholder="130"
                min="40"
                max="300"
                className="w-full pl-8"
              />
              <Activity className="w-4 h-4 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <Label htmlFor="proj-key" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Tonalidad (Key)
            </Label>
            <Input
              id="proj-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="G#m, C Maj..."
              className="w-full"
            />
          </div>
        </div>

        {/* Status & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Estado Inicial
            </Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PersonalProjectStatus)}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              {(Object.entries(PERSONAL_PROJECT_STATUS_CONFIG) as [PersonalProjectStatus, any][]).map(([sKey, sConfig]) => (
                <option key={sKey} value={sKey}>
                  {sConfig.icon} {sConfig.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Mes
            </Label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('es', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Año
            </Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
              className="w-full"
              min="2020"
              max="2035"
            />
          </div>
        </div>

        {/* Collaborators & Tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="proj-collabs" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Colaboradores (separados por coma)
            </Label>
            <Input
              id="proj-collabs"
              value={collaboratorsInput}
              onChange={(e) => setCollaboratorsInput(e.target.value)}
              placeholder="ProdX, BeatmakerY..."
              className="w-full"
            />
          </div>

          <div>
            <Label htmlFor="proj-tags" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
              Etiquetas / Tags (separados por coma)
            </Label>
            <Input
              id="proj-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="trap, dark, guitar, 808..."
              className="w-full"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label htmlFor="proj-notes" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Notas / Ideas
          </Label>
          <textarea
            id="proj-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ideas para el drop, plugins utilizados, referencias..."
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/50">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || !title.trim()} className="bg-accent hover:bg-accent-light text-white">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creando en Drive...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1.5" />
                Crear Proyecto
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
