import { firebaseService } from './firebaseService';
import { Lead, Campaign, AuditLog, Task, Template, WorkflowRule, UserSettings, TeamMember } from '../types';

// In-memory store for active OTP codes to verify phone numbers
const activeOtps = new Map<string, { code: string; expiresAt: number }>();

// Simple UUID generator for browser-only operations
const uuidv4 = (): string => {
  return 'uid_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
};

// Original native fetch
const originalFetch = globalThis.fetch;

// Custom mocked Response constructor support
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Serverless-Mock': 'true'
    }
  });
}

// Override global fetch safely using Object.defineProperty to bypass read-only getters on sandboxed environments
const interceptorFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlString = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  
  // Only intercept relative and absolute requests targeting /api/
  if (urlString.startsWith('/api/') || urlString.includes('://' + window.location.host + '/api/')) {
    try {
      const parsedUrl = new URL(urlString, window.location.origin);
      const pathname = parsedUrl.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const queryParams = Object.fromEntries(parsedUrl.searchParams.entries());
      
      // Parse body if present
      let body: any = null;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = null;
        }
      }

      console.log(`[API Interceptor] ${method} ${pathname}`, { queryParams, body });

      // --- OTP VERIFICATION ---
      if (pathname === '/api/otp/send' && method === 'POST') {
        const phone = body?.phone;
        if (!phone) return jsonResponse({ error: 'Phone number is required' }, 400);

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        activeOtps.set(phone, { code: otpCode, expiresAt });

        const smsMessage = `Your CRM verification code is: ${otpCode}. Valid for 5 minutes.`;
        console.log(`[API Interceptor] Simulated OTP for ${phone}: ${otpCode}`);

        // Try to fetch settings to see if SMS API is configured
        try {
          const settings = await firebaseService.getSettings('ielts_crm_main_user');
          if (settings && settings.smsApiKey) {
            let externalUrl = '';
            const cleanedPhone = phone.replace(/[^0-9+]/g, '');
            if (settings.smsProvider === 'bulk_sms_bd') {
               externalUrl = `http://bulksmsbd.com/api/smsapi?api_key=${encodeURIComponent(settings.smsApiKey)}&type=text&number=${encodeURIComponent(cleanedPhone)}&senderid=${encodeURIComponent(settings.smsSenderId || '8801844532633')}&message=${encodeURIComponent(smsMessage)}`;
            } else if (settings.smsProvider === 'sms_bd') {
               externalUrl = `https://sms.bd/api/v1/send?api_key=${encodeURIComponent(settings.smsApiKey)}&phone=${encodeURIComponent(cleanedPhone)}&message=${encodeURIComponent(smsMessage)}`;
            } else {
               // Support sms.bd or custom Greenweb URL format dynamically if configured
               externalUrl = `https://sms.bd/api/v1/send?api_key=${encodeURIComponent(settings.smsApiKey)}&phone=${encodeURIComponent(cleanedPhone)}&message=${encodeURIComponent(smsMessage)}`;
            }

            // Attempt to hit the actual API through CORS (Client-side)
            // If it fails due to CORS, it will gracefully fallback to simulated mode.
            await originalFetch(externalUrl).catch(e => console.warn('[OTP API Error]', e));
          }
        } catch (e) {
          console.error('[OTP Fetch Error]', e);
        }

        return jsonResponse({
          success: true,
          message: 'OTP sent (Simulated in interceptor or API sent)',
          demoCode: otpCode // Returned for testing purposes to autocomplete input
        });
      }

      if (pathname === '/api/otp/verify' && method === 'POST') {
        const phone = body?.phone;
        const code = body?.code;

        if (!phone || !code) return jsonResponse({ error: 'Phone and code required' }, 400);
        const record = activeOtps.get(phone);

        if (!record) return jsonResponse({ error: 'No OTP requested for this phone' }, 400);
        if (Date.now() > record.expiresAt) {
          activeOtps.delete(phone);
          return jsonResponse({ error: 'OTP code expired' }, 400);
        }
        if (record.code !== code.trim()) return jsonResponse({ error: 'Invalid verification code' }, 400);

        activeOtps.delete(phone);
        return jsonResponse({ success: true, message: 'Verified successfully' });
      }

      // --- WEBHOOK TRIGGER PROXY ---
      if (pathname === '/api/automation/trigger-webhook' && method === 'POST') {
        const { webhookUrl, event, data } = body || {};
        if (!webhookUrl) return jsonResponse({ error: 'webhookUrl is required' }, 400);

        try {
          // Attempt client-side webhook cross-origin fetch
          const response = await originalFetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: event || 'custom', timestamp: new Date().toISOString(), data })
          });
          
          if (response.ok) {
            let responseData = '';
            try { responseData = await response.text(); } catch {}
            return jsonResponse({ success: true, status: response.status, response: responseData });
          } else {
             return jsonResponse({ success: false, error: `External webhook returned status: ${response.status}` }, response.status);
          }
        } catch (e: any) {
           console.error('[API Interceptor] Error executing webhook fetch:', e);
           return jsonResponse({ success: false, error: e.message || 'CORS or Network Error in browser wrapper' }, 500);
        }
      }

      // --- LEADS ---
      if (pathname === '/api/leads' && method === 'GET') {
        const userId = queryParams.userId;
        const leads = await firebaseService.getLeads(userId);
        return jsonResponse({ leads });
      }
      
      if (pathname === '/api/leads' && method === 'POST') {
        const bodyCopy = { ...body };
        if (bodyCopy.phone) {
          let phoneCleaned = String(bodyCopy.phone).replace(/[\s-]/g, '');
          if (phoneCleaned.startsWith('01') && phoneCleaned.length === 11) {
            bodyCopy.phone = '88' + phoneCleaned;
          } else if (phoneCleaned.startsWith('1') && phoneCleaned.length === 10) {
            bodyCopy.phone = '880' + phoneCleaned;
          }
        }
        const newLead: Lead = {
          id: uuidv4(),
          ...bodyCopy,
          createdAt: Date.now()
        };
        await firebaseService.insertLead(newLead);
        return jsonResponse({ lead: newLead }, 201);
      }
      
      if (pathname.startsWith('/api/leads/') && pathname.endsWith('/status') && method === 'PUT') {
        const segments = pathname.split('/');
        const id = segments[segments.length - 2];
        const status = body?.status;
        const updated = await firebaseService.updateLeadStatus(id, status);
        if (updated) return jsonResponse({ lead: updated });
        return jsonResponse({ error: 'Lead not found' }, 404);
      }
      
      if (pathname.startsWith('/api/leads/') && method === 'PUT') {
        const id = pathname.split('/').pop() || '';
        const bodyCopy = { ...body };
        if (bodyCopy.phone) {
          let phoneCleaned = String(bodyCopy.phone).replace(/[\s-]/g, '');
          if (phoneCleaned.startsWith('01') && phoneCleaned.length === 11) {
            bodyCopy.phone = '88' + phoneCleaned;
          } else if (phoneCleaned.startsWith('1') && phoneCleaned.length === 10) {
            bodyCopy.phone = '880' + phoneCleaned;
          }
        }
        const updated = await firebaseService.updateLead(id, bodyCopy);
        if (updated) return jsonResponse({ lead: updated });
        return jsonResponse({ error: 'Lead not found' }, 404);
      }
      
      if (pathname.startsWith('/api/leads/') && method === 'DELETE') {
        const id = pathname.split('/').pop() || '';
        const deleted = await firebaseService.deleteLead(id);
        if (deleted) return jsonResponse({ lead: deleted });
        return jsonResponse({ error: 'Lead not found' }, 404);
      }

      // --- CAMPAIGNS ---
      if (pathname === '/api/campaigns' && method === 'GET') {
        const userId = queryParams.userId;
        const list = await firebaseService.getCampaigns(userId);
        return jsonResponse({ campaigns: list });
      }
      
      if (pathname === '/api/campaigns/sms' && method === 'POST') {
        const newCampaign: Campaign = {
          id: uuidv4(),
          type: 'SMS',
          audience: body.audience || 'All',
          message: body.message || '',
          sentAt: Date.now(),
          status: 'Sent',
          userId: body.userId || 'ielts_crm_main_user'
        };
        await firebaseService.insertCampaign(newCampaign);
        // Delay to simulate API cellular latency
        await new Promise(r => setTimeout(r, 450));
        return jsonResponse({ success: true, campaign: newCampaign });
      }
      
      if (pathname === '/api/campaigns/email' && method === 'POST') {
        const newCampaign: Campaign = {
          id: uuidv4(),
          type: 'Email',
          audience: body.audience || 'All',
          subject: body.subject || '',
          body: body.body || '',
          sentAt: Date.now(),
          status: 'Sent',
          userId: body.userId || 'ielts_crm_main_user'
        };
        await firebaseService.insertCampaign(newCampaign);
        await new Promise(r => setTimeout(r, 450));
        return jsonResponse({ success: true, campaign: newCampaign });
      }

      // --- STATS ---
      if (pathname === '/api/stats' && method === 'GET') {
        const userId = queryParams.userId;
        const leadsList = await firebaseService.getLeads(userId);
        
        const totalLeads = leadsList.length;
        const newLeads = leadsList.filter(l => l.status === 'New').length;
        const enrolled = leadsList.filter(l => l.status === 'Enrolled').length;
        
        const bySource = leadsList.reduce((acc: any, lead) => {
          acc[lead.source] = (acc[lead.source] || 0) + 1;
          return acc;
        }, {});

        // Estimated and converted calculation
        const estimatedPipelineValue = leadsList.reduce((acc, lead) => acc + (lead.expectedValue || 0), 0);
        const conversionValue = leadsList.filter(l => l.status === 'Enrolled').reduce((acc, lead) => acc + (lead.expectedValue || 0), 0);

        return jsonResponse({
          totalLeads,
          newLeads,
          enrolled,
          conversionRate: totalLeads > 0 ? ((enrolled / totalLeads) * 100).toFixed(1) : '0.0',
          bySource,
          estimatedPipelineValue,
          conversionValue
        });
      }

      // --- AUDIT LOGS ---
      if (pathname === '/api/audit-logs' && method === 'GET') {
        const userId = queryParams.userId;
        const logs = await firebaseService.getAuditLogs(userId);
        return jsonResponse({ logs });
      }
      
      if (pathname === '/api/audit-logs' && method === 'POST') {
        const newLog: AuditLog = {
          id: uuidv4(),
          userId: body.userId || 'ielts_crm_main_user',
          action: body.action || 'Event Logged',
          entityType: body.entityType,
          entityId: body.entityId,
          details: body.details || '',
          createdAt: Date.now()
        };
        await firebaseService.insertAuditLog(newLog);
        return jsonResponse({ success: true, log: newLog }, 201);
      }
      
      if (pathname === '/api/audit-logs' && method === 'DELETE') {
        const userId = queryParams.userId;
        await firebaseService.clearAuditLogs(userId);
        return jsonResponse({ success: true, message: 'Audit logs cleared successfully' });
      }

      // --- SETTINGS ---
      if (pathname === '/api/settings' && method === 'GET') {
        const userId = queryParams.userId || 'ielts_crm_main_user';
        const settings = await firebaseService.getSettings(userId);
        return jsonResponse({ settings });
      }
      
      if (pathname === '/api/settings' && method === 'POST') {
        const userId = body.userId || 'ielts_crm_main_user';
        const settingsObj = body.settings || {};
        await firebaseService.saveSettings(userId, settingsObj);
        return jsonResponse({ success: true, settings: settingsObj });
      }

      // --- TASKS ---
      if (pathname === '/api/tasks' && method === 'GET') {
        const userId = queryParams.userId;
        const tasks = await firebaseService.getTasks(userId);
        return jsonResponse({ tasks });
      }
      
      if (pathname === '/api/tasks' && method === 'POST') {
        const id = uuidv4();
        const newTask: Task = {
          id,
          ...body,
          status: body.status || 'Pending'
        };
        await firebaseService.insertTask(newTask);
        return jsonResponse({ task: newTask }, 201);
      }
      
      if (pathname.startsWith('/api/tasks/') && method === 'PUT') {
        const id = pathname.split('/').pop() || '';
        const updated = await firebaseService.updateTask(id, body);
        if (updated) return jsonResponse({ task: updated });
        return jsonResponse({ error: 'Task not found' }, 404);
      }
      
      if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
        const id = pathname.split('/').pop() || '';
        const success = await firebaseService.deleteTask(id);
        if (success) return jsonResponse({ success: true });
        return jsonResponse({ error: 'Task not found' }, 404);
      }

      // --- TEMPLATES ---
      if (pathname === '/api/templates' && method === 'GET') {
        const userId = queryParams.userId;
        const templates = await firebaseService.getTemplates(userId);
        return jsonResponse({ templates });
      }
      
      if (pathname === '/api/templates' && method === 'POST') {
        const newTemplate: Template = {
          id: uuidv4(),
          ...body
        };
        await firebaseService.insertTemplate(newTemplate);
        return jsonResponse({ template: newTemplate }, 201);
      }
      
      if (pathname.startsWith('/api/templates/') && method === 'PUT') {
        const id = pathname.split('/').pop() || '';
        const updated = await firebaseService.updateTemplate(id, body);
        if (updated) return jsonResponse({ template: updated });
        return jsonResponse({ error: 'Template not found' }, 404);
      }
      
      if (pathname.startsWith('/api/templates/') && method === 'DELETE') {
        const id = pathname.split('/').pop() || '';
        const success = await firebaseService.deleteTemplate(id);
        if (success) return jsonResponse({ success: true });
        return jsonResponse({ error: 'Template not found' }, 404);
      }

      // --- WORKFLOW RULES ---
      if (pathname === '/api/workflows' && method === 'GET') {
        const userId = queryParams.userId;
        const workflows = await firebaseService.getWorkflows(userId);
        return jsonResponse({ workflows });
      }
      
      if (pathname === '/api/workflows' && method === 'POST') {
        const newWorkflow: WorkflowRule = {
          id: uuidv4(),
          createdAt: Date.now(),
          ...body
        };
        await firebaseService.insertWorkflow(newWorkflow);
        return jsonResponse({ workflow: newWorkflow }, 201);
      }
      
      if (pathname.startsWith('/api/workflows/') && method === 'PUT') {
        const id = pathname.split('/').pop() || '';
        const updated = await firebaseService.updateWorkflow(id, body);
        if (updated) return jsonResponse({ workflow: updated });
        return jsonResponse({ error: 'Workflow not found' }, 404);
      }
      
      if (pathname.startsWith('/api/workflows/') && method === 'DELETE') {
        const id = pathname.split('/').pop() || '';
        const success = await firebaseService.deleteWorkflow(id);
        if (success) return jsonResponse({ success: true });
        return jsonResponse({ error: 'Workflow not found' }, 404);
      }

      // --- TEAM MEMBERS ---
      if (pathname === '/api/team-members' && method === 'GET') {
        const userId = queryParams.userId;
        const teamMembers = await firebaseService.getTeamMembers(userId);
        return jsonResponse({ teamMembers });
      }
      
      if (pathname === '/api/team-members' && method === 'POST') {
        const newMember: TeamMember = {
          id: uuidv4(),
          createdAt: Date.now(),
          status: 'Invited',
          ...body
        };
        await firebaseService.insertTeamMember(newMember);
        return jsonResponse({ teamMember: newMember }, 201);
      }
      
      if (pathname.startsWith('/api/team-members/') && method === 'PUT') {
        const id = pathname.split('/').pop() || '';
        const updated = await firebaseService.updateTeamMember(id, body);
        if (updated) return jsonResponse({ teamMember: updated });
        return jsonResponse({ error: 'Team member not found' }, 404);
      }
      
      if (pathname.startsWith('/api/team-members/') && method === 'DELETE') {
        const id = pathname.split('/').pop() || '';
        const success = await firebaseService.deleteTeamMember(id);
        if (success) return jsonResponse({ success: true });
        return jsonResponse({ error: 'Team member not found' }, 404);
      }

      // --- DB INFRASTRUCTURE STATUS PROBE ---
      if (pathname === '/api/db-status' && method === 'GET') {
        const active = firebaseService.isConnected();
        return jsonResponse({
          connected: active,
          config: active ? {
            host: 'Firebase Firestore Cloud Engine',
            port: 443,
            user: firebaseService.getConfig()?.projectId || 'Project Sandbox',
            database: 'Subcollections (leads, tasks, campaigns...)'
          } : {
            host: 'localStorage Fallback Browser Engine',
            port: 80,
            user: 'Guest',
            database: 'Client-side memory blocks (Persistent)'
          }
        });
      }

      // Fallback 404 for unhandled subroutes
      return jsonResponse({ error: `Not Found: Serverless route ${pathname}` }, 404);
    } catch (err: any) {
      console.error('[API Interceptor] Fatal Routing Crash:', err);
      return jsonResponse({ error: err.message || 'Serverless Routing Error' }, 500);
    }
  }

  // Delegate non-api calls directly to native fetch
  return originalFetch.apply(this, [input, init]);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: interceptorFetch,
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  try {
    Object.defineProperty(globalThis, 'fetch', {
      value: interceptorFetch,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch (err2) {
    console.error('[API Interceptor] Failed to install custom fetch interceptions:', err2);
  }
}
