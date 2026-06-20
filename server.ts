import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { CONFIG } from './config/constants';
import { logger } from './config/logger';
import {
  verifyWebhook,
  handleIncomingMessage,
  handleHealthCheck,
  handleDemoMessage,
} from './webhook/handler';
import { initializeSheet } from './sheets/leads';
import {
  getSummary,
  getConversion,
  getTimeline,
  getSources,
  getRoi,
  getResponseTime,
  getRecentLeads,
} from './api/metrics';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de requests
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', handleHealthCheck);

// WhatsApp webhook
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleIncomingMessage);

// Demo endpoint (simula mensajes entrantes sin WhatsApp real)
app.post('/demo/message', handleDemoMessage);

// Reset de sesión (solo demo/dev)
app.post('/demo/reset', (req, res) => {
  const { resetSession, resetAllSessions } = require('./agent/session');
  const { phoneNumber } = req.body as { phoneNumber?: string };
  if (phoneNumber) {
    resetSession(phoneNumber);
    res.json({ ok: true, reset: phoneNumber });
  } else {
    resetAllSessions();
    res.json({ ok: true, reset: 'all' });
  }
});

// Métricas
app.get('/metrics/summary',       getSummary);
app.get('/metrics/conversion',    getConversion);
app.get('/metrics/timeline',      getTimeline);
app.get('/metrics/sources',       getSources);
app.get('/metrics/roi',           getRoi);
app.get('/metrics/response-time', getResponseTime);
app.get('/metrics/leads/recent',  getRecentLeads);

// Sirve archivos estáticos desde la raíz del proyecto
app.use(express.static('.'));
app.use('/dashboard', express.static('./dashboard'));
app.use('/landing', express.static('./landing'));

async function start(): Promise<void> {
  await initializeSheet().catch(() => {
    logger.warn('Sheets no inicializado (normal en modo demo)');
  });

  app.listen(CONFIG.server.port, () => {
    logger.info(`LeadBot arrancado en puerto ${CONFIG.server.port}`);
    logger.info(`Modo demo: ${CONFIG.demo.enabled}`);
    logger.info(`Agencia: ${CONFIG.agency.name}`);
  });
}

start().catch((err) => {
  logger.error('Error fatal al arrancar el servidor', err);
  process.exit(1);
});
