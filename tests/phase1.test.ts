import { getOrCreateSession, addMessage, updateLeadData, updateStatus, getRecentMessages, getAllSessions } from '../agent/session';
import { scoreLead, isReadyToQualify } from '../qualifier/score';
import { LeadData } from '../agent/types';
import { LEAD_STATUS } from '../config/constants';
import { getDemoAgentResponse } from '../agent/demo';
import { extractIncomingMessage } from '../webhook/whatsapp';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.info(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: esperado "${String(expected)}", obtenido "${String(actual)}"`);
  }
}

// ─── Sesiones ────────────────────────────────────────────────────────────────

console.info('\n[Sessions]');

test('Crea nueva sesión para un número nuevo', () => {
  const session = getOrCreateSession('+34600111111');
  assert(session.id.length > 0, 'id debe existir');
  assertEqual(session.phoneNumber, '+34600111111', 'phoneNumber');
  assertEqual(session.messagesCount, 0, 'messagesCount inicial');
});

test('Devuelve la misma sesión para el mismo número', () => {
  const s1 = getOrCreateSession('+34600222222');
  const s2 = getOrCreateSession('+34600222222');
  assertEqual(s1.id, s2.id, 'id debe coincidir');
});

test('Añade mensajes correctamente', () => {
  addMessage('+34600111111', { role: 'user', content: 'Hola', timestamp: new Date() });
  addMessage('+34600111111', { role: 'assistant', content: 'Hola, ¿qué buscas?', timestamp: new Date() });
  const msgs = getRecentMessages('+34600111111', 10);
  assertEqual(msgs.length, 2, 'debe haber 2 mensajes');
  assertEqual(msgs[0].role, 'user', 'primer mensaje es user');
});

test('Actualiza datos del lead sin perder datos previos', () => {
  updateLeadData('+34600111111', { type: 'compra', zone: 'Salamanca' });
  updateLeadData('+34600111111', { budget: 400000 });
  const session = getOrCreateSession('+34600111111');
  assertEqual(session.leadData.type, 'compra', 'type preservado');
  assertEqual(session.leadData.zone, 'Salamanca', 'zone preservada');
  assertEqual(session.leadData.budget, 400000, 'budget actualizado');
});

test('Actualiza status del lead', () => {
  updateStatus('+34600111111', LEAD_STATUS.HOT);
  const session = getOrCreateSession('+34600111111');
  assertEqual(session.status, LEAD_STATUS.HOT, 'status CALIENTE');
});

// ─── Scoring ─────────────────────────────────────────────────────────────────

console.info('\n[Qualifier / Scoring]');

test('Lead CALIENTE: presupuesto + zona + urgencia < 3 meses', () => {
  const data: LeadData = {
    type: 'compra', propertyType: 'piso', zone: 'Retiro',
    budget: 350000, needsFinancing: false, urgencyMonths: 2,
    name: 'Ana López', phone: '+34600000001',
  };
  const result = scoreLead(data);
  assertEqual(result.status, LEAD_STATUS.HOT, 'debe ser CALIENTE');
  assertEqual(result.score, 3, 'score 3');
});

test('Lead TIBIO: presupuesto + zona, sin urgencia', () => {
  const data: LeadData = {
    type: 'alquiler', propertyType: 'piso', zone: 'Centro',
    budget: 1200, needsFinancing: null, urgencyMonths: null,
    name: null, phone: null,
  };
  const result = scoreLead(data);
  assertEqual(result.status, LEAD_STATUS.WARM, 'debe ser TIBIO');
});

test('Lead FRÍO: solo tipo, sin datos clave', () => {
  const data: LeadData = {
    type: 'compra', propertyType: null, zone: null,
    budget: null, needsFinancing: null, urgencyMonths: null,
    name: null, phone: null,
  };
  const result = scoreLead(data);
  assertEqual(result.status, LEAD_STATUS.COLD, 'debe ser FRÍO');
});

test('isReadyToQualify requiere tipo y al menos presupuesto o zona', () => {
  const withBoth: LeadData = { type: 'compra', propertyType: null, zone: 'Centro', budget: 300000, needsFinancing: null, urgencyMonths: null, name: null, phone: null };
  const withOnly: LeadData = { type: null, propertyType: null, zone: null, budget: null, needsFinancing: null, urgencyMonths: null, name: null, phone: null };
  assert(isReadyToQualify(withBoth), 'debe estar listo');
  assert(!isReadyToQualify(withOnly), 'no debe estar listo sin datos');
});

// ─── WhatsApp payload parsing ─────────────────────────────────────────────────

console.info('\n[Webhook / extractIncomingMessage]');

test('Extrae mensaje de payload WhatsApp válido', () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          messages: [{
            type: 'text',
            from: '+34600999888',
            text: { body: 'Hola, busco piso' },
          }],
        },
      }],
    }],
  };
  const result = extractIncomingMessage(payload);
  assert(result !== null, 'debe devolver resultado');
  assertEqual(result!.phoneNumber, '+34600999888', 'phoneNumber');
  assertEqual(result!.text, 'Hola, busco piso', 'text');
});

test('Devuelve null si el mensaje no es de tipo text', () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          messages: [{ type: 'image', from: '+34600999888' }],
        },
      }],
    }],
  };
  const result = extractIncomingMessage(payload);
  assert(result === null, 'debe devolver null para mensajes no-text');
});

test('Devuelve null si el payload es inválido', () => {
  assert(extractIncomingMessage(null) === null, 'null payload');
  assert(extractIncomingMessage({}) === null, 'empty payload');
});

// ─── Demo agent ────────────────────────────────────────────────────────────────

console.info('\n[Demo Agent]');

const emptyLead: LeadData = {
  type: null, propertyType: null, zone: null, budget: null,
  needsFinancing: null, urgencyMonths: null, name: null, phone: null,
};

test('Responde al saludo con pregunta sobre tipo de operación', async () => {
  const result = await getDemoAgentResponse([], 'hola', emptyLead);
  assert(result.message.length > 0, 'mensaje no vacío');
  assert(result.message.toLowerCase().includes('comprar') || result.message.toLowerCase().includes('alquilar'), 'pregunta compra/alquiler');
});

test('Extrae tipo=compra cuando el usuario dice "comprar"', async () => {
  const result = await getDemoAgentResponse([], 'quiero comprar', emptyLead);
  assertEqual(result.extracted.type, 'compra', 'type extraído');
});

test('Extrae tipo=alquiler cuando el usuario dice "alquilar"', async () => {
  const result = await getDemoAgentResponse([], 'me interesa alquilar', emptyLead);
  assertEqual(result.extracted.type, 'alquiler', 'type extraído');
});

// ─── Resultados ───────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  // Los tests async se ejecutan arriba directamente pero necesitamos esperar
  await new Promise(resolve => setTimeout(resolve, 3500)); // espera demos

  console.info(`\n${'─'.repeat(40)}`);
  console.info(`Resultado: ${passed} pasados, ${failed} fallados`);
  if (failed > 0) process.exit(1);
}

runTests();
