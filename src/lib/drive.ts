import { google } from 'googleapis';
import { DRIVE_ROOT_FOLDER_ID } from './constants';
import { getFileType } from './utils';
import type { DriveFile, FileType } from '@/types';

// Singleton para el cliente de Google Auth
export const getAuthClient = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL + '/api/auth/callback/google'
  );

  // Usamos un Refresh Token permanente del productor (el admin)
  // ya que la app siempre leerá/escribirá en SU carpeta de Drive
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
  }

  return oauth2Client;
};

// Cliente de Drive
export const getDriveService = () => {
  return google.drive({ version: 'v3', auth: getAuthClient() });
};

/**
 * Crea una nueva carpeta en Drive
 */
export async function createFolder(name: string, parentId: string = DRIVE_ROOT_FOLDER_ID): Promise<string> {
  const drive = getDriveService();
  
  const fileMetadata = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
    supportsAllDrives: true,
  });

  if (!response.data.id) {
    throw new Error(`Failed to create folder: ${name}`);
  }

  return response.data.id;
}

/**
 * Crea o actualiza un archivo JSON con metadatos
 */
export async function saveJsonFile(name: string, data: any, parentId: string): Promise<string> {
  const drive = getDriveService();
  
  // Primero comprobamos si ya existe
  const query = `name='${name}' and '${parentId}' in parents and trashed=false`;
  const existing = await drive.files.list({ 
    q: query, 
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  
  const fileMetadata = {
    name,
    mimeType: 'application/json',
    parents: existing.data.files && existing.data.files.length === 0 ? [parentId] : undefined,
  };

  const media = {
    mimeType: 'application/json',
    body: JSON.stringify(data, null, 2),
  };

  if (existing.data.files && existing.data.files.length > 0) {
    // Actualizar existente
    const fileId = existing.data.files[0].id!;
    await drive.files.update({
      fileId,
      media: media,
      supportsAllDrives: true,
    });
    return fileId;
  } else {
    // Crear nuevo
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true,
    });
    return response.data.id!;
  }
}

/**
 * Lee un archivo JSON de Drive
 */
export async function readJsonFile<T>(fileId: string): Promise<T> {
  const drive = getDriveService();
  
  const response = await drive.files.get({
    fileId,
    alt: 'media',
    supportsAllDrives: true,
  });

  return response.data as T;
}

/**
 * Busca un archivo JSON por nombre en una carpeta y lo lee
 */
export async function findAndReadJsonFile<T>(name: string, folderId: string): Promise<T | null> {
  const drive = getDriveService();
  const query = `name='${name}' and '${folderId}' in parents and trashed=false`;
  
  const existing = await drive.files.list({ 
    q: query, 
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  
  if (!existing.data.files || existing.data.files.length === 0) {
    return null;
  }
  
  return readJsonFile<T>(existing.data.files[0].id!);
}

/**
 * Lista subcarpetas directas (Ej: para listar todos los artistas)
 */
export async function listFolders(parentId: string = DRIVE_ROOT_FOLDER_ID) {
  const drive = getDriveService();
  const query = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, createdTime)',
    orderBy: 'name',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  return response.data.files || [];
}

/**
 * Lista todos los archivos (no carpetas) de una carpeta
 */
export async function listFiles(parentId: string): Promise<DriveFile[]> {
  const drive = getDriveService();
  const query = `mimeType!='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink)',
    orderBy: 'modifiedTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const files = response.data.files || [];
  
  return files.map(file => ({
    id: file.id!,
    name: file.name!,
    mimeType: file.mimeType!,
    size: parseInt(file.size || '0', 10),
    createdTime: file.createdTime!,
    modifiedTime: file.modifiedTime!,
    webViewLink: file.webViewLink || undefined,
    webContentLink: file.webContentLink || undefined,
    thumbnailLink: file.thumbnailLink || undefined,
    downloadable: true, // Default, will be overridden by DB config later if needed
    playable: true,
    parentFolderId: parentId,
    fileType: getFileType(file.mimeType!),
  }));
}
