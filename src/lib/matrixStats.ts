/** Progress helpers shared by matrices, projects and the artist portal. */

export interface MatrixProgress {
  songs: number;
  phases: number;
  total: number;
  done: number;
  percent: number;
  completed: boolean;
}

const isTrackable = (col: any) => !col?.type || col.type === 'status' || col.type === 'file';

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
