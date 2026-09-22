'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { isMac } from './explorerUtils';
import { useExplorer } from './useExplorerController';

export function ShortcutsDialog() {
  const ex = useExplorer();
  if (!ex.shortcutsOpen) return null;
  const mod = isMac() ? '⌘' : 'Ctrl';

  const groups: { title: string; rows: [string[], string][] }[] = [
    {
      title: 'Navegar',
      rows: [
        [['↑', '↓', '←', '→'], 'Moverse entre elementos'],
        [['Intro'], 'Abrir carpeta / reproducir / ver'],
        [['Espacio'], 'Vista previa rápida o reproducir audio'],
        [['Retroceso'], 'Subir a la carpeta anterior'],
        [['A…Z'], 'Saltar al elemento que empieza por esas letras'],
        [['/'], 'Buscar en todo el perfil'],
      ],
    },
    {
      title: 'Seleccionar',
      rows: [
        [['Clic'], 'Seleccionar'],
        [[`${mod}`, 'Clic'], 'Añadir o quitar de la selección'],
        [['Mayús', 'Clic'], 'Seleccionar un rango'],
        [[mod, 'A'], 'Seleccionar todo'],
        [['Esc'], 'Quitar selección'],
      ],
    },
    {
      title: 'Organizar',
      rows: [
        [['F2'], 'Renombrar'],
        [['Supr'], 'Mover a la papelera'],
        [[mod, 'Z'], 'Deshacer la última acción'],
        [[mod, 'I'], 'Detalles'],
        [['Arrastrar'], 'Mover a otra carpeta (también al árbol y a la ruta)'],
        [['Clic derecho'], 'Todas las acciones'],
        [['C'], 'Nueva carpeta (en menú contextual)'],
      ],
    },
  ];

  return (
    <Modal isOpen onClose={() => ex.setShortcutsOpen(false)} title="Atajos de teclado" className="md:max-w-2xl">
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
        {groups.map(group => (
          <div key={group.title} className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">{group.title}</h4>
            {group.rows.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-primary">{label}</span>
                <span className="flex items-center gap-1 shrink-0">
                  {keys.map(k => (
                    <kbd key={k} className="min-w-[1.75rem] text-center text-[11px] font-sans font-semibold px-1.5 py-0.5 rounded-md border border-border bg-surface text-text-secondary">{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
