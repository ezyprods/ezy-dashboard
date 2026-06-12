import { NextResponse, NextRequest } from 'next/server';
import { listPermissions, shareFile, revokePermission } from '@/lib/drive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const permissions = await listPermissions(fileId);
    return NextResponse.json({ permissions });
  } catch (error: any) {
    console.error('API /api/files/[fileId]/share GET error:', error);
    return NextResponse.json({ error: 'Failed to list permissions', details: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const { role, type, emailAddress } = body;

    if (!role || !type) {
      return NextResponse.json({ error: 'Missing role or type' }, { status: 400 });
    }

    const permission = await shareFile(fileId, role, type, emailAddress);
    return NextResponse.json({ success: true, permission });
  } catch (error: any) {
    console.error('API /api/files/[fileId]/share POST error:', error);
    return NextResponse.json({ error: 'Failed to add permission', details: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const { searchParams } = new URL(request.url);
    const permissionId = searchParams.get('permissionId');

    if (!permissionId) {
      return NextResponse.json({ error: 'Missing permissionId' }, { status: 400 });
    }

    await revokePermission(fileId, permissionId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /api/files/[fileId]/share DELETE error:', error);
    return NextResponse.json({ error: 'Failed to revoke permission', details: error.message }, { status: 500 });
  }
}
