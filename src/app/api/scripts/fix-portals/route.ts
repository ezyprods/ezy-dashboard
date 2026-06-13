import { NextResponse } from 'next/server';
import { findAndReadJsonFile, listFolders, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export async function GET() {
  try {
    // List all artist folders
    const folders = await listFolders(DRIVE_ROOT_FOLDER_ID);
    
    const results = [];

    for (const folder of folders) {
      if (!folder.id) continue;
      
      const config = await findAndReadJsonFile<any>('portal_config.json', folder.id);
      if (config && config.modules) {
        let changed = false;
        
        // Ensure finances is false
        const financesMod = config.modules.find((m: any) => m.type === 'finances');
        if (financesMod && financesMod.isVisible !== false) {
          financesMod.isVisible = false;
          changed = true;
        }

        // Also clean up projects module if it's there
        const projIndex = config.modules.findIndex((m: any) => m.type === 'projects');
        if (projIndex !== -1) {
          config.modules.splice(projIndex, 1);
          changed = true;
        }

        if (changed) {
          await saveJsonFile('portal_config.json', config, folder.id);
          results.push(`Updated portal_config for folder: ${folder.name}`);
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
