import { google } from 'googleapis';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { markVisitScheduled } from '../agent/session';
import { COPY } from '../config/copy';

interface BookingRequest {
  phoneNumber: string;
  clientName: string;
  zone: string;
  preferredDate?: Date;
}

async function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CONFIG.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const authClient = await auth.getClient();
  return google.calendar({ version: 'v3', auth: authClient as Parameters<typeof google.calendar>[0]['auth'] });
}

export async function scheduleVisit(request: BookingRequest): Promise<string> {
  if (CONFIG.demo.enabled) {
    const visitDate = getNextBusinessSlot(request.preferredDate);
    const dateStr = formatDate(visitDate);
    markVisitScheduled(request.phoneNumber, dateStr);
    logger.info(`[DEMO] Visita agendada para ${request.clientName} el ${dateStr}`);
    return dateStr;
  }

  try {
    const calendar = await getCalendarClient();
    const startTime = getNextBusinessSlot(request.preferredDate);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const event = await calendar.events.insert({
      calendarId: CONFIG.google.calendarId,
      requestBody: {
        summary: `Visita: ${request.clientName} — ${request.zone}`,
        description: `Lead WhatsApp: ${request.phoneNumber}\nZona: ${request.zone}`,
        start: { dateTime: startTime.toISOString(), timeZone: 'Europe/Madrid' },
        end: { dateTime: endTime.toISOString(), timeZone: 'Europe/Madrid' },
      },
    });

    const dateStr = formatDate(startTime);
    markVisitScheduled(request.phoneNumber, dateStr);
    logger.info(`Visita creada en Calendar: ${event.data.id}`);
    return dateStr;
  } catch (err) {
    logger.error('Error creando evento en Calendar', err);
    throw err;
  }
}

function getNextBusinessSlot(preferred?: Date): Date {
  const base = preferred ?? new Date();
  base.setDate(base.getDate() + 1);

  const dayOfWeek = base.getDay();
  if (dayOfWeek === 0) base.setDate(base.getDate() + 1);
  if (dayOfWeek === 6) base.setDate(base.getDate() + 2);

  base.setHours(11, 0, 0, 0);
  return base;
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

export function buildBookingConfirmation(dateStr: string): string {
  return COPY.agent.bookingConfirm
    .replace('{{date}}', dateStr.split(' a las ')[0])
    .replace('{{time}}', dateStr.split(' a las ')[1] ?? '');
}
