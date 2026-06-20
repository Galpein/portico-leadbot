import { Request, Response } from 'express';
import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { extractIncomingMessage, sendWhatsAppMessage } from './whatsapp';
import { extractTwilioMessage } from './twilio';
import {
  getOrCreateSession,
  addMessage,
  updateLeadData,
  updateStatus,
  markQualified,
  getRecentMessages,
  truncateHistory,
} from '../agent/session';
import { getAgentResponse } from '../agent/core';
import { getDemoAgentResponse } from '../agent/demo';
import { scoreLead } from '../qualifier/score';
import { saveLead } from '../sheets/leads';
import { COPY } from '../config/copy';

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.whatsapp.verifyToken) {
    logger.info('Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    logger.warn('Verificación de webhook fallida');
    res.status(403).send('Forbidden');
  }
}

export async function handleIncomingMessage(req: Request, res: Response): Promise<void> {
  // Responder de inmediato para evitar reintentos del proveedor.
  // Twilio espera TwiML; Meta acepta un 200 simple.
  if (CONFIG.whatsapp.provider === 'twilio') {
    res.type('text/xml').send('<Response></Response>');
  } else {
    res.status(200).json({ status: 'ok' });
  }

  const incoming =
    CONFIG.whatsapp.provider === 'twilio'
      ? extractTwilioMessage(req.body)
      : extractIncomingMessage(req.body);
  if (!incoming) {
    logger.info('Webhook recibido sin mensaje de texto procesable');
    return;
  }

  const { phoneNumber, text } = incoming;
  logger.info(`Mensaje entrante de ${phoneNumber}: "${text}"`);

  const session = getOrCreateSession(phoneNumber);

  addMessage(phoneNumber, {
    role: 'user',
    content: text,
    timestamp: new Date(),
  });

  truncateHistory(phoneNumber, CONFIG.claude.maxHistoryMessages);

  try {
    const recentMessages = getRecentMessages(phoneNumber, CONFIG.claude.maxHistoryMessages);
    const contextMessages = recentMessages.slice(0, -1); // sin el último (ya es el userMessage)

    const agentResult = CONFIG.demo.enabled
      ? await getDemoAgentResponse(contextMessages, text, session.leadData)
      : await getAgentResponse(contextMessages, text);

    addMessage(phoneNumber, {
      role: 'assistant',
      content: agentResult.message,
      timestamp: new Date(),
    });

    updateLeadData(phoneNumber, agentResult.extracted);

    const updatedSession = getOrCreateSession(phoneNumber);
    const scoreResult = scoreLead(updatedSession.leadData);
    updateStatus(phoneNumber, scoreResult.status);

    if (agentResult.isQualified && !session.isQualified) {
      markQualified(phoneNumber);
      logger.info(`Lead ${phoneNumber} cualificado — estado: ${scoreResult.status}`);
      await saveLead(updatedSession);
    }

    await sendWhatsAppMessage({ to: phoneNumber, text: agentResult.message });
  } catch (err) {
    logger.error(`Error procesando mensaje de ${phoneNumber}`, err);

    const fallback = '¡Vaya! Ha habido un pequeño problema. ¿Puedes repetirme lo que buscas?';
    await sendWhatsAppMessage({ to: phoneNumber, text: fallback }).catch(() => null);
  }
}

export function handleHealthCheck(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    demo: CONFIG.demo.enabled,
    agency: CONFIG.agency.name,
    timestamp: new Date().toISOString(),
  });
}

// Endpoint para simular un mensaje entrante (solo en demo/dev)
export async function handleDemoMessage(req: Request, res: Response): Promise<void> {
  if (!CONFIG.demo.enabled && CONFIG.server.nodeEnv !== 'development') {
    res.status(403).json({ error: 'Solo disponible en modo demo' });
    return;
  }

  const { phoneNumber, text } = req.body as { phoneNumber?: string; text?: string };

  if (!phoneNumber || !text) {
    res.status(400).json({ error: 'Se requieren phoneNumber y text' });
    return;
  }

  const session = getOrCreateSession(phoneNumber);

  addMessage(phoneNumber, {
    role: 'user',
    content: text,
    timestamp: new Date(),
  });

  truncateHistory(phoneNumber, CONFIG.claude.maxHistoryMessages);

  try {
    const recentMessages = getRecentMessages(phoneNumber, CONFIG.claude.maxHistoryMessages);
    const contextMessages = recentMessages.slice(0, -1);

    const agentResult = CONFIG.demo.enabled
      ? await getDemoAgentResponse(contextMessages, text, session.leadData)
      : await getAgentResponse(contextMessages, text);

    addMessage(phoneNumber, {
      role: 'assistant',
      content: agentResult.message,
      timestamp: new Date(),
    });

    updateLeadData(phoneNumber, agentResult.extracted);

    const updatedSession = getOrCreateSession(phoneNumber);
    const scoreResult = scoreLead(updatedSession.leadData);
    updateStatus(phoneNumber, scoreResult.status);

    if (agentResult.isQualified && !session.isQualified) {
      markQualified(phoneNumber);
    }

    res.status(200).json({
      message: agentResult.message,
      session: {
        status: scoreResult.status,
        leadData: updatedSession.leadData,
        isQualified: agentResult.isQualified,
        messagesCount: updatedSession.messagesCount,
      },
    });
  } catch (err) {
    logger.error('Error en demo message', err);
    res.status(500).json({ error: 'Error interno del agente' });
  }
}

function buildWelcomeMessage(): string {
  const hour = new Date().getHours();
  const { businessHoursStart, businessHoursEnd, name } = CONFIG.agency;
  const isInHours = hour >= businessHoursStart && hour < businessHoursEnd;

  if (isInHours) {
    return COPY.agent.welcome.replace('{{agencyName}}', name);
  }

  return COPY.agent.outOfHours
    .replace('{{hours}}', `${businessHoursStart}:00–${businessHoursEnd}:00`)
    .replace('{{agencyName}}', name);
}
