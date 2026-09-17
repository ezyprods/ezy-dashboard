'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { cn } from '@/lib/utils';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import type { Project, ProjectStatus, ProjectType } from '@/types';

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; dot: string; chip: string }> = {
  active: { label: 'En curso', dot: 'bg-accent', chip: 'text-accent bg-accent/10 border-accent/25' },
  completed: { label: 'Terminado', dot: 'bg-success', chip: 'text-success bg-success/10 border-success/25' },
  archived: { label: 'Archivado', dot: 'bg-text-secondary', chip: 'text-text-secondary bg-surface border-border' },
};

export async function saveProject(projectId: string, updates: Partial<Project>): Promise<Project> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar el proyecto');
  return data.project;
}

interface EditProjectModalProps {
  project: Project | null;
  onClose: () => void;
  onSaved: (project: Project) => void;
}

export function EditProjectModal({ project, onClose, onSaved }: EditProjectModalProps) {
  const [form, setForm] = useState({
    title: '',
    type: 'single' as ProjectType,
    status: 'active' as ProjectStatus,
    deliveryDate: '',
    releaseDate: '',
    budget: '',
    notes: '',
    requirePaymentForDownload: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setForm({
      title: project.title || '',
      type: project.type || 'single',
      status: project.status || 'active',
      deliveryDate: project.deliveryDate || '',
      releaseDate: project.releaseDate || '',
      budget: project.budget ? String(project.budget) : '',
      notes: project.notes || '',
      requirePaymentForDownload: !!project.requirePaymentForDownload,
    });
  }, [project]);

  if (!project) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const saved = await saveProject(project.id, {
        title: form.title.trim(),
        type: form.type,
        status: form.status,
        deliveryDate: form.deliveryDate || undefined,
        releaseDate: form.releaseDate || undefined,
        budget: form.budget ? Number(form.budget) : undefined,
        notes: form.notes,
        requirePaymentForDownload: form.requirePaymentForDownload,
      });
      onSaved({ ...project, ...saved, id: project.id, driveFolderId: project.driveFolderId, driveUrl: project.driveUrl });
      toast.success('Proyecto guardado');
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm text-text-primary focus:outline-none focus:border-accent';

  return (
    <Modal isOpen onClose={onClose} title="Editar proyecto" description="Cambiar el título renombra también la carpeta de Drive.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Título</label>
          <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={field} required />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Tipo</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setForm(f => ({ ...f, type }))}
                className={cn('h-10 rounded-xl border text-sm font-medium transition-colors', form.type === type ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-text-secondary hover:bg-surface')}
              >
                {PROJECT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Estado</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setForm(f => ({ ...f, status }))}
                className={cn('h-10 rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors', form.status === status ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-text-secondary hover:bg-surface')}
              >
                <span className={cn('w-2 h-2 rounded-full', PROJECT_STATUS_META[status].dot)} />
                {PROJECT_STATUS_META[status].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Fecha de entrega</label>
            <DatePicker value={form.deliveryDate} onChange={v => setForm(f => ({ ...f, deliveryDate: v }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Fecha de lanzamiento</label>
            <DatePicker value={form.releaseDate} onChange={v => setForm(f => ({ ...f, releaseDate: v }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">Presupuesto (€)</label>
            <input type="number" min="0" step="1" inputMode="decimal" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0" className={field} />
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, requirePaymentForDownload: !f.requirePaymentForDownload }))}
            className="h-11 flex items-center gap-3 px-3 rounded-xl border border-border text-left hover:bg-surface"
          >
            <span className={cn('w-9 h-5 rounded-full p-0.5 transition-colors shrink-0', form.requirePaymentForDownload ? 'bg-accent' : 'bg-surface-elevated border border-border')}>
              <span className={cn('block w-4 h-4 rounded-full bg-white shadow transition-transform', form.requirePaymentForDownload && 'translate-x-4')} />
            </span>
            <span className="text-xs text-text-primary leading-tight">Bloquear descargas en el portal hasta que esté pagado</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary">Notas</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent resize-none" placeholder="Referencias, acuerdos, pendientes…" />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">Cancelar</button>
          <button type="submit" disabled={saving || !form.title.trim()} className="h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
