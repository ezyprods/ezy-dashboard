import { NextResponse } from 'next/server';
import { findAndReadJsonFile, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const folders = await listFolders(DRIVE_ROOT_FOLDER_ID);
    const matrixPromises = folders.map(async (folder) => {
      try {
        const data = await findAndReadJsonFile<any>('matrices.json', folder.id!);
        if (data && data.matrices && data.matrices.length > 0) {
          return data.matrices.map((m: any) => ({
            ...m,
            artistId: folder.id,
            artistName: folder.name
          }));
        }
      } catch (e) {
        // Ignorar si un artista no tiene matrices.json
        return [];
      }
      return [];
    });
    
    const results = await Promise.all(matrixPromises);
    const allMatrices = results.flat();
    
    // Solo mostramos matrices que tengan al menos una tarea sin completar
    const activeMatrices = allMatrices.filter(m => {
      const grid = m.productionGrid;
      if (!grid || !Array.isArray(grid.rows) || !Array.isArray(grid.columns)) return false;
      if (grid.rows.length === 0 || grid.columns.length === 0) return false;
      
      for (const row of grid.rows) {
        for (const col of grid.columns) {
           const cell = row.cells?.[col.id];
           if (!cell || cell.status !== 'done') {
             return true; // Encontró al menos una tarea incompleta
           }
        }
      }
      return false; // Todas están 'done'
    });
    
    return NextResponse.json({ matrices: activeMatrices });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch global matrices', details: error.message }, { status: 500 });
  }
}
