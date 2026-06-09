'use client';

import { useState } from 'react';
import { X, GripVertical, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getFileIconName } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CustomSortModalProps {
  folderName: string;
  files: any[];
  onClose: () => void;
  onSave: (orderedFileIds: string[]) => void;
}

function SortableFileItem({ file }: { file: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const iconName = getFileIconName(file.mimeType);
  const IconComponent = (LucideIcons as any)[iconName] || FileIcon;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-3 p-3 mb-2 rounded-lg border border-border bg-surface-elevated/50 group transition-all ${isDragging ? 'z-10 shadow-lg border-accent/50 relative' : 'hover:border-border'}`}>
      <button {...attributes} {...listeners} className="text-text-secondary cursor-grab active:cursor-grabbing hover:text-text-primary transition-colors">
        <GripVertical className="w-5 h-5" />
      </button>
      <IconComponent className="w-5 h-5 text-accent/70" />
      <span className="text-sm text-text-primary truncate flex-1">{file.name}</span>
    </div>
  );
}

export function CustomSortModal({ folderName, files, onClose, onSave }: CustomSortModalProps) {
  const [items, setItems] = useState(files);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSave = () => {
    onSave(items.map(i => i.id));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">Orden Personalizado</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-sm text-text-secondary mb-4">
            Arrastra los archivos para establecer su orden en la carpeta <strong>{folderName}</strong>.
          </p>
          
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              {items.map(file => (
                <SortableFileItem key={file.id} file={file} />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2 bg-surface-elevated">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Orden</Button>
        </div>
      </div>
    </div>
  );
}
