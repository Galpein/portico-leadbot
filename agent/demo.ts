import { ConversationMessage, LeadData, AgentResponse } from './types';
import { CONFIG } from '../config/constants';

// Extrae todos los datos reconocibles de un mensaje, sin importar el orden
function extractFromMessage(text: string, current: LeadData): Partial<LeadData> {
  const t = text.toLowerCase();
  const result: Partial<LeadData> = {};

  // Tipo de operación
  if (!current.type) {
    if (/comprar?|compra|adquirir|adquisici[oó]n/.test(t)) result.type = 'compra';
    else if (/alquil[ae]r?|arrendar?|rentar?|alquilo/.test(t)) result.type = 'alquiler';
  }

  // Tipo de inmueble
  if (!current.propertyType) {
    if (/piso|apartamento|[aá]tico|estudio|d[uú]plex/.test(t)) result.propertyType = 'piso';
    else if (/casa|chalet|adosado|unifamiliar|pareado|villa/.test(t)) result.propertyType = 'casa';
    else if (/local|comercial|tienda|negocio/.test(t)) result.propertyType = 'local';
    else if (/oficina|despacho|coworking/.test(t)) result.propertyType = 'oficina';
  }

  // Zona (busca menciones de barrios/ciudades conocidas o "en X")
  if (!current.zone) {
    const zoneMatch = t.match(
      /(?:en|zona?|barrio|por|cerca de)\s+([a-záéíóúüñ\s]{3,25}?)(?:\s*[,.]|$)/
    );
    const knownZones: Record<string, string> = {
      'centro': 'Centro', 'salamanca': 'Salamanca', 'retiro': 'Retiro',
      'chamberí': 'Chamberí', 'chamberi': 'Chamberí', 'malasaña': 'Malasaña',
      'chueca': 'Chueca', 'lavapiés': 'Lavapiés', 'lavapies': 'Lavapiés',
      'carabanchel': 'Carabanchel', 'vallecas': 'Vallecas', 'hortaleza': 'Hortaleza',
      'pozuelo': 'Pozuelo', 'majadahonda': 'Majadahonda', 'alcobendas': 'Alcobendas',
      'getafe': 'Getafe', 'leganés': 'Leganés', 'leganes': 'Leganés',
      'eixample': 'Eixample', 'gràcia': 'Gràcia', 'gracia': 'Gràcia',
      'barceloneta': 'Barceloneta', 'poblenou': 'Poblenou',
      'ruzafa': 'Ruzafa', 'benimaclet': 'Benimaclet',
      'triana': 'Triana', 'nervión': 'Nervión', 'nervion': 'Nervión',
    };
    for (const [key, val] of Object.entries(knownZones)) {
      if (t.includes(key)) { result.zone = val; break; }
    }
    if (!result.zone && zoneMatch?.[1]) {
      const candidate = zoneMatch[1].trim();
      if (candidate.length >= 3 && candidate.length <= 25) result.zone = capitalize(candidate);
    }
  }

  // Presupuesto — detecta números con contexto de precio
  if (!current.budget) {
    const budgetMatch = t.match(
      /(\d[\d.,]*)\s*(?:k|mil(?:es)?|euros?|€|mill?(?:ones?)?)?(?:\s*(?:de\s+)?(?:euros?|€|presupuesto|máximo|tope|límite))?/
    );
    if (budgetMatch) {
      let raw = budgetMatch[1].replace(/\./g, '').replace(',', '.');
      let num = parseFloat(raw);
      if (t.includes(' k') || t.match(/\d\s*k\b/)) num *= 1000;
      if (t.includes('millón') || t.includes('million') || t.includes(' m ')) num *= 1000000;
      // Solo considera números con sentido como presupuesto inmobiliario
      if (num >= 500 && num <= 10000000) result.budget = Math.round(num);
    }
  }

  // Urgencia en meses
  if (!current.urgencyMonths) {
    if (/ya|ahora|inmediato|cuanto antes|urgente|hoy|esta semana/.test(t)) {
      result.urgencyMonths = 1;
    } else {
      const monthMatch = t.match(/(\d+)\s*mes(?:es)?/);
      const weekMatch = t.match(/(\d+)\s*semanas?/);
      const yearMatch = t.match(/(\d+)\s*a[ñn]o[s]?/);
      if (monthMatch) result.urgencyMonths = parseInt(monthMatch[1], 10);
      else if (weekMatch) result.urgencyMonths = Math.ceil(parseInt(weekMatch[1], 10) / 4);
      else if (yearMatch) result.urgencyMonths = parseInt(yearMatch[1], 10) * 12;
      else if (/este año|este verano|antes de navidad|a finales/.test(t)) result.urgencyMonths = 6;
      else if (/sin prisa|con calma|no hay urgencia|cuando sea|poco a poco/.test(t)) result.urgencyMonths = 12;
    }
  }

  // Financiación
  if (current.needsFinancing === null) {
    if (/hipoteca|financiaci[oó]n|banco|pr[eé]stamo|necesito financiar|con financiaci[oó]n|s[ií] necesito|financiado/.test(t)) {
      result.needsFinancing = true;
    } else if (/contado|sin hipoteca|sin financiaci[oó]n|efectivo|cash|no necesito financiaci[oó]n|al contado/.test(t)) {
      result.needsFinancing = false;
    }
  }

  // Nombre
  if (!current.name) {
    const nameMatch = t.match(/(?:me llamo|soy|mi nombre es|llámame)\s+([a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+)?)/i);
    if (nameMatch) result.name = capitalize(nameMatch[1].trim());
  }

  return result;
}

