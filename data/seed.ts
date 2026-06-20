import { LEAD_STATUS, LEAD_SOURCES, LeadStatus, LeadSource } from '../config/constants';

export interface SeedLead {
  id: string;
  createdAt: Date;
  phoneNumber: string;
  name: string;
  type: 'compra' | 'alquiler';
  propertyType: 'piso' | 'casa' | 'local' | 'oficina';
  zone: string;
  budget: number;
  urgencyMonths: number;
  needsFinancing: boolean;
  status: LeadStatus;
  source: LeadSource;
  messagesCount: number;
  firstResponseMs: number;  // ms hasta primera respuesta del agente
  visitScheduled: boolean;
  visitCompleted: boolean;
}

const ZONES = [
  'Salamanca', 'Retiro', 'Chamberí', 'Centro', 'Malasaña',
  'Chueca', 'Lavapiés', 'Carabanchel', 'Vallecas', 'Pozuelo',
  'Majadahonda', 'Alcobendas', 'Hortaleza', 'Moratalaz',
];

const NAMES = [
  'Ana García', 'Carlos Martínez', 'Laura Sánchez', 'Miguel López',
  'Elena Rodríguez', 'Pablo Fernández', 'Sofía González', 'Javier Torres',
  'Marta Díaz', 'Andrés Ruiz', 'Carmen Moreno', 'David Jiménez',
  'Isabel Navarro', 'Sergio Romero', 'Lucía Álvarez', 'Raúl Herrero',
  'Patricia Molina', 'Antonio Suárez', 'Cristina Castro', 'Fernando Ortega',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function generateLeads(count = 180): SeedLead[] {
  const rng = seededRandom(42);
  const now = new Date('2026-05-20T10:00:00Z');
  const leads: SeedLead[] = [];

  for (let i = 0; i < count; i++) {
    const daysAgo = rng() * 90;
    const createdAt = new Date(now.getTime() - daysAgo * 86400000);

    const type: 'compra' | 'alquiler' = rng() < 0.68 ? 'compra' : 'alquiler';
    const propertyTypes: Array<'piso' | 'casa' | 'local' | 'oficina'> = ['piso', 'piso', 'piso', 'casa', 'local', 'oficina'];
    const propertyType = pick(propertyTypes, rng);

    const budget = type === 'compra'
      ? randomInt(150000, 750000, rng)
      : randomInt(800, 3500, rng);

    const urgencyMonths = randomInt(1, 12, rng);
    const needsFinancing = type === 'compra' ? rng() < 0.62 : false;

    const hasBudget = budget > 0;
    const hasZone = true;
    const isUrgent = urgencyMonths <= 3;
    const score = [hasBudget, hasZone, isUrgent].filter(Boolean).length;
    const status: LeadStatus = score === 3 ? LEAD_STATUS.HOT : score === 2 ? LEAD_STATUS.WARM : LEAD_STATUS.COLD;

    // Distribución de fuentes más realista
    const sourceWeights: Array<[LeadSource, number]> = [
      [LEAD_SOURCES.WHATSAPP_DIRECT, 0.38],
      [LEAD_SOURCES.PORTAL, 0.31],
      [LEAD_SOURCES.INSTAGRAM, 0.16],
      [LEAD_SOURCES.REFERRAL, 0.09],
      [LEAD_SOURCES.WEB, 0.06],
    ];
    let sourceRoll = rng();
    let source: LeadSource = LEAD_SOURCES.WHATSAPP_DIRECT;
    for (const [src, weight] of sourceWeights) {
      if (sourceRoll < weight) { source = src; break; }
      sourceRoll -= weight;
    }

    // Visitas: solo los CALIENTE tienen visitas agendadas (~70%)
    const visitScheduled = status === LEAD_STATUS.HOT && rng() < 0.70;
    const visitCompleted = visitScheduled && createdAt < new Date(now.getTime() - 2 * 86400000) && rng() < 0.75;

    leads.push({
      id: `seed-${i.toString().padStart(4, '0')}`,
      createdAt,
      phoneNumber: `+346${String(600000000 + i).slice(1)}`,
      name: pick(NAMES, rng),
      type,
      propertyType,
      zone: pick(ZONES, rng),
      budget,
      urgencyMonths,
      needsFinancing,
      status,
      source,
      messagesCount: randomInt(4, 18, rng),
      firstResponseMs: randomInt(800, 3200, rng),
      visitScheduled,
      visitCompleted,
    });
  }

  return leads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Singleton para no regenerar en cada request
let _cache: SeedLead[] | null = null;
export function getSeedLeads(): SeedLead[] {
  if (!_cache) _cache = generateLeads();
  return _cache;
}
