/** Progress helpers shared by matrices, projects and the artist portal. */

export interface MatrixProgress {
  songs: number;
  phases: number;
  total: number;
  done: number;
  percent: number;
  completed: boolean;
}

export const isTrackable = (col: any) => !col?.type || col.type === 'status' || col.type === 'file';

export type OpenCellStatus = 'todo' | 'in_progress' | 'review';

export interface OpenCell {
  rowId: string;
  rowName: string;
  colId: string;
  colName: string;
  status: OpenCellStatus;
  dueDate?: string;
  eventId?: string;
}

interface ChecklistLike { id?: unknown; text?: unknown; done?: unknown; dueDate?: unknown }
interface CellLike { status?: unknown; dueDate?: unknown; eventId?: unknown; checklist?: unknown }
interface RowLike { id?: unknown; name?: unknown; cells?: Record<string, CellLike | undefined> }
interface ColumnLike { id?: unknown; name?: unknown; type?: unknown }

function gridOf(matrix: unknown): { rows: RowLike[]; cols: ColumnLike[] } {
  const grid = (matrix as { productionGrid?: { rows?: unknown; columns?: unknown } } | null)?.productionGrid;
  return {
    rows: Array.isArray(grid?.rows) ? (grid.rows as RowLike[]) : [],
    cols: Array.isArray(grid?.columns) ? (grid.columns as ColumnLike[]) : [],
  };
}

const cellOf = (row: RowLike, col: ColumnLike) => row?.cells?.[String(col.id)];
const label = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);
const OPEN = new Set(['todo', 'in_progress', 'review']);

/**
 * Cells of a matrix that still need work: the same criterion as the dashboard's pending-tasks board
 * (trackable columns that still exist, with a todo / in_progress / review status), plus any other
 * cell that carries a due date and is not done (those are mirrored to Google Calendar).
 */
export function openCells(matrix: unknown): OpenCell[] {
  const { rows, cols } = gridOf(matrix);
  const out: OpenCell[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const cell = cellOf(row, col);
      if (!cell) continue;
      const status = typeof cell.status === 'string' && OPEN.has(cell.status) ? (cell.status as OpenCellStatus) : null;
      const counts = isTrackable(col) ? !!status : !!cell.dueDate && cell.status !== 'done';
      if (!counts) continue;
      out.push({
        rowId: String(row.id),
        rowName: label(row.name, 'Sin nombre'),
        colId: String(col.id),
        colName: label(col.name, 'Fase'),
        status: status || 'todo',
        dueDate: typeof cell.dueDate === 'string' && cell.dueDate ? cell.dueDate : undefined,
        eventId: typeof cell.eventId === 'string' ? cell.eventId : undefined,
      });
    }
  }
  return out;
}

/** Checklist items inside matrix cells that have a due date and are not done yet. */
export function openChecklistItems(matrix: unknown): (OpenCell & { itemId: string; text: string })[] {
  const { rows, cols } = gridOf(matrix);
  const out: (OpenCell & { itemId: string; text: string })[] = [];
  for (const row of rows) {
    for (const col of cols) {
      const list = cellOf(row, col)?.checklist;
      const items: ChecklistLike[] = Array.isArray(list) ? list : [];
      for (const item of items) {
        if (item?.done || typeof item?.dueDate !== 'string' || !item.dueDate) continue;
        out.push({
          rowId: String(row.id), rowName: label(row.name, 'Sin nombre'), colId: String(col.id), colName: label(col.name, 'Fase'),
          status: 'todo', dueDate: item.dueDate, itemId: String(item.id), text: typeof item.text === 'string' ? item.text : '',
        });
      }
    }
  }
  return out;
}

export function matrixProgress(matrix: any): MatrixProgress {
  const grid = matrix?.productionGrid;
  const rows: any[] = Array.isArray(grid?.rows) ? grid.rows : [];
  const cols: any[] = Array.isArray(grid?.columns) ? grid.columns : [];
  const trackable = cols.filter(isTrackable);
  const total = rows.length * trackable.length;
  let done = 0;
  for (const row of rows) {
    for (const col of trackable) {
      if (row?.cells?.[col.id]?.status === 'done') done++;
    }
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  let completed: boolean;
  if (matrix?.forceStatus === 'completed') completed = true;
  else if (matrix?.forceStatus === 'active') completed = false;
  else completed = total > 0 && done === total;
  return { songs: rows.length, phases: cols.length, total, done, percent, completed };
}
