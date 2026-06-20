import { v4 as uuidv4 } from 'uuid';
import { Session, LeadData, ConversationMessage } from './types';
import { LEAD_STATUS, LEAD_SOURCES, LeadStatus } from '../config/constants';
import { logger } from '../config/logger';

const sessions = new Map<string, Session>();

const emptyLeadData = (): LeadData => ({
  type: null,
  propertyType: null,
  zone: null,
  budget: null,
  needsFinancing: null,
  urgencyMonths: null,
  name: null,
  phone: null,
});

export function getOrCreateSession(phoneNumber: string): Session {
  if (sessions.has(phoneNumber)) {
    return sessions.get(phoneNumber)!;
  }

  const session: Session = {
    id: uuidv4(),
    phoneNumber,
    messages: [],
    leadData: emptyLeadData(),
    status: LEAD_STATUS.COLD,
    source: LEAD_SOURCES.WHATSAPP_DIRECT,
    createdAt: new Date(),
    updatedAt: new Date(),
    isQualified: false,
    visitScheduled: false,
    messagesCount: 0,
  };

  sessions.set(phoneNumber, session);
  logger.info(`Nueva sesión creada para ${phoneNumber} — id: ${session.id}`);
  return session;
}

export function getSession(phoneNumber: string): Session | undefined {
  return sessions.get(phoneNumber);
}

export function addMessage(phoneNumber: string, message: ConversationMessage): void {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  session.messages.push(message);
  session.messagesCount++;
  session.updatedAt = new Date();

  if (message.role === 'assistant' && !session.firstResponseAt) {
    session.firstResponseAt = new Date();
  }
  if (message.role === 'assistant') {
    session.lastResponseAt = new Date();
  }
}

export function updateLeadData(phoneNumber: string, extracted: Partial<LeadData>): void {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  session.leadData = { ...session.leadData, ...removeNullValues(extracted) };
  session.updatedAt = new Date();
}

export function updateStatus(phoneNumber: string, status: LeadStatus): void {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  session.status = status;
  session.updatedAt = new Date();
}

export function markQualified(phoneNumber: string): void {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  session.isQualified = true;
  session.updatedAt = new Date();
}

export function markVisitScheduled(phoneNumber: string, visitDate: string): void {
  const session = sessions.get(phoneNumber);
  if (!session) return;

  session.visitScheduled = true;
  session.visitDate = visitDate;
  session.updatedAt = new Date();
}

export function getRecentMessages(
  phoneNumber: string,
  limit: number
): ConversationMessage[] {
  const session = sessions.get(phoneNumber);
  if (!session) return [];

  return session.messages.slice(-limit);
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

export function resetSession(phoneNumber: string): void {
  sessions.delete(phoneNumber);
  logger.info(`Sesión reiniciada para ${phoneNumber}`);
}

export function resetAllSessions(): void {
  sessions.clear();
  logger.info('Todas las sesiones reiniciadas');
}

export function truncateHistory(phoneNumber: string, keepLast: number): void {
  const session = sessions.get(phoneNumber);
  if (!session || session.messages.length <= keepLast) return;

  session.messages = session.messages.slice(-keepLast);
  logger.info(`Historial truncado para ${phoneNumber}, manteniendo últimos ${keepLast} mensajes`);
}

function removeNullValues(obj: Partial<LeadData>): Partial<LeadData> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
  ) as Partial<LeadData>;
}
