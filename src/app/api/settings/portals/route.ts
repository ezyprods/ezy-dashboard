import { NextResponse } from 'next/server';
import { listFolders, findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
import type { ArtistConfig, PortalConfig } from '@/types';

const DEFAULT_MODULES = [
  { id: 'bounces', type: 'bounces', isVisible: true, order: 0, title: 'Últimas Mezclas / Audios' },
  { id: 'tasks', type: 'tasks', isVisible: true, order: 1, title: 'Estado del Trabajo' },
  { id: 'releases', type: 'releases', isVisible: true, order: 2, title: 'Releases / Previews' }
];

export async function GET() {
  try {
    const [folders, artistsDbResult] = await Promise.all([
      listFolders(DRIVE_ROOT_FOLDER_ID).catch(e => {
        if (e.message?.includes('invalid_grant') || e.message?.includes('credentials')) {
          throw new Error('AUTH_REQUIRED');
        }
        throw e;
      }),
      findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null)
    ]);
    
    const artistsDb = artistsDbResult || [];
    
    // Resolve portal config for each artist folder in parallel
    const portalDataPromises = folders.map(async (folder) => {
      const syncedData = artistsDb.find(a => a.id === folder.id);
      const artistName = syncedData ? syncedData.name : folder.name;
      
      let config = null;
      try {
        config = await findAndReadJsonFile<PortalConfig>('portal_config.json', folder.id!);
        if (!config) {
          config = {
            artistId: folder.id!,
            token: Math.random().toString(36).substring(2, 15),
            producerName: 'Productor',
            showFeedback: true,
            createdAt: new Date().toISOString(),
            modules: DEFAULT_MODULES as any
          };
          // We can save it asynchronously to not block
          saveJsonFile('portal_config.json', config, folder.id!).catch(console.error);
        } else if (!config.modules) {
          config.modules = DEFAULT_MODULES as any;
          saveJsonFile('portal_config.json', config, folder.id!).catch(console.error);
        } else {
          // Check for missing modules
          let changed = false;
          const existingTypes = new Set(config.modules.map((m: any) => m.type));
          DEFAULT_MODULES.forEach(defMod => {
            if (!existingTypes.has(defMod.type)) {
              config!.modules!.push({ ...defMod, order: config!.modules!.length } as any);
              changed = true;
            }
          });
          if (changed) {
            saveJsonFile('portal_config.json', config, folder.id!).catch(console.error);
          }
        }
      } catch (err) {
        console.error(`Error resolving portal config for artist ${folder.name}:`, err);
      }

      return {
        artistId: folder.id!,
        artistName: artistName || 'Desconocido',
        config: config
      };
    });

    const results = await Promise.all(portalDataPromises);
    
    // Sort alphabetically by artist name
    results.sort((a, b) => a.artistName.localeCompare(b.artistName));
    
    return NextResponse.json({ artists: results });
  } catch (error: any) {
    console.error('API /settings/portals GET error:', error);
    if (error.message === 'AUTH_REQUIRED') {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch global portal configs' }, { status: 500 });
  }
}
