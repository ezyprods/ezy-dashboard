import { NextResponse } from 'next/server';
import { LibraryError } from '@/lib/beatLibrary';

export const idList = (value: unknown, max = 500): string[] | null =>
  Array.isArray(value) && value.every(v => typeof v === 'string' && /^[\w-]{5,200}$/.test(v))
    ? Array.from(new Set(value as string[])).slice(0, max)
    : null;

export const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.trim().slice(0, max) : undefined;

export function errorResponse(error: any, fallback: string) {
  if (error instanceof LibraryError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback, details: error?.message }, { status: 500 });
}
