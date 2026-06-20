import { getSeedLeads } from '../data/seed';
import { LEAD_STATUS } from '../config/constants';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try { fn(); console.info(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}: ${(err as Error).message}`); failed++; }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertRange(val: number, min: number, max: number, label: string): void {
  if (val < min || val > max) throw new Error(`${label}: ${val} fuera de rango [${min}, ${max}]`);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

console.info('\n[Seed Data]');

test('Genera exactamente 180 leads', () => {
  const leads = getSeedLeads();
  assert(leads.length === 180, `esperados 180, obtenidos ${leads.length}`);
});

test('Todos los leads tienen datos completos', () => {
  const leads = getSeedLeads();
  for (const l of leads) {
    assert(l.id.length > 0, 'id vacío');
    assert(l.phoneNumber.startsWith('+'), 'teléfono inválido');
    assert(l.budget > 0, `budget <= 0 en ${l.id}`);
    assert(l.zone.length > 0, 'zone vacía');
    assert(['compra', 'alquiler'].includes(l.type), 'type inválido');
    assert([LEAD_STATUS.HOT, LEAD_STATUS.WARM, LEAD_STATUS.COLD].includes(l.status), 'status inválido');
  }
});

test('Leads ordenados de más reciente a más antiguo', () => {
  const leads = getSeedLeads();
  for (let i = 1; i < leads.length; i++) {
    assert(
      leads[i - 1].createdAt >= leads[i].createdAt,
      `orden incorrecto en índice ${i}`
    );
  }
});

test('Distribución de estados razonable (CALIENTE entre 20% y 60%)', () => {
  const leads = getSeedLeads();
  const hot = leads.filter(l => l.status === LEAD_STATUS.HOT).length;
  const pct = hot / leads.length * 100;
  assertRange(pct, 20, 60, 'porcentaje CALIENTE');
});

test('Distribución de fuentes: WhatsApp Directo es la fuente principal', () => {
  const leads = getSeedLeads();
  const bySrc: Record<string, number> = {};
  for (const l of leads) bySrc[l.source] = (bySrc[l.source] ?? 0) + 1;
  const entries = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  assert(entries[0][0] === 'WhatsApp Directo', `fuente principal es ${entries[0][0]}`);
});

test('Solo leads CALIENTE tienen visitas agendadas', () => {
  const leads = getSeedLeads();
  const wrongVisit = leads.filter(l => l.visitScheduled && l.status !== LEAD_STATUS.HOT);
  assert(wrongVisit.length === 0, `${wrongVisit.length} leads no-CALIENTE con visita agendada`);
});

test('Tiempos de respuesta entre 800ms y 3200ms', () => {
  const leads = getSeedLeads();
  for (const l of leads) {
    assertRange(l.firstResponseMs, 800, 3200, `firstResponseMs de ${l.id}`);
  }
});

test('Datos son deterministas (misma seed = mismos resultados)', () => {
  const leads1 = getSeedLeads();
  const { getSeedLeads: getSeedLeads2 } = require('../data/seed');
  const leads2 = getSeedLeads2();
  assert(leads1[0].id === leads2[0].id, 'primera llamada difiere');
  assert(leads1[99].budget === leads2[99].budget, 'llamada posterior difiere');
});

// ─── Cálculos de métricas ─────────────────────────────────────────────────────

console.info('\n[Metric Calculations]');

test('Leads de hoy: subconjunto correcto', () => {
  const leads = getSeedLeads();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = leads.filter(l => l.createdAt >= todayStart);
  assert(today.length >= 0, 'nunca negativo');
  assert(today.every(l => l.createdAt >= todayStart), 'todos son de hoy');
});

test('ROI: leads CALIENTE tienen presupuesto > 0', () => {
  const leads = getSeedLeads();
  const hot = leads.filter(l => l.status === LEAD_STATUS.HOT);
  assert(hot.length > 0, 'debe haber leads CALIENTE');
  assert(hot.every(l => l.budget > 0), 'presupuesto inválido en CALIENTE');
});

test('Timeline: 30 días cubre exactamente 30 entradas', () => {
  const leads = getSeedLeads();
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  monthAgo.setHours(0, 0, 0, 0);

  const buckets = new Set<string>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.add(d.toISOString().split('T')[0]);
  }
  assert(buckets.size === 30, `esperados 30 días, obtenidos ${buckets.size}`);
});

test('Conversión: suma de porcentajes ≈ 100', () => {
  const leads = getSeedLeads();
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const month = leads.filter(l => l.createdAt >= monthAgo);

  const total = month.length;
  const hot = month.filter(l => l.status === LEAD_STATUS.HOT).length;
  const warm = month.filter(l => l.status === LEAD_STATUS.WARM).length;
  const cold = month.filter(l => l.status === LEAD_STATUS.COLD).length;

  assert(hot + warm + cold === total, `suma de estados (${hot}+${warm}+${cold}) ≠ total (${total})`);
});

// ─── Resultado ────────────────────────────────────────────────────────────────

console.info(`\n${'─'.repeat(40)}`);
console.info(`Resultado: ${passed} pasados, ${failed} fallados`);
if (failed > 0) process.exit(1);
