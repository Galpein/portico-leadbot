import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  whatsapp: {
    // 'meta'   = WhatsApp Cloud API (graph.facebook.com)
    // 'twilio' = Twilio (sandbox gratis para pruebas, sin verificación de Meta)
    provider: (process.env.WHATSAPP_PROVIDER ?? 'meta') as 'meta' | 'twilio',
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneId: process.env.WHATSAPP_PHONE_ID ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    // Número del sandbox de Twilio por defecto (+1 415 523 8886)
    from: process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886',
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY ?? '',
    // claude-sonnet-4-20250514 está deprecado (se retira el 15/06/2026).
    // claude-sonnet-4-6 es mejor y más barato (3 $/15 $ por millón de tokens).
    model: 'claude-sonnet-4-6',
    maxTokens: 500,
    maxHistoryMessages: 10,
  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID ?? '',
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH ?? '',
    calendarId: process.env.CALENDAR_ID ?? '',
  },
  server: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  },
  demo: {
    enabled: process.env.DEMO_MODE === 'true',
    responseDelayMs: 1500,
  },
  agency: {
    name: process.env.AGENCY_NAME ?? 'Inmobiliaria Premium',
    phone: process.env.AGENCY_PHONE ?? '+34 91 123 45 67',
    businessHoursStart: parseInt(process.env.BUSINESS_HOURS_START ?? '9', 10),
    businessHoursEnd: parseInt(process.env.BUSINESS_HOURS_END ?? '20', 10),
  },
};

export const LEAD_STATUS = {
  HOT: 'CALIENTE',
  WARM: 'TIBIO',
  COLD: 'FRÍO',
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const LEAD_SOURCES = {
  WHATSAPP_DIRECT: 'WhatsApp Directo',
  PORTAL: 'Portal Inmobiliario',
  INSTAGRAM: 'Instagram',
  REFERRAL: 'Referido',
  WEB: 'Web',
} as const;

export type LeadSource = (typeof LEAD_SOURCES)[keyof typeof LEAD_SOURCES];
