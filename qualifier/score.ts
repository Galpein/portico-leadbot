import { LeadData } from '../agent/types';
import { LEAD_STATUS, LeadStatus } from '../config/constants';

interface ScoreResult {
  status: LeadStatus;
  score: number;
  criteria: {
    hasBudget: boolean;
    hasZone: boolean;
    isUrgent: boolean;
  };
}

export function scoreLead(data: LeadData): ScoreResult {
  const hasBudget = data.budget !== null && data.budget > 0;
  const hasZone = data.zone !== null && data.zone.trim().length > 0;
  const isUrgent = data.urgencyMonths !== null && data.urgencyMonths <= 3;

  const score = [hasBudget, hasZone, isUrgent].filter(Boolean).length;

  let status: LeadStatus;
  if (score === 3) {
    status = LEAD_STATUS.HOT;
  } else if (score === 2) {
    status = LEAD_STATUS.WARM;
  } else {
    status = LEAD_STATUS.COLD;
  }

  return {
    status,
    score,
    criteria: { hasBudget, hasZone, isUrgent },
  };
}

export function isReadyToQualify(data: LeadData): boolean {
  return (
    data.type !== null &&
    (data.budget !== null || data.zone !== null)
  );
}
