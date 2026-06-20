import { CONFIG } from '../config/constants';
import { logger } from '../config/logger';

interface OutgoingMessage {
  to: string;
  text: string;
}

function withPrefix(num: string): string {
  return num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;
}

// Envía un mensaje de WhatsApp a través de Twilio.
// Si no hay credenciales, solo loguea (modo demo seguro).
export async function sendTwilioMessage({ to, text }: OutgoingMessage): Promise<void> {
  const { accountSid, authToken, from } = CONFIG.twilio;

  if (!accountSid || !authToken) {
    logger.info(`[Twilio sin credenciales] Mensaje a ${to}: ${text}`);
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({
    From: withPrefix(from),
    To: withPrefix(to),
    Body: text,
  });

  let attempt = 0;
  while (attempt < 2) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Twilio API ${res.status}: ${detail}`);
      }

      logger.info(`Mensaje enviado a ${to} vía Twilio`);
      return;
    } catch (err) {
      attempt++;
      logger.error(`Error enviando WhatsApp por Twilio (intento ${attempt}/2)`, err);
      if (attempt >= 2) throw err;
    }
  }
}

// Twilio envía el webhook como form-urlencoded: From="whatsapp:+34...", Body="..."
export function extractTwilioMessage(body: unknown): {
  phoneNumber: string;
  text: string;
} | null {
  try {
    const b = body as Record<string, string>;
    const phoneNumber = String(b.From ?? '').replace(/^whatsapp:/, '').trim();
    const text = String(b.Body ?? '').trim();

    if (!phoneNumber || !text) return null;

    return { phoneNumber, text };
  } catch {
    return null;
  }
}
