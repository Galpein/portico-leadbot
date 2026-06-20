import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { buildSystemPrompt } from './prompts';
import { AgentResponse, ConversationMessage } from './types';

const client = new Anthropic({ apiKey: CONFIG.claude.apiKey });

export async function getAgentResponse(
  messages: ConversationMessage[],
  userMessage: string
): Promise<AgentResponse> {
  const history = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  history.push({ role: 'user', content: userMessage });

  let attempt = 0;
  while (attempt < 2) {
    try {
      const response = await client.messages.create({
        model: CONFIG.claude.model,
        max_tokens: CONFIG.claude.maxTokens,
        system: buildSystemPrompt(),
        messages: history,
      });

      const rawText =
        response.content[0].type === 'text' ? response.content[0].text : '';

      return parseAgentResponse(rawText);
    } catch (err) {
      attempt++;
      logger.error(`Error llamando a Claude (intento ${attempt}/2)`, err);
      if (attempt >= 2) throw err;
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
        type: null,
        propertyType: null,
        zone: null,
        budget: null,
        needsFinancing: null,
        urgencyMonths: null,
        name: null,
        phone: null,
      },
      isQualified: false,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as AgentResponse;
    return parsed;
  } catch {
    logger.warn('JSON del agente malformado', { raw });
    return {
      message: raw.trim(),
      extracted: {
        type: null,
        propertyType: null,
        zone: null,
        budget: null,
        needsFinancing: null,
        urgencyMonths: null,
        name: null,
        phone: null,
      },
      isQualified: false,
    };
  }
}
