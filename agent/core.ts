import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { buildSystemPrompt } from './prompts';
import { AgentResponse, ConversationMessage } from './types';

const genAI = new GoogleGenerativeAI(CONFIG.gemini.apiKey);

export async function getAgentResponse(
  messages: ConversationMessage[],
  userMessage: string
): Promise<AgentResponse> {
  const model = genAI.getGenerativeModel({
    model: CONFIG.gemini.model,
    systemInstruction: buildSystemPrompt(),
  });

  const history = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });

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

function parseAgentResponse(raw: string): AgentResponse {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn('Respuesta del agente sin JSON válido, usando fallback');
    return {
      message: raw.trim() || 'Disculpa, ¿podrías repetirme lo que buscas?',
      extracted: {
        type: null, propertyType: null, zone: null, budget: null,
        needsFinancing: null, urgencyMonths: null, name: null, phone: null,
      },
      isQualified: false,
    };
  }

  try {
    return JSON.parse(jsonMatch[0]) as AgentResponse;
  } catch {
    logger.warn('JSON del agente malformado', { raw });
    return {
      message: raw.trim(),
      extracted: {
        type: null, propertyType: null, zone: null, budget: null,
        needsFinancing: null, urgencyMonths: null, name: null, phone: null,
      },
      isQualified: false,
    };
  }
}
