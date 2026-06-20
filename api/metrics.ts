import { Request, Response } from 'express';
import { CONFIG, LEAD_STATUS } from '../config/constants';
import { getSeedLeads, SeedLead } from '../data/seed';
import { getAllSessions } from '../agent/session';

// ─── Fuente de datos ──────────────────────────────────────────────────────────

function getLeads(): SeedLead[] {
  if (CONFIG.demo.enabled) return getSeedLeads();

  // En producción, convierte las sesiones en memoria al mismo formato
  return getAllSessions().map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    phoneNumber: s.phoneNumber,
    name: s.leadData.name ?? 'Desconocido',
    type: (s.leadData.type ?? 'compra') as 'compra' | 'alquiler',
    propertyType: (s.leadData.propertyType ?? 'piso') as 'piso' | 'casa' | 'local' | 'oficina',
    zone: s.leadData.zone ?? 'Sin especificar',
    budget: s.leadData.budget ?? 0,
    urgencyMonths: s.leadData.urgencyMonths ?? 12,
    needsFinancing: s.leadData.needsFinancing ?? false,
    status: s.status,
    source: s.source,
    messagesCount: s.messagesCount,
    firstResponseMs: s.firstResponseAt
      ? s.firstResponseAt.getTime() - s.createdAt.getTime()
      : 1500,
    visitScheduled: s.visitScheduled,
    visitCompleted: false,
  }));
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ─── GET /metrics/summary ─────────────────────────────────────────────────────

export function getSummary(_req: Request, res: Response): void {
  const leads = getLeads();
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  const today = leads.filter((l) => l.createdAt >= todayStart);
  const week = leads.filter((l) => l.createdAt >= weekStart);
  const month = leads.filter((l) => l.createdAt >= monthStart);

  const hot = month.filter((l) => l.status === LEAD_STATUS.HOT);
  const visitsDone = month.filter((l) => l.visitCompleted);
  const visitsScheduled = month.filter((l) => l.visitScheduled);

  const avgResponseMs =
    month.reduce((sum, l) => sum + l.firstResponseMs, 0) / (month.length || 1);

  res.json({
    today: today.length,
    week: week.length,
    month: month.length,
    hot: hot.length,
    conversionRate: month.length ? Math.round((hot.length / month.length) * 100) : 0,
    visitsScheduled: visitsScheduled.length,
    visitsCompleted: visitsDone.length,
    avgResponseSeconds: Math.round(avgResponseMs / 1000),
  });
}

// ─── GET /metrics/conversion ──────────────────────────────────────────────────

export function getConversion(_req: Request, res: Response): void {
  const leads = getLeads().filter((l) => l.createdAt >= daysAgo(30));

  const counts = {
    [LEAD_STATUS.HOT]: 0,
    [LEAD_STATUS.WARM]: 0,
    [LEAD_STATUS.COLD]: 0,
  };

  for (const l of leads) counts[l.status]++;

  const total = leads.length || 1;

  res.json([
    { status: LEAD_STATUS.HOT,  count: counts[LEAD_STATUS.HOT],  pct: Math.round(counts[LEAD_STATUS.HOT]  / total * 100) },
    { status: LEAD_STATUS.WARM, count: counts[LEAD_STATUS.WARM], pct: Math.round(counts[LEAD_STATUS.WARM] / total * 100) },
    { status: LEAD_STATUS.COLD, count: counts[LEAD_STATUS.COLD], pct: Math.round(counts[LEAD_STATUS.COLD] / total * 100) },
  ]);
}

// ─── GET /metrics/timeline ────────────────────────────────────────────────────

export function getTimeline(_req: Request, res: Response): void {
  const leads = getLeads().filter((l) => l.createdAt >= daysAgo(30));

  const buckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    buckets[isoDate(daysAgo(i))] = 0;
  }
  for (const l of leads) {
    const key = isoDate(startOfDay(l.createdAt));
    if (key in buckets) buckets[key]++;
  }

  res.json(
    Object.entries(buckets).map(([date, count]) => ({ date, count }))
  );
}

