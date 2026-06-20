import { google } from 'googleapis';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { Session } from '../agent/types';

const SHEET_RANGE = 'Leads!A:N';

const HEADERS = [
  'ID', 'Fecha', 'Teléfono', 'Nombre', 'Tipo', 'Inmueble',
  'Zona', 'Presupuesto', 'Financiación', 'Urgencia (meses)',
  'Estado', 'Fuente', 'Mensajes', 'Visita agendada',
];

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient as Parameters<typeof google.sheets>[0]['auth'] });
}

export async function saveLead(session: Session): Promise<void> {
  if (CONFIG.demo.enabled) {
    logger.info(`[DEMO] Lead guardado en Sheets: ${session.phoneNumber} — ${session.status}`);
    return;
  }

  try {
    const sheets = await getSheetsClient();
    const { leadData: d } = session;

    const row = [
      session.id,
      session.createdAt.toISOString(),
      session.phoneNumber,
      d.name ?? '',
      d.type ?? '',
      d.propertyType ?? '',
      d.zone ?? '',
      d.budget?.toString() ?? '',
      d.needsFinancing === null ? '' : d.needsFinancing ? 'Sí' : 'No',
      d.urgencyMonths?.toString() ?? '',
      session.status,
      session.source,
      session.messagesCount.toString(),
      session.visitScheduled ? 'Sí' : 'No',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.google.sheetId,
      range: SHEET_RANGE,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    logger.info(`Lead ${session.id} guardado en Sheets`);
  } catch (err) {
    logger.error('Error guardando lead en Sheets', err);
    throw err;
  }
}

export async function initializeSheet(): Promise<void> {
  if (CONFIG.demo.enabled) return;

  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.google.sheetId,
      range: 'Leads!A1:N1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADERS] },
    });
    logger.info('Cabeceras de Sheets inicializadas');
  } catch (err) {
    logger.warn('No se pudieron inicializar las cabeceras de Sheets', err);
  }
}
