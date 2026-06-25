import { NextResponse } from 'next/server';
import { findAndReadJsonFile, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

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
    
    // Solo mostramos matrices que tengan al menos una tarea sin completar en 'matrices'
    // Las completadas van en 'completedMatrices'
    const activeMatrices = [];
    const completedMatrices = [];
    
    for (const m of allMatrices) {
      const grid = m.productionGrid;
      let isActive = false;
      
      if (grid && Array.isArray(grid.rows) && Array.isArray(grid.columns) && grid.rows.length > 0 && grid.columns.length > 0) {
        for (const row of grid.rows) {
          for (const col of grid.columns) {
             const cell = row.cells?.[col.id];
             if (!cell || cell.status !== 'done') {
               isActive = true;
               break;
             }
          }
          if (isActive) break;
        }
      } else {
        // Si no tiene grid o está vacío, se considera activa por defecto (para poder editarla)
        isActive = true;
      }
      
      if (isActive) {
        activeMatrices.push(m);
      } else {
        completedMatrices.push(m);
      }
    }
    
    return NextResponse.json({ 
      matrices: activeMatrices,
      completedMatrices: completedMatrices
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch global matrices', details: error.message }, { status: 500 });
  }
}
