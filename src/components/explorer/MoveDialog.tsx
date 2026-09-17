'use client';

import React, { useMemo } from 'react';
import { FolderPicker } from '@/components/upload/FolderPicker';
import { isInside } from './driveStore';
import { useExplorer } from './useExplorerController';

export function MoveDialog() {
  const ex = useExplorer();
  const dialog = ex.moveDialog;
  const blockedIds = useMemo(() => new Set(dialog?.items.map(i => i.id) || []), [dialog]);

  if (!dialog) return null;

  const { items, mode } = dialog;
  const count = items.length;
  const title = mode === 'move'
    ? `Mover ${count === 1 ? `"${items[0].name}"` : `${count} elementos`}`
    : `Copiar ${count === 1 ? `"${items[0].name}"` : `${count} archivos`}`;

  return (
    <FolderPicker
      isOpen
      onClose={() => ex.setMoveDialog(null)}
      rootId={ex.rootId}
      rootName={ex.rootName}
      startFolderId={items[0]?.parentId || ex.folderId}
      title={title}
      description="Elige la carpeta de destino"
      blockedIds={blockedIds}
      validate={(folder, trail) => {
        const intoItself = items.some(i => i.isFolder && (folder.id === i.id || isInside(folder.id, i.id, ex.rootId) || trail.some(c => c.id === i.id)));
        if (intoItself) return 'No puedes mover una carpeta dentro de sí misma.';
        if (mode === 'move' && items.every(i => i.parentId === folder.id)) return 'Los elementos ya están en esta carpeta.';
        return null;
      }}
      confirmLabel={folder => (mode === 'move' ? `Mover a "${folder.name}"` : `Copiar a "${folder.name}"`)}
      onConfirm={async folder => {
        ex.setMoveDialog(null);
        if (mode === 'move') await ex.performMove(items, folder.id);
        else await ex.performCopy(items, folder.id);
      }}
    />
  );
}