// Decide qué pregunta hacer según lo que falta
function nextQuestion(data: LeadData): string {
  const agency = CONFIG.agency.name;

  if (!data.type) {
    return `¡Hola! Soy del equipo de ${agency}. ¿Estás buscando comprar o alquilar?`;
  }
  if (!data.propertyType) {
    return `Perfecto. ¿Qué tipo de inmueble tienes en mente? ¿Piso, casa, local...?`;
  }
  if (!data.zone) {
    return `¿En qué zona o barrio te gustaría que estuviera?`;
  }
  if (!data.budget) {
    return `¿Tienes un presupuesto máximo en mente?`;
  }
  if (!data.urgencyMonths) {
    return `¿Y cuándo necesitarías poder mudarte o cerrar la operación?`;
  }
  if (data.needsFinancing === null) {
    return `¿Necesitarías financiación bancaria o sería al contado?`;
  }
  if (!data.name) {
    return `¡Genial, ya tengo todo lo que necesito! ¿Me dices tu nombre para personalizar la búsqueda?`;
  }
  return `Perfecto, ${data.name}. Un asesor te contactará hoy mismo con las mejores opciones. ¡Muchas gracias por contactarnos!`;
}

function buildResponse(text: string, current: LeadData): AgentResponse {
  const t = text.toLowerCase();

  // Saludo inicial — respuesta especial
  const isGreeting = /^(hola|buenas?|buenos? d[ií]as?|buenas? tardes?|buenas? noches?|hi|hey|ey|buen[ao]s)\W*$/.test(t.trim());

  const extracted = extractFromMessage(text, current);
  const merged: LeadData = { ...current, ...extracted };

  const isQualified =
    merged.type !== null &&
    merged.budget !== null &&
    merged.zone !== null &&
    merged.urgencyMonths !== null;

  let message: string;

  if (isGreeting && !current.type) {
    message = `¡Hola! Encantado de atenderte. Soy del equipo de ${CONFIG.agency.name}. ¿Estás buscando comprar o alquilar?`;
  } else if (Object.keys(extracted).length === 0) {
    // No se extrajo nada nuevo — respuesta genérica empujando hacia lo que falta
    message = nextQuestion(current);
  } else {
    // Se extrajo algo — confirma y pregunta lo siguiente
    const confirmations: string[] = [];
    if (extracted.type) confirmations.push(extracted.type === 'compra' ? 'compra' : 'alquiler');
    if (extracted.propertyType) confirmations.push(extracted.propertyType);
    if (extracted.zone) confirmations.push(`zona ${extracted.zone}`);
    if (extracted.budget) confirmations.push(`presupuesto ${extracted.budget.toLocaleString('es-ES')}€`);
    if (extracted.urgencyMonths) {
      confirmations.push(
        extracted.urgencyMonths <= 1 ? 'urgencia inmediata' : `en ${extracted.urgencyMonths} meses`
      );
    }

    const confirm = confirmations.length > 0 ? `Entendido, ${confirmations.join(', ')}. ` : '';
    message = confirm + nextQuestion(merged);
  }

  return { message, extracted: merged, isQualified };
}

export async function getDemoAgentResponse(
  _messages: ConversationMessage[],
  userMessage: string,
  currentData: LeadData
): Promise<AgentResponse> {
  await simulateDelay();
  return buildResponse(userMessage, currentData);
}

function simulateDelay(): Promise<void> {
  const delay = 800 + Math.random() * 700;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
