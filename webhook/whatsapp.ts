import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';
import { sendTwilioMessage } from './twilio';

interface WhatsAppMessage {
  to: string;
  text: string;
}

export async function sendWhatsAppMessage({ to, text }: WhatsAppMessage): Promise<void> {
  // Twilio: envía de verdad aunque DEMO_MODE=true.
  // Así puedes probar WhatsApp real con el cerebro regex gratis (sin Claude).
  if (CONFIG.whatsapp.provider === 'twilio') {
    return sendTwilioMessage({ to, text });
  }

  if (CONFIG.demo.enabled) {
    logger.info(`[DEMO] Mensaje enviado a ${to}: ${text}`);
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${CONFIG.whatsapp.phoneId}/messages`;

  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CONFIG.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`WhatsApp API error ${res.status}: ${body}`);
      }

      logger.info(`Mensaje enviado a ${to}`);
      return;
    } catch (err) {
      attempt++;
      logger.error(`Error enviando mensaje WhatsApp (intento ${attempt}/2)`, err);
      if (attempt >= 2) throw err;
    }
  }
}

export function extractIncomingMessage(body: unknown): {
  phoneNumber: string;
  text: string;
} | null {
  try {
    const payload = body as Record<string, unknown>;
    const entry = (payload.entry as Record<string, unknown>[])?.[0];
    const changes = (entry?.changes as Record<string, unknown>[])?.[0];
    const value = changes?.value as Record<string, unknown>;
    const messages = value?.messages as Record<string, unknown>[];
    const message = messages?.[0];

    if (!message || message.type !== 'text') return null;

    const phoneNumber = String((message.from as string) ?? '');
    const text = String(((message.text as Record<string, string>)?.body) ?? '');

    if (!phoneNumber || !text) return null;

    return { phoneNumber, text };
  } catch {
    return null;
  }
}