// ─── GET /metrics/sources ─────────────────────────────────────────────────────

export function getSources(_req: Request, res: Response): void {
  const leads = getLeads().filter((l) => l.createdAt >= daysAgo(30));
  const counts: Record<string, number> = {};

  for (const l of leads) {
    counts[l.source] = (counts[l.source] ?? 0) + 1;
  }

  const total = leads.length || 1;
  const result = Object.entries(counts)
    .map(([source, count]) => ({ source, count, pct: Math.round(count / total * 100) }))
    .sort((a, b) => b.count - a.count);

  res.json(result);
}

// ─── GET /metrics/roi ─────────────────────────────────────────────────────────

export function getRoi(_req: Request, res: Response): void {
  const leads = getLeads().filter((l) => l.createdAt >= daysAgo(30));
  const hot = leads.filter((l) => l.status === LEAD_STATUS.HOT);
  const visitsCompleted = leads.filter((l) => l.visitCompleted);

  // Estimación conservadora: 15% de leads calientes cierran operación
  // Comisión media: 3% del precio de compra o 1 mes de alquiler
  const CLOSE_RATE = 0.15;
  const COMMISSION_RATE = 0.03;
  const SERVICE_COST_MONTHLY = 250;
  const SETUP_COST = 1500;

  const potentialRevenue = hot.reduce((sum, l) => {
    const commissionBase = l.type === 'compra' ? l.budget : l.budget * 12;
    return sum + commissionBase * COMMISSION_RATE * CLOSE_RATE;
  }, 0);

  const monthsRunning = 1;
  const totalCost = SETUP_COST / 12 + SERVICE_COST_MONTHLY * monthsRunning;
  const roi = totalCost > 0 ? Math.round(((potentialRevenue - totalCost) / totalCost) * 100) : 0;

  res.json({
    hotLeads: hot.length,
    visitsCompleted: visitsCompleted.length,
    potentialRevenue: Math.round(potentialRevenue),
    serviceCost: Math.round(totalCost),
    roi,
    closeRateAssumption: CLOSE_RATE,
    avgCommission: Math.round(potentialRevenue / (hot.length || 1)),
  });
}

// ─── GET /metrics/response-time ───────────────────────────────────────────────

export function getResponseTime(_req: Request, res: Response): void {
  const leads = getLeads().filter((l) => l.createdAt >= daysAgo(30));

  const avg = leads.reduce((s, l) => s + l.firstResponseMs, 0) / (leads.length || 1);
  const sorted = [...leads].sort((a, b) => a.firstResponseMs - b.firstResponseMs);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]?.firstResponseMs ?? 0;
  const p90 = sorted[Math.floor(sorted.length * 0.9)]?.firstResponseMs ?? 0;
  const under3s = leads.filter((l) => l.firstResponseMs < 3000).length;

  // Tiempo medio de respuesta humana estimado en 4 horas (dato benchmarking sector)
  const humanAvgMs = 4 * 60 * 60 * 1000;

  res.json({
    avgMs: Math.round(avg),
    avgSeconds: Math.round(avg / 1000),
    p50Ms: Math.round(p50),
    p90Ms: Math.round(p90),
    under3sCount: under3s,
    under3sPct: Math.round(under3s / (leads.length || 1) * 100),
    vsHumanSpeedupX: Math.round(humanAvgMs / avg),
  });
}

// ─── GET /metrics/leads/recent ────────────────────────────────────────────────

export function getRecentLeads(req: Request, res: Response): void {
  const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10), 50);
  const leads = getLeads().slice(0, limit);

  res.json(leads.map((l) => ({
    id: l.id,
    name: l.name,
    zone: l.zone,
    budget: l.budget,
    type: l.type,
    status: l.status,
    source: l.source,
    visitScheduled: l.visitScheduled,
    createdAt: l.createdAt.toISOString(),
    messagesCount: l.messagesCount,
  })));
}
