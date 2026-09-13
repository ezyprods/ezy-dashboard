import { google } from 'googleapis';
import { getCalendarAuthClient } from '@/lib/drive';

const STATUS_LABELS: Record<string, string> = {
  done: '✅ Hecho',
  review: '👀 Revisión',
  in_progress: '⚡ En progreso',
};

function collectCells(grid: any) {
  const map = new Map<string, { cell: any; rowName: string; colName: string }>();
  if (grid && Array.isArray(grid.rows) && Array.isArray(grid.columns)) {
    for (const row of grid.rows) {
      for (const col of grid.columns) {
        const cell = row.cells?.[col.id];
        if (cell) {
          map.set(`${row.id}-${col.id}`, { cell, rowName: row.name, colName: col.name });
        }
      }
    }
  }
  return map;
}

/**
 * Mirrors the due dates of a production grid (matrix) into Google Calendar.
 *
 * Mutates `newGrid` in place: new events get their `eventId` stored on the cell and
 * removed dates drop it, so the caller must persist `newGrid` afterwards.
 *
 * The client does not always send back the `eventId` that the server added on a previous
 * save, so it is inherited from the previously stored grid; otherwise every save would
 * insert a duplicated event.
 */
export async function syncProductionGridToGoogleCalendar(title: string, newGrid: any, oldGrid: any) {
  try {
    const auth = getCalendarAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const newCellsMap = collectCells(newGrid);
    const oldCellsMap = collectCells(oldGrid);

    for (const [key, { cell, rowName, colName }] of newCellsMap.entries()) {
      const oldCell = oldCellsMap.get(key)?.cell;

      if (!cell.eventId && oldCell?.eventId) {
        cell.eventId = oldCell.eventId;
      }

      const isChanged = !oldCell ||
        oldCell.dueDate !== cell.dueDate ||
        oldCell.status !== cell.status ||
        oldCell.notes !== cell.notes ||
        oldCell.fileName !== cell.fileName ||
        oldCell.eventId !== cell.eventId;

      const summary = `[${title}] ${rowName} - ${colName}`;
      const description = `Fase: ${colName}\nProyecto: ${title}\nCanción/Fila: ${rowName}\nEstado: ${
        STATUS_LABELS[cell.status] || '⭕ Pendiente'
      }\nNotas: ${cell.notes || 'Ninguna'}${cell.fileName ? `\nArchivo Vinculado: ${cell.fileName}` : ''}`;

      if (cell.dueDate) {
        const requestBody = {
          summary,
          description,
          start: { dateTime: `${cell.dueDate}T10:00:00`, timeZone: 'Europe/Madrid' },
          end: { dateTime: `${cell.dueDate}T11:00:00`, timeZone: 'Europe/Madrid' },
        };

        if (cell.eventId) {
          if (!isChanged) continue;
          try {
            await calendar.events.patch({ calendarId, eventId: cell.eventId, requestBody });
            continue;
          } catch (err: any) {
            const isGone = err?.code === 404 || err?.code === 410 || err?.message?.includes('Not Found') || err?.message?.includes('deleted');
            if (!isGone) {
              console.error(`Error patching calendar event ${cell.eventId}:`, err?.message);
              continue;
            }
            // The event was deleted from Google Calendar: recreate it below
            delete cell.eventId;
          }
        }

        try {
          const response = await calendar.events.insert({ calendarId, requestBody });
          if (response.data.id) {
            cell.eventId = response.data.id;
          }
        } catch (err: any) {
          console.error('Error creating calendar event:', err?.message);
        }
      } else if (cell.eventId) {
        // No due date anymore → remove the event
        try {
          await calendar.events.delete({ calendarId, eventId: cell.eventId });
        } catch (err: any) {
          console.error(`Error deleting calendar event ${cell.eventId}:`, err?.message);
        }
        delete cell.eventId;
      }
    }

    // Cells (rows/columns) that disappeared from the grid → delete their events
    for (const [key, { cell: oldCell }] of oldCellsMap.entries()) {
      if (!newCellsMap.has(key) && oldCell.eventId) {
        try {
          await calendar.events.delete({ calendarId, eventId: oldCell.eventId });
        } catch (err: any) {
          console.error(`Error deleting orphaned calendar event ${oldCell.eventId}:`, err?.message);
        }
      }
    }
  } catch (err: any) {
    console.error('Calendar matrix synchronization error:', err?.message);
  }
}
