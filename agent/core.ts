import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { buildSystemPrompt } from './prompts';
import { AgentResponse, ConversationMessage } from './types';

const genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);

// Esquema que obliga a Gemini a devolver SIEMPRE un JSON con esta forma exacta.
const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    message: { type: SchemaType.STRING },
    extracted: {
      type: SchemaType.OBJECT,
      properties: {
        type: { type: SchemaType.STRING, nullable: true },
        propertyType: { type: SchemaType.STRING, nullable: true },
        zone: { type: SchemaType.STRING, nullable: true },
        budget: { type: SchemaType.NUMBER, nullable: true },
        needsFinancing: { type: SchemaType.BOOLEAN, nullable: true },
        urgencyMonths: { type: SchemaType.NUMBER, nullable: true },
        name: { type: SchemaType.STRING, nullable: true },
        phone: { type: SchemaType.STRING, nullable: true },
      },
      required: [
        'type', 'propertyType', 'zone', 'budget',
        'needsFinancing', 'urgencyMonths', 'name', 'phone',
      ],
    },
    isQualified: { type: SchemaType.BOOLEAN },
  },
  required: ['message', 'extracted', 'isQualified'],
};

// Gemini exige que el historial empiece con un mensaje de 'user'.
// Descartamos los mensajes 'model' iniciales que queden tras truncar.
function buildHistory(messages: ConversationMessage[]) {
  const mapped = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const firstUser = mapped.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : mapped.slice(firstUser);
}

export async function getAgentResponse(
  messages: ConversationMessage[],
  userMessage: string
): Promise<AgentResponse> {
  const model = genAI.getGenerativeModel({
    model: CONFIG.gemini.model,
    systemInstruction: buildSystemPrompt(),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const chat = model.startChat({ history: buildHistory(messages) });

  let attempt = 0;
  while (attempt < 2) {
    try {
      const result = await chat.sendMessage(userMessage);
      const rawText = result.response.text();
      return parseAgentResponse(rawText);
    } catch (err) {
      attempt++;
      logger.error(`Error llamando a Gemini (intento ${attempt}/2)`, err);
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error('No se pudo obtener respuesta del agente');
}

function emptyExtracted() {
  return {
    type: null, propertyType: null, zone: null, budget: null,
    needsFinancing: null, urgencyMonths: null, name: null, phone: null,
  };
}

function parseAgentResponse(raw: string): AgentResponse {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('Respuesta del agente sin JSON válido, usando fallback');
    return {
      message: raw.trim() || 'Disculpa, ¿podrías repetirme lo que buscas?',
      extracted: emptyExtracted(),
      isQualified: false,
    };
  }

  try {
    return JSON.parse(jsonMatch[0]) as AgentResponse;
  } catch {
    logger.warn('JSON del agente malformado', { raw });
    return {
      message: raw.trim(),
      extracted: emptyExtracted(),
      isQualified: false,
    };
  }
}
