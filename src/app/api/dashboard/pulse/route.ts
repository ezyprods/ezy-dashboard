import { NextResponse } from 'next/server';
import { findAndReadJsonFile, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
import type { ArtistConfig, Artist } from '@/types';

export async function GET() {
  try {
    const [folders, artistsDbResult] = await Promise.all([
      listFolders(DRIVE_ROOT_FOLDER_ID),
      findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null)
    ]);
    
    const artistsDb = artistsDbResult || [];
    
    let totalActiveProjects = 0;
    let totalPendingPayments = 0;
    let priorityAlerts: string[] = [];

    const validArtists = folders.map(folder => {
      const syncedData = artistsDb.find(a => a.id === folder.id);
      
      let pulse = syncedData?.pulseStats;
      
      // Default pulse if none exists
      if (!pulse) {
        pulse = {
          statusColor: 'gray',
          activeProjects: [],
          pendingPayments: 0,
          newFiles: 0,
        };
      }

      // Aggregate global stats
      totalActiveProjects += pulse.activeProjects.length;
      totalPendingPayments += pulse.pendingPayments;
      
      if (pulse.statusColor === 'orange') {
        priorityAlerts.push(`Tienes revisión pendiente con ${syncedData?.name || folder.name}`);
      }
      if (pulse.pendingPayments > 0) {
        priorityAlerts.push(`${syncedData?.name || folder.name} tiene un saldo pendiente.`);
      }

      return {
        ...(syncedData || {
          id: folder.id!,
          name: folder.name!,
          genre: [],
          tags: [],
          services: [],
          status: 'active',
          createdAt: folder.createdTime || new Date().toISOString(),
          updatedAt: folder.createdTime || new Date().toISOString(),
        }),
        driveFolderId: folder.id!,
        pulseStats: pulse
      } as Artist;
    });

    if (priorityAlerts.length === 0) {
      priorityAlerts.push("Todo al día. No hay tareas urgentes.");
    }

    return NextResponse.json({ 
      artists: validArtists,
      globalStats: {
        totalActiveProjects,
        totalPendingPayments,
        priorityAlerts: priorityAlerts.slice(0, 3) // Top 3 alerts
      }
    });
  } catch (error: any) {
    console.error('API /dashboard/pulse GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch pulse', details: error.message }, { status: 500 });
  }
}
