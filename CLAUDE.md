# LeadBot — Agente cualificador de leads para inmobiliarias

## Qué es este proyecto
Sistema completo con tres partes:
1. **Agente WhatsApp**: cualifica leads automáticamente y agenda visitas
2. **Dashboard con métricas**: panel de control para la inmobiliaria
3. **Landing page**: página de venta del producto para captar clientes

## Estructura de carpetas
- `agent/` → lógica del agente, prompts, sesiones
- `webhook/` → recibe mensajes de WhatsApp Business
- `qualifier/` → scoring y clasificación de leads
- `calendar/` → integración Google Calendar
- `sheets/` → lectura/escritura Google Sheets
- `dashboard/` → frontend del panel de métricas (HTML/CSS/JS)
- `landing/` → landing page de venta (HTML/CSS/JS)
- `api/` → endpoints REST que alimentan el dashboard
- `config/` → variables de entorno y constantes
- `data/` → datos de ejemplo para demos con clientes

## Stack técnico
- Backend: TypeScript + Express
- Agente: Claude API (claude-sonnet-4-20250514)
- Automatización: n8n o Make
- Mensajería: WhatsApp Business API
- Datos: Google Sheets + Google Calendar
- Frontend: HTML/CSS/JS vanilla (sin frameworks, fácil de desplegar)

## Reglas de código
- Todo en TypeScript, sin any salvo casos extremos
- Variables de entorno siempre en `.env`, nunca hardcodeadas
- Cada función con un propósito único, máximo 40 líneas
- Los prompts del agente van en `agent/prompts.ts`, nunca inline
- Logs con nivel: info / warn / error. Sin console.log sueltos
- Manejo de errores explícito en cada llamada externa
- Los datos de demo van en `data/seed.ts`, separados de la lógica real

## Flujo principal del agente
1. WhatsApp manda webhook → `webhook/handler.ts`
2. Se recupera o crea conversación → `agent/session.ts`
3. El agente responde → `agent/core.ts` usando Claude API
4. Con datos suficientes → `qualifier/score.ts` evalúa el lead
5. Si lead es CALIENTE → `calendar/booking.ts` agenda visita
6. Estado guardado → `sheets/leads.ts`
7. Métricas actualizadas → `api/metrics.ts`

## Clasificación de leads
- CALIENTE: presupuesto + zona + urgencia < 3 meses
- TIBIO: 2 de los 3 criterios anteriores
- FRÍO: 0 o 1 criterio

## Métricas que expone el dashboard
- Leads totales del mes / semana / hoy
- Tasa de conversión por estado (caliente / tibio / frío)
- Tiempo medio de respuesta del agente
- Visitas agendadas vs realizadas
- Leads perdidos por horario (fuera de horario laboral)
- Gráfico de leads por día (últimos 30 días)
- Gráfico de distribución por zona geográfica
- Ranking de fuentes de lead (portal, WhatsApp directo, Instagram, etc.)
- ROI estimado: comisiones potenciales vs coste del servicio

## Landing page — secciones obligatorias
1. Hero con propuesta de valor clara y CTA
2. Problema que resuelve (sin jerga técnica)
3. Cómo funciona (3 pasos visuales)
4. Métricas de impacto (datos simulados convincentes)
5. Testimonio/caso de uso ficticio pero realista
6. Precio (setup + cuota mensual)
7. CTA final con formulario de contacto

## Demo para clientes
- Todos los datos del dashboard son simulados pero realistas
- El chat de WhatsApp debe poder simularse en vivo durante la reunión
- El archivo `data/seed.ts` genera datos de los últimos 90 días
- La demo debe funcionar sin conexión a internet (datos estáticos)
- El agente en demo responde con delays simulados para parecer real

## Variables de entorno necesarias
WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, CLAUDE_API_KEY,
GOOGLE_SHEET_ID, GOOGLE_CREDENTIALS_PATH, CALENDAR_ID,
PORT, NODE_ENV, DEMO_MODE

## Lo que NO hacer
- No mezclar datos reales y de demo en el mismo módulo
- No guardar mensajes completos en Sheets (solo datos cualificados)
- No llamar a Claude con historial completo cada vez (resumir)
- No reintentar más de 2 veces una llamada fallida
- No modificar prompts del agente sin actualizar `agent/prompts.ts`
- No hardcodear precios ni textos de la landing (van en `config/copy.ts`)