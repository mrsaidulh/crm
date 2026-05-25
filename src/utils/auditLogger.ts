import type { AuditLog } from '../types';

interface LogParams {
  action: string;
  entityType?: 'lead' | 'task' | 'campaign' | 'template' | 'workflow' | 'system';
  entityId?: string;
  details: string;
}

export async function logAuditEvent(params: LogParams): Promise<void> {
  let userId = 'ielts_crm_main_user';
  
  try {
    const activeSession = localStorage.getItem('crm_active_session');
    if (activeSession) {
      const sessionUser = JSON.parse(activeSession);
      if (sessionUser && sessionUser.uid) {
        userId = sessionUser.uid;
      }
    }
  } catch (e) {
    // Fail-safe fallback to admin user
  }
  
  const logData = {
    userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    details: params.details,
    createdAt: Date.now()
  };

  try {
    // Log to MySQL Express backend to support standalone and cPanel deployments
    await fetch('/api/audit-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(logData)
    });
  } catch (apiErr) {
    console.error('[Audit Logger] Failed to save log to API:', apiErr);
  }
}

