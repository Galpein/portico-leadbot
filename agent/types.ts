import { LeadStatus, LeadSource } from '../config/constants';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface LeadData {
  type: 'compra' | 'alquiler' | null;
  propertyType: 'piso' | 'casa' | 'local' | 'oficina' | null;
  zone: string | null;
  budget: number | null;
  needsFinancing: boolean | null;
  urgencyMonths: number | null;
  name: string | null;
  phone: string | null;
}

export interface Session {
  id: string;
  phoneNumber: string;
  messages: ConversationMessage[];
  leadData: LeadData;
  status: LeadStatus;
  source: LeadSource;
  createdAt: Date;
  updatedAt: Date;
  isQualified: boolean;
  visitScheduled: boolean;
  visitDate?: string;
  messagesCount: number;
  firstResponseAt?: Date;
  lastResponseAt?: Date;
}

export interface AgentResponse {
  message: string;
  extracted: LeadData;
  isQualified: boolean;
}
