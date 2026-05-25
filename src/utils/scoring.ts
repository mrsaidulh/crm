import type { Lead } from '../types';

export interface ScoreBreakdown {
  score: number;
  maxScore: number;
  level: 'Hot' | 'Warm' | 'Cold';
  color: string;
  badgeBg: string;
  badgeText: string;
  details: {
    category: string;
    points: number;
    description: string;
  }[];
}

export function calculateLeadScore(lead: Lead): ScoreBreakdown {
  let score = 0;
  const maxScore = 150; // Cap at 150 for visual representation or keep it open
  const details: ScoreBreakdown['details'] = [];

  // 1. Profile Completeness (Max 40 pts)
  let profilePoints = 0;
  if (lead.email) profilePoints += 5;
  if (lead.phone) profilePoints += 5;
  if (lead.targetCourse) profilePoints += 10;
  if (lead.targetBand) profilePoints += 10;
  if (lead.destination) profilePoints += 10;
  
  if (profilePoints > 0) {
    score += profilePoints;
    details.push({
      category: 'Profile Completeness',
      points: profilePoints,
      description: `Basic info completed: ${[
        lead.email ? 'Email' : '',
        lead.phone ? 'Phone' : '',
        lead.targetCourse ? 'Course' : '',
        lead.targetBand ? 'Band' : '',
        lead.destination ? 'Country' : ''
      ].filter(Boolean).join(', ')}`
    });
  }

  // 2. Communications & Interactions (Max 50 pts)
  let commPoints = 0;
  let interactionCount = 0;
  let campaignInteractionBonus = 0;

  if (lead.communications && lead.communications.length > 0) {
    lead.communications.forEach(comm => {
      // points by type
      if (comm.type === 'Meeting') commPoints += 15;
      else if (comm.type === 'Call') commPoints += 10;
      else if (comm.type === 'Email') commPoints += 8;
      else if (comm.type === 'SMS') commPoints += 8;
      else if (comm.type === 'Note') commPoints += 4;

      // Detect interaction with email/SMS campaign or marketing links
      const summaryLower = comm.summary.toLowerCase();
      if (
        summaryLower.includes('opened') || 
        summaryLower.includes('clicked') || 
        summaryLower.includes('replied') || 
        summaryLower.includes('campaign') ||
        summaryLower.includes('newsletter') ||
        summaryLower.includes('responded')
      ) {
        campaignInteractionBonus += 10; // Extra bonus points for high engagement/campaign interaction
      }
      interactionCount++;
    });
  }

  if (commPoints > 0) {
    // Cap communication points to 50 to prevent overflow
    const totalCommPoints = Math.min(commPoints + campaignInteractionBonus, 50);
    score += totalCommPoints;
    details.push({
      category: 'Activity & Communications',
      points: totalCommPoints,
      description: `${interactionCount} activity log(s) found. Includes call/email/meeting records${campaignInteractionBonus > 0 ? ` with ${campaignInteractionBonus} pts campaign engagement bonus` : ''}.`
    });
  }

  // 3. Score Preferences (Max 25 pts)
  let prefPoints = 0;
  if (lead.preferences) {
    if (lead.preferences.preferredContactMethod && lead.preferences.preferredContactMethod !== 'Unknown' as any) prefPoints += 8;
    if (lead.preferences.studyMode && lead.preferences.studyMode !== 'Unknown' as any) prefPoints += 8;
    if (lead.preferences.timeline && lead.preferences.timeline !== 'Unknown') {
      if (lead.preferences.timeline === 'Immediately') prefPoints += 9;
      else prefPoints += 6;
    }
  }
  if (prefPoints > 0) {
    score += prefPoints;
    details.push({
      category: 'Preferences & Intention',
      points: prefPoints,
      description: `Target timeline: ${lead.preferences?.timeline || 'Unknown'}. Preferred mode: ${lead.preferences?.studyMode || 'Not specified'}.`
    });
  }

  // 4. Academic Mock Tests (Max 20 pts)
  let mockPoints = 0;
  if (lead.mockScores && lead.mockScores.length > 0) {
    mockPoints = Math.min(lead.mockScores.length * 10, 20); // 10 pts per test, cap at 20 pts
    score += mockPoints;
    details.push({
      category: 'Mock Assessment Participation',
      points: mockPoints,
      description: `Taken ${lead.mockScores.length} IELTS assessment test(s) showing strong intent.`
    });
  }

  // 5. Categorization Tags (Max 15 pts)
  let tagPoints = 0;
  if (lead.tags && lead.tags.length > 0) {
    tagPoints = Math.min(lead.tags.length * 3, 15); // 3 pts per tag, cap at 15
    score += tagPoints;
    details.push({
      category: 'Tags & Segmentation',
      points: tagPoints,
      description: `${lead.tags.length} segmentation labels added.`
    });
  }

  // Determine Level and Styles
  let level: 'Hot' | 'Warm' | 'Cold' = 'Cold';
  let color = 'text-blue-600';
  let badgeBg = 'bg-blue-100';
  let badgeText = 'text-blue-800';

  if (score >= 75) {
    level = 'Hot';
    color = 'text-rose-600';
    badgeBg = 'bg-rose-100';
    badgeText = 'text-rose-700';
  } else if (score >= 35) {
    level = 'Warm';
    color = 'text-amber-600';
    badgeBg = 'bg-amber-100';
    badgeText = 'text-amber-700';
  }

  return {
    score,
    maxScore,
    level,
    color,
    badgeBg,
    badgeText,
    details
  };
}
