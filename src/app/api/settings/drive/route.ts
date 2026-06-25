import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET() {
  try {
    const drive = getDriveService();
    const response = await drive.about.get({
      fields: 'user, storageQuota',
    });

    return NextResponse.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error('API /settings/drive GET error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch Drive status', 
      details: error.message 
    }, { status: 500 });
  }
}
