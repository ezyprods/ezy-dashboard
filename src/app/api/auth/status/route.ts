import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET() {
  try {
    const drive = await getDriveService();
    // A simple test request to check if the token is valid
    await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)',
    });
    
    return NextResponse.json({ connected: true });
  } catch (error: any) {
    console.error('Error checking Google Auth status:', error);
    return NextResponse.json({ connected: false, error: error.message }, { status: 401 });
  }
}
