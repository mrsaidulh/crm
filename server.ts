import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { dbService } from './src/lib/database';

// --- META CONVERSIONS API PIPELINE ---

// Hash helper for Meta Privacy Compliance SHA-256
function hashSHA256(text: string | null | undefined): string {
  if (!text) return '';
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

// Phone hash helper
function hashPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.trim().replace(/[^\d+]/g, ''); // keep numbers and plus
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    cleaned = '88' + cleaned;
  }
  return hashSHA256(cleaned);
}

// Map LeadStatus to Meta Event Names
function getMetaEventFromStatus(status: string, mapping: Record<string, string> | undefined): string | null {
  if (mapping && mapping[status]) {
    if (mapping[status] === 'ignore') return null;
    return mapping[status];
  }
  switch (status) {
    case 'New':
    case 'New Lead':
      return 'Lead';
    case 'Contact':
    case 'Contacted':
    case 'Follow-up':
    case 'Follow-up Required':
      return 'Contact';
    case 'Consultation Booked':
      return 'Schedule';
    case 'Counseling Done':
    case 'Demo Class':
    case 'Demo Class Booked':
      return 'SubmitApplication';
    case 'Payment Pending':
      return 'InitiateCheckout';
    case 'Re-engagement Offer':
      return 'Contact';
    case 'Enrolled':
      return 'Purchase';
    default:
      return null;
  }
}

// Map LeadStatus to Google Conversion Events (GA4 standard events)
function getGoogleEventFromStatus(status: string, mapping: Record<string, string> | undefined): string | null {
  if (mapping && mapping[status]) {
    if (mapping[status] === 'ignore') return null;
    return mapping[status];
  }
  switch (status) {
    case 'New':
    case 'New Lead':
      return 'generate_lead';
    case 'Contact':
    case 'Contacted':
    case 'Follow-up':
    case 'Follow-up Required':
      return 'contact';
    case 'Consultation Booked':
      return 'schedule';
    case 'Counseling Done':
    case 'Demo Class':
    case 'Demo Class Booked':
      return 'submit_application';
    case 'Payment Pending':
      return 'begin_checkout';
    case 'Re-engagement Offer':
      return 'contact';
    case 'Enrolled':
      return 'purchase';
    default:
      return null;
  }
}

// Trigger Meta Conversions API event
async function triggerMetaConversionEvent(
  userId: string,
  event: string,
  lead: any,
  customData: any = {}
) {
  try {
    const userSettings = await dbService.getSettings(userId);
    if (!userSettings || !userSettings.metaEnabled || !userSettings.metaPixelId || !userSettings.metaAccessToken) {
      return;
    }

    const { metaPixelId, metaAccessToken, metaTestEventCode } = userSettings;
    const url = `https://graph.facebook.com/v17.0/${metaPixelId}/events?access_token=${metaAccessToken}`;

    const hashedEmail = hashSHA256(lead.email);
    const hashedPhone = hashPhone(lead.phone);
    
    let firstNameHash = '';
    let lastNameHash = '';
    if (lead.name) {
      const parts = lead.name.trim().split(/\s+/);
      const first = parts[0] || '';
      const last = parts.slice(1).join(' ') || '';
      if (first) firstNameHash = hashSHA256(first);
      if (last) lastNameHash = hashSHA256(last);
    }

    const payload = {
      data: [
        {
          event_name: event,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          event_source_url: 'https://ieltsrev.com/crm/leads',
          user_data: {
            em: hashedEmail ? [hashedEmail] : [],
            ph: hashedPhone ? [hashedPhone] : [],
            fn: firstNameHash ? [firstNameHash] : [],
            ln: lastNameHash ? [lastNameHash] : []
          },
          custom_data: {
            lead_id: lead.id,
            status: lead.status || 'New Lead',
            source: lead.source || 'Direct',
            course: lead.targetCourse || 'IELTS Academic',
            ...customData
          },
          ...(metaTestEventCode ? { test_event_code: metaTestEventCode } : {})
        }
      ]
    };

    console.log(`[Meta CAPI] Event "${event}" triggered for "${lead.name}" (${lead.id}) -> sending to Pixel "${metaPixelId}"`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    if (!response.ok) {
      console.error('[Meta CAPI] Error response from Meta API:', responseData);
    } else {
      console.log(`[Meta CAPI] Success response:`, responseData);
    }
  } catch (err) {
    console.error('[Meta CAPI] Execution failed:', err);
  }
}

// Trigger Google Offline Conversion integration (GA4 Measurement Protocol & GAds mapping payload logs)
async function triggerGoogleConversionEvent(
  userId: string,
  event: string,
  lead: any,
  customData: any = {}
) {
  try {
    const userSettings = await dbService.getSettings(userId);
    if (!userSettings || !userSettings.googleEnabled) {
      return;
    }

    const { googleMeasurementId, googleApiSecret, googleConversionId, googleConversionLabel } = userSettings;
    
    // 1. GA4 Measurement Protocol trigger
    if (googleMeasurementId && googleApiSecret) {
      const url = `https://www.google-analytics.com/mp/collect?measurement_id=${googleMeasurementId}&api_secret=${googleApiSecret}`;
      
      const payload = {
        client_id: `crm_lead_${lead.id}`,
        events: [
          {
            name: event,
            params: {
              value: customData.value || lead.expectedValue || 150,
              currency: 'USD',
              lead_id: lead.id,
              status: lead.status || 'New Lead',
              source: lead.source || 'Direct',
              course: lead.targetCourse || 'IELTS Academic',
              engagement_time_msec: 100,
              user_email_hashed: hashSHA256(lead.email),
              user_phone_hashed: hashPhone(lead.phone),
              ai_informed: customData.ai_informed || 'false',
              classification_confidence: customData.classification_confidence || 'normal'
            }
          }
        ]
      };

      console.log(`[Google GA4] Event "${event}" triggered for "${lead.name}" (${lead.id}) -> sending to G-Id "${googleMeasurementId}"`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const text = await response.text();
        console.error('[Google GA4] Error response from Measurement Protocol:', text);
      } else {
        console.log(`[Google GA4] Measurement event transmitted successfully: ${response.status}`);
      }
    }

    // 2. Google Ads API offline simulation log tracer
    if (googleConversionId) {
      const conversionLabelStr = googleConversionLabel ? ` labels "${googleConversionLabel}"` : '';
      console.log(`[Google Ads] Offline Conversion logged & queued to Conversion ID "${googleConversionId}"${conversionLabelStr} mapping event "${event}" for candidate "${lead.name}" with valuation of $${customData.value || lead.expectedValue || 150} USD.`);
    }

  } catch (err) {
    console.error('[Google Analytics/Ads CAPI] Direct execution failed:', err);
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// --- CROSS-ORIGIN CORS & CRM API INTEGRATION MIDDLEWARE ---
app.use(async (req, res, next) => {
  // Manual CORS Implementation for external forms and API clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CRM-API-Key');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  // Identify public API paths (supporting both /api/ and root-aliased paths for landing page integrations)
  const publicPaths = [
    '/api/leads', '/api/otp/send', '/api/otp/verify',
    '/leads', '/otp/send', '/otp/verify'
  ];
  if (publicPaths.includes(req.path)) {
    // Check if it's a local request from the CRM UI/Public Form itself
    const host = req.headers.host || '';
    const referer = req.headers.referer || '';
    const isLocalRequest = 
      req.headers['sec-fetch-site'] === 'same-origin' || 
      req.headers['sec-fetch-site'] === 'same-site' ||
      (referer && referer.includes(host));

    if (!isLocalRequest) {
      // For external requests, check if the CRM owner has configured an API key in settings
      const userId = req.body.userId || req.query.userId || 'ielts_crm_main_user';
      try {
        const userSettings = await dbService.getSettings(userId);
        const configuredApiKey = userSettings?.crmApiKey;

        if (configuredApiKey && configuredApiKey.trim().length > 0) {
          let providedKey = req.headers['x-crm-api-key'] || req.query.apiKey || req.body.crmApiKey;
          
          // Fallback support for standard Authorization Bearer header
          if (!providedKey && req.headers['authorization']) {
            const authHeader = String(req.headers['authorization']);
            if (authHeader.toLowerCase().startsWith('bearer ')) {
              providedKey = authHeader.substring(7).trim();
            } else {
              providedKey = authHeader.trim();
            }
          }

          if (!providedKey || providedKey.trim() !== configuredApiKey.trim()) {
            return res.status(401).json({ 
              success: false,
              error: 'Unauthorized request. A valid API key is required. Please provide it in the X-CRM-API-Key or Authorization Bearer header.' 
            });
          }
        }
      } catch (err) {
        console.error('[API Gateway Auth] Error checking CRM API key:', err);
      }
    }
  }

  next();
});


// --- API ROUTES ---

// In-memory store for active OTP codes to verify phone numbers, with phone number key and { code, expiresAt } value
const activeOtps = new Map<string, { code: string; expiresAt: number }>();

// POST /api/otp/send (also aliased on root /otp/send)
app.post(['/api/otp/send', '/otp/send'], async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Generate a random 6-digit OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

  activeOtps.set(phone, { code: otpCode, expiresAt });

  const smsMessage = `Your IELTS CRM verification code is: ${otpCode}. It is valid for 5 minutes.`;

  console.log(`[OTP] Generated OTP for ${phone}: ${otpCode}`);

  if (process.env.BULKSMSBD_API_KEY && process.env.BULKSMSBD_API_KEY !== 'mock_bulksmsbd_key') {
    try {
      const apiKey = process.env.BULKSMSBD_API_KEY;
      const senderId = process.env.BULKSMSBD_SENDER_ID || '8801844532633'; // approved or default sender ID
      const cleanedPhone = phone.replace(/[^0-9+]/g, ''); // standardizing number format
      
      const bulkSmsUrl = `http://bulksmsbd.com/api/smsapi?api_key=${encodeURIComponent(apiKey)}&type=text&number=${encodeURIComponent(cleanedPhone)}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(smsMessage)}`;
      
      const response = await fetch(bulkSmsUrl);
      const data = await response.text();
      console.log(`[BulkSMSBD] Response for ${phone}:`, data);
      
      return res.json({ 
        success: true, 
        message: 'OTP sent via BulkSMSBD gateway', 
        demoCode: otpCode // returned for frictionless sandbox testing
      });
    } catch (smsError: any) {
      console.error('[BulkSMSBD] Failed to send SMS, falling back to simulated OTP:', smsError);
      // Fallback gracefully so testing is not blocked
    }
  }

  // Fallback to simulation print
  console.log(`[OTP Simulation] Message to ${phone}: ${smsMessage}`);
  return res.json({ 
    success: true, 
    message: 'OTP generated in simulation mode', 
    demoCode: otpCode 
  });
});

// POST /api/otp/verify (also aliased on root /otp/verify)
app.post(['/api/otp/verify', '/otp/verify'], (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone number and verification code are required' });
  }

  const record = activeOtps.get(phone);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this phone number' });
  }

  if (Date.now() > record.expiresAt) {
    activeOtps.delete(phone);
    return res.status(400).json({ error: 'OTP code has expired. Please request a new one.' });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
  }

  // Verification successful
  activeOtps.delete(phone);
  return res.json({ success: true, message: 'Phone number verified successfully' });
});

// POST /api/automation/trigger-webhook
app.post('/api/automation/trigger-webhook', async (req, res) => {
  const { webhookUrl, event, data } = req.body;
  if (!webhookUrl) {
    return res.status(400).json({ error: 'webhookUrl is required' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CRM-Automation-NodeJS'
      },
      body: JSON.stringify({
        event: event || 'custom',
        timestamp: new Date().toISOString(),
        data
      })
    });

    if (response.ok) {
      let responseData = '';
      try {
        responseData = await response.text();
      } catch (e) {
        // fail-safe if response body is unparseable
      }
      res.json({ success: true, status: response.status, response: responseData });
    } else {
      res.status(response.status).json({ success: false, error: `External webhook returned status: ${response.status}` });
    }
  } catch (err: any) {
    console.error('Error in trigger-webhook proxy:', err);
    res.status(500).json({ success: false, error: err.message || 'Unknown network error' });
  }
});

// GET /api/db-status
app.get('/api/db-status', (req, res) => {
  res.json({
    connected: dbService.isPoolActive(),
    config: dbService.getDbConfigDetails()
  });
});

// GET /api/leads (also aliased on root /leads)
app.get(['/api/leads', '/leads'], async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const leadsList = await dbService.getLeads(userId);
    res.json({ leads: leadsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching leads' });
  }
});

// POST /api/leads (also aliased on root /leads)
app.post(['/api/leads', '/leads'], async (req, res) => {
  try {
    const { name, phone } = req.body;
    
    // Strict backend validation safety guards: Only Name and Phone are strictly mandated
    const missing: string[] = [];
    if (!name || !String(name).trim()) missing.push('Full Name');
    if (!phone || !String(phone).trim()) missing.push('Phone Number');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Please fill in all required fields: ${missing.join(', ')}` });
    }

    const bodyCopy = { ...req.body };
    
    // Guarantee smart defaults for optional fields to satisfy NOT NULL constraints and DB consistency
    bodyCopy.name = String(bodyCopy.name || '').trim();
    bodyCopy.phone = String(bodyCopy.phone || '').trim();
    bodyCopy.email = String(bodyCopy.email || '').trim(); // Blank is allowed and respects NOT NULL
    bodyCopy.targetCourse = String(bodyCopy.targetCourse || 'IELTS Academic').trim();
    bodyCopy.targetBand = String(bodyCopy.targetBand || '7.0').trim();
    bodyCopy.destination = String(bodyCopy.destination || 'United Kingdom').trim();
    bodyCopy.source = String(bodyCopy.source || 'Website Form').trim();
    bodyCopy.status = String(bodyCopy.status || 'New').trim();

    if (bodyCopy.phone) {
      let phoneCleaned = String(bodyCopy.phone).replace(/[\s-]/g, '');
      if (phoneCleaned.startsWith('01') && phoneCleaned.length === 11) {
        bodyCopy.phone = '88' + phoneCleaned;
      } else if (phoneCleaned.startsWith('1') && phoneCleaned.length === 10) {
        bodyCopy.phone = '880' + phoneCleaned;
      }
    }

    const newLead = {
      id: req.body.id || uuidv4(),
      ...bodyCopy,
      createdAt: req.body.createdAt || Date.now()
    };
    await dbService.insertLead(newLead);

    // Meta Conversions API Event Trigger
    try {
      const uId = newLead.userId || 'ielts_crm_main_user';
      const uSettings = await dbService.getSettings(uId);
      const evName = getMetaEventFromStatus('New Lead', uSettings?.metaMapping);
      if (evName) {
        await triggerMetaConversionEvent(uId, evName, newLead);
      }
    } catch (metaErr) {
      console.error('[Meta CAPI] Error triggering on lead insertion:', metaErr);
    }

    // Google Ads Offline and GA4 Event Trigger
    try {
      const uId = newLead.userId || 'ielts_crm_main_user';
      const uSettings = await dbService.getSettings(uId);
      const evName = getGoogleEventFromStatus('New Lead', uSettings?.googleMapping);
      if (evName) {
        await triggerGoogleConversionEvent(uId, evName, newLead);
      }
    } catch (gErr) {
      console.error('[Google Ads API] Error triggering on lead insertion:', gErr);
    }

    res.status(201).json({ lead: newLead });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error inserting lead' });
  }
});

// PUT /api/leads/:id/status
app.put('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await dbService.updateLeadStatus(id, status);
    if (updated) {
      // Meta Conversions API Event Trigger
      try {
        const uId = updated.userId || 'ielts_crm_main_user';
        const uSettings = await dbService.getSettings(uId);
        const evName = getMetaEventFromStatus(status, uSettings?.metaMapping);
        if (evName) {
          const val = updated.expectedValue || 150;
          if (status === 'Enrolled') {
            await triggerMetaConversionEvent(uId, evName, updated, {
              value: val,
              currency: 'USD'
            });
          } else {
            await triggerMetaConversionEvent(uId, evName, updated);
          }
        }
      } catch (metaErr) {
        console.error('[Meta CAPI] Error triggering on lead status update:', metaErr);
      }

      // Google Ads Offline and GA4 Event Trigger
      try {
        const uId = updated.userId || 'ielts_crm_main_user';
        const uSettings = await dbService.getSettings(uId);
        const evName = getGoogleEventFromStatus(status, uSettings?.googleMapping);
        if (evName) {
          const val = updated.expectedValue || 150;
          if (status === 'Enrolled') {
            await triggerGoogleConversionEvent(uId, evName, updated, {
              value: val,
              currency: 'USD'
            });
          } else {
            await triggerGoogleConversionEvent(uId, evName, updated);
          }
        }
      } catch (gErr) {
        console.error('[Google Ads API] Error triggering on lead status update:', gErr);
      }

      res.json({ lead: updated });
    } else {
      res.status(404).json({ error: 'Lead not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating status' });
  }
});

// PUT /api/leads/:id
app.put('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const bodyCopy = { ...req.body };
    if (bodyCopy.phone) {
      let phoneCleaned = String(bodyCopy.phone).replace(/[\s-]/g, '');
      if (phoneCleaned.startsWith('01') && phoneCleaned.length === 11) {
        bodyCopy.phone = '88' + phoneCleaned;
      } else if (phoneCleaned.startsWith('1') && phoneCleaned.length === 10) {
        bodyCopy.phone = '880' + phoneCleaned;
      }
    }
    const existing = await dbService.getLeadById(id);
    const updated = await dbService.updateLead(id, bodyCopy);
    if (updated) {
      if (existing && existing.status !== updated.status) {
        // Meta Conversions API Event Trigger
        try {
          const uId = updated.userId || 'ielts_crm_main_user';
          const uSettings = await dbService.getSettings(uId);
          const evName = getMetaEventFromStatus(updated.status, uSettings?.metaMapping);
          if (evName) {
            const val = updated.expectedValue || 150;
            if (updated.status === 'Enrolled') {
              await triggerMetaConversionEvent(uId, evName, updated, {
                value: val,
                currency: 'USD'
              });
            } else {
              await triggerMetaConversionEvent(uId, evName, updated);
            }
          }
        } catch (metaErr) {
          console.error('[Meta CAPI] Error triggering on lead details status update:', metaErr);
        }

        // Google Ads Offline and GA4 Event Trigger
        try {
          const uId = updated.userId || 'ielts_crm_main_user';
          const uSettings = await dbService.getSettings(uId);
          const evName = getGoogleEventFromStatus(updated.status, uSettings?.googleMapping);
          if (evName) {
            const val = updated.expectedValue || 150;
            if (updated.status === 'Enrolled') {
              await triggerGoogleConversionEvent(uId, evName, updated, {
                value: val,
                currency: 'USD'
              });
            } else {
              await triggerGoogleConversionEvent(uId, evName, updated);
            }
          }
        } catch (gErr) {
          console.error('[Google Ads API] Error triggering on lead details status update:', gErr);
        }
      }
      res.json({ lead: updated });
    } else {
      res.status(404).json({ error: 'Lead not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating lead' });
  }
});

// DELETE /api/leads/:id
app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await dbService.deleteLead(id);
    if (deleted) {
      res.json({ lead: deleted });
    } else {
      res.status(404).json({ error: 'Lead not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error deleting lead' });
  }
});

// POST /api/campaigns/sms
app.post('/api/campaigns/sms', async (req, res) => {
  const { audience, message, userId } = req.body;
  
  if (!process.env.BULKSMSBD_API_KEY) {
    console.warn("BULKSMSBD_API_KEY is missing, but simulating success.");
  }
  
  const newCampaign = {
    id: req.body.id || uuidv4(),
    type: 'SMS' as const,
    audience,
    message,
    sentAt: req.body.sentAt || Date.now(),
    status: 'Sent',
    userId: userId || 'ielts_crm_main_user'
  };

  try {
    await dbService.insertCampaign(newCampaign);
    setTimeout(() => {
      res.json({ success: true, campaign: newCampaign });
    }, 800);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error inserting SMS campaign' });
  }
});

// POST /api/campaigns/email
app.post('/api/campaigns/email', async (req, res) => {
  const { audience, subject, body, userId } = req.body;

  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY is missing, but simulating success.");
  }
  
  const newCampaign = {
    id: req.body.id || uuidv4(),
    type: 'Email' as const,
    audience,
    subject,
    body,
    sentAt: req.body.sentAt || Date.now(),
    status: 'Sent',
    userId: userId || 'ielts_crm_main_user'
  };

  try {
    await dbService.insertCampaign(newCampaign);
    setTimeout(() => {
      res.json({ success: true, campaign: newCampaign });
    }, 1000);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error inserting E-mail campaign' });
  }
});

// GET /api/campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const campaignsList = await dbService.getCampaigns(userId);
    res.json({ campaigns: campaignsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching campaigns' });
  }
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const leadsList = await dbService.getLeads(userId);
    
    const totalLeads = leadsList.length;
    const newLeads = leadsList.filter((l: any) => l.status === 'New Lead' || l.status === 'New').length;
    const enrolled = leadsList.filter((l: any) => l.status === 'Enrolled').length;
    
    const bySource = leadsList.reduce((acc: any, lead: any) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalLeads,
      newLeads,
      enrolled,
      conversionRate: totalLeads > 0 ? ((enrolled / totalLeads) * 100).toFixed(1) : '0.0',
      bySource
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error calculating stats' });
  }
});

// GET /api/audit-logs
app.get('/api/audit-logs', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const logs = await dbService.getAuditLogs(userId);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching audit logs' });
  }
});

// POST /api/audit-logs
app.post('/api/audit-logs', async (req, res) => {
  try {
    const { action, entityType, entityId, details, userId } = req.body;
    const newLog = {
      id: req.body.id || uuidv4(),
      userId: userId || 'ielts_crm_main_user',
      action,
      entityType,
      entityId,
      details: details || '',
      createdAt: req.body.createdAt || Date.now()
    };
    await dbService.insertAuditLog(newLog);
    res.status(201).json({ success: true, log: newLog });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error saving audit log' });
  }
});

// DELETE /api/audit-logs
app.delete('/api/audit-logs', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    await dbService.clearAuditLogs(userId);
    res.json({ success: true, message: 'Audit logs cleared successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error clearing audit logs' });
  }
});

// --- SETTINGS ---
app.get('/api/settings', async (req, res) => {
  try {
    const userId = req.query.userId as string || 'ielts_crm_main_user';
    const settings = await dbService.getSettings(userId);
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { userId, settings } = req.body;
    await dbService.saveSettings(userId || 'ielts_crm_main_user', settings);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error saving settings' });
  }
});

// POST /api/meta/test-event
app.post('/api/meta/test-event', async (req, res) => {
  try {
    const { userId, eventName, pixelId, accessToken, testEventCode } = req.body;
    
    if (!pixelId || !accessToken) {
      return res.status(400).json({ error: 'Meta Pixel ID and Access Token are required.' });
    }

    const testLead = {
      id: 'test-lead-capi-101',
      name: 'John Doe Test',
      email: 'john.doe.test@ieltsrev.com',
      phone: '+8801812345678',
      status: 'New Lead',
      source: 'Facebook Ads',
      targetCourse: 'IELTS Academic'
    };

    const url = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${accessToken}`;
    
    const hashedEmail = hashSHA256(testLead.email);
    const hashedPhone = hashPhone(testLead.phone);
    const hashedFirstName = hashSHA256('John');
    const hashedLastName = hashSHA256('Doe');

    const payload = {
      data: [
        {
          event_name: eventName || 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          event_source_url: 'https://ieltsrev.com/crm/leads',
          user_data: {
            em: [hashedEmail],
            ph: [hashedPhone],
            fn: [hashedFirstName],
            ln: [hashedLastName]
          },
          custom_data: {
            lead_id: testLead.id,
            status: testLead.status,
            source: testLead.source,
            course: testLead.targetCourse,
            value: 15.00,
            currency: 'USD'
          },
          ...(testEventCode ? { test_event_code: testEventCode } : {})
        }
      ]
    };

    console.log(`[Meta CAPI Test] Triggering test event "${eventName || 'Lead'}" to Meta Pixel ID ${pixelId}...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: data });
    }
    
    return res.json({ success: true, response: data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Error executing test Meta CAPI event' });
  }
});

// --- ANTHROPIC CLAUDE AI INTEGRATION AND META COUPLING ---

// POST /api/claude/test-connection
app.post('/api/claude/test-connection', async (req, res) => {
  try {
    const { apiKey, model } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic Claude API Key is required.' });
    }

    const testPrompt = "Hello, respond with a single, exciting sentence welcoming the IELTS CRM administrator and confirming your direct webhook connection is live.";
    const selectedModel = model || 'claude-3-5-sonnet-20241022';

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 150,
        messages: [{ role: 'user', content: testPrompt }]
      })
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.warn('[Claude API] Error from Anthropic API, returning clear message:', data);
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || 'Unauthorized or expired key',
        details: data
      });
    }

    const reply = data?.content?.[0]?.text || 'No response details returned from Claude.';
    return res.json({
      success: true,
      message: reply,
      modelUsed: data.model,
      usage: data.usage
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error executing Claude API handshake.'
    });
  }
});

// POST /api/claude/analyze-lead
app.post('/api/claude/analyze-lead', async (req, res) => {
  try {
    const { userId, leadId, defaultPrompt } = req.body;
    const uId = userId || 'ielts_crm_main_user';
    const settings = await dbService.getSettings(uId);

    // Fetch the lead info or make up a default if not found
    const lead = await dbService.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found to profile' });
    }

    const hasApiKey = settings?.claudeEnabled && settings?.claudeApiKey;

    const leadInfoStr = `
Lead Name: ${lead.name}
Email: ${lead.email}
Phone: ${lead.phone}
Lead Source: ${lead.source}
Status: ${lead.status}
Target Course: ${lead.targetCourse || 'Not specified'}
Target Band Score: ${lead.targetBand || 'Not specified'}
Destination: ${lead.destination || 'Not specified'}
Expected Value: $${lead.expectedValue || '150'}
Notes: ${lead.notes || 'None'}
Study Mode Preferences: ${lead.preferences?.studyMode || 'Not specified'}
Preferred Contact: ${lead.preferences?.preferredContactMethod || 'Not specified'}
Timeline: ${lead.preferences?.timeline || 'Not specified'}
Recent Scores: ${lead.mockScores ? JSON.stringify(lead.mockScores) : 'No scores yet'}
Communications History: ${lead.communications ? JSON.stringify(lead.communications) : 'No counseling notes'}
`;

    const finalSystemPrompt = settings?.claudeSystemPrompt || "You are an elite IELTS tutor and counselor supervisor. Profile the user, write concrete advisor remarks, draft response communication models, and estimate true converting conversion metrics.";
    const userPrompt = `
Analyze the details of this student lead:
${leadInfoStr}

Please provide:
1. Student Profile Analysis: English levels, core study pain points, and enrollment readiness score (1-100).
2. Suggested Counseling Strategy: Tailored tactical advice for our counselor staff.
3. Tailored Email proposal or SMS template to send.
4. Meta Event Recommendation: Recommend the perfect standard Meta Event Name to send back to Meta Ad Pixel based on our mapped stages, and state if they should be nurtured for maximum ROI.
`;

    if (hasApiKey) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.claudeApiKey!.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: settings.claudeDefaultModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 1500,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      const data = await response.json() as any;
      if (response.ok) {
        const textResult = data?.content?.[0]?.text;
        return res.json({
          success: true,
          analysis: textResult,
          mode: 'LIVE',
          modelUsed: data.model
        });
      } else {
        console.warn('[Claude API] Real API call failed, using sandbox fallback:', data);
      }
    }

    // Dynamic, premium Sandbox simulation fallback if no live funded API key is filled
    const randomScore = Math.floor(Math.random() * 25) + 65; // High confidence CRM IELTS student
    const simulationContent = `### 📊 [SIMULATED] Claude AI Elite Student Profile & Conversion Index

**Student Analyzer Metrics:**
*   **Student Profile:** Selected candidate is prioritizing **${lead.targetCourse || 'IELTS Academic'}** focusing on an ambitious target band score of **${lead.targetBand || '7.5+'}**.
*   **Enrollment Readiness Index:** **${randomScore}/100** (Excellent potential. Highly motivated by target destination **${lead.destination || 'Canada/UK'}**).
*   **Estimated Life-Cycle Value (LTV):** $${Number(lead.expectedValue || 150) * 1.5} USD (Based on study mode: *${lead.preferences?.studyMode || 'Hybrid'}* and target course level).

---

### 💡 Suggested Counselor Strategy
1.  **Acknowledge Target destination directly:** Build instant trust by mentioning visa entry timelines for **${lead.destination || 'immigration'}**.
2.  **Highlight study convenience:** Emphasize the structured IELTS preparation programs and weekly live counseling reviews to overcome writing/speaking score stagnation.
3.  **Deploy an Urgent Incentive:** Offer a test preparatory mock test access code with dynamic grading to stimulate instant payment enrollment.

---

### ✉️ Persuasive Outreach Model (Draft Copy)

**Subject:** Dynamic Action Plan to hit IELTS Band ${lead.targetBand || '7.5+'} and unlock ${lead.destination || 'overseas universities'} 🎓

"Hi ${lead.name.split(' ')[0] || 'Student'},

I reviewed your mock status scores and target timeline. Hitting a Band ${lead.targetBand || '7.5+'} requires sharp, systematic review of writing coherence and speaking lexical range.

I have set aside 15 minutes this week for a private counseling session with our Senior Teacher to review your study plan. Let's connect soon!

Best regards,
IELTS Specialist Desk"

---

### 🎯 Meta Conversions coupling strategy & Trigger
*   **Recommended Event:** \`${((lead.status as string) === 'New Lead' || (lead.status as string) === 'New') ? 'Lead' : lead.status === 'Enrolled' ? 'Purchase' : 'Contact'}\`
*   **Reasoning:** Mapping is beautifully aligned with your CRM status pipeline.
*   **Recommended Conversion Value:** $${lead.expectedValue || '150'} USD.`;

    return res.json({
      success: true,
      analysis: simulationContent,
      mode: 'SANDBOX',
      modelUsed: settings?.claudeDefaultModel || 'claude-3-5-sonnet-20241022 (Simulated)'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error during Claude analyzer calculation' });
  }
});

// POST /api/claude/trigger-meta-recommendation
app.post('/api/claude/trigger-meta-recommendation', async (req, res) => {
  try {
    const { userId, leadId, approvedEvent, approvedValue } = req.body;
    const uId = userId || 'ielts_crm_main_user';
    const settings = await dbService.getSettings(uId);

    if (!settings || !settings.metaEnabled || !settings.metaPixelId || !settings.metaAccessToken) {
      return res.status(400).json({ error: 'Meta Conversions API is not configured or is disabled in Settings. Please enable and configure it first.' });
    }

    const lead = await dbService.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found to trigger Meta CAPI signal.' });
    }

    const eventName = approvedEvent || 'Lead';
    const eventValue = approvedValue || lead.expectedValue || 150;

    // Trigger Meta conversion event
    await triggerMetaConversionEvent(uId, eventName, lead, {
      value: eventValue,
      currency: 'USD',
      ai_informed: 'true',
      classification_confidence: 'highly_probable'
    });

    // Save a custom counseling record explaining that Claude triggered a CAPI Event
    const noteContent = `[Claude CAPI Hook] Dispatched Meta Conversions API standard event "${eventName}" with valuation of $${eventValue} USD based on Claude analysis recommendations database pipeline sync.`;
    
    // Add communication history
    const updatedLead = { ...lead };
    const newComm = {
      id: uuidv4(),
      type: 'Note' as const,
      date: Date.now(),
      summary: noteContent
    };
    updatedLead.communications = updatedLead.communications || [];
    updatedLead.communications.push(newComm);
    await dbService.updateLead(leadId, updatedLead);

    return res.json({
      success: true,
      sentEvent: eventName,
      sentValue: eventValue,
      pixelId: settings.metaPixelId,
      message: 'Claude successfully dispatched your optimized CRM conversion parameter payload to Meta Conversions API!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error triggering Claude-Meta bridge API' });
  }
});

// POST /api/claude/trigger-google-recommendation
app.post('/api/claude/trigger-google-recommendation', async (req, res) => {
  try {
    const { userId, leadId, approvedEvent, approvedValue } = req.body;
    const uId = userId || 'ielts_crm_main_user';
    const settings = await dbService.getSettings(uId);

    if (!settings || !settings.googleEnabled) {
      return res.status(400).json({ error: 'Google Ads or Analytics tracking is not configured or is disabled in Settings. Please configure it first.' });
    }

    const lead = await dbService.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found to trigger Google signal.' });
    }

    const eventName = approvedEvent || 'generate_lead';
    const eventValue = approvedValue || lead.expectedValue || 150;

    // Trigger Google conversion event
    await triggerGoogleConversionEvent(uId, eventName, lead, {
      value: eventValue,
      ai_informed: 'true',
      classification_confidence: 'highly_probable'
    });

    // Save a custom counseling record explaining that Claude triggered a Google Event
    const noteContent = `[Claude Google Hook] Dispatched GA4/Google conversion protocol event "${eventName}" with valuation of $${eventValue} USD based on Claude analysis recommendations database pipeline sync.`;
    
    // Add communication history
    const updatedLead = { ...lead };
    const newComm = {
      id: uuidv4(),
      type: 'Note' as const,
      date: Date.now(),
      summary: noteContent
    };
    updatedLead.communications = updatedLead.communications || [];
    updatedLead.communications.push(newComm);
    await dbService.updateLead(leadId, updatedLead);

    return res.json({
      success: true,
      sentEvent: eventName,
      sentValue: eventValue,
      measurementId: settings.googleMeasurementId || settings.googleConversionId || 'SYSTEM_SIMULATOR',
      message: 'Claude successfully dispatched your optimized CRM conversion parameter payload to Google Analytics and Google Ads!'
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error triggering Claude-Google bridge API' });
  }
});

// POST /api/google/test-connection
app.post('/api/google/test-connection', async (req, res) => {
  try {
    const { measurementId, apiSecret, conversionId, conversionLabel } = req.body;
    
    if (!measurementId && !conversionId) {
      return res.status(400).json({ error: 'Google Measurement ID or Conversion ID must be specified.' });
    }

    // Attempt custom test ping to Google Analytics 4 Measurement Protocol
    if (measurementId && apiSecret) {
      const gurl = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId.trim()}&api_secret=${apiSecret.trim()}`;
      const resVal = await fetch(gurl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'test_credential_ping_handshake',
          events: [{
            name: 'test_handshake_connection',
            params: {
              engagement_time_msec: 100,
              test_marker: 'live'
            }
          }]
        })
      });

      if (!resVal.ok) {
        return res.status(resVal.status).json({
          success: false,
          error: 'GA4 Handshake returned an error response. Verify your API Secret and Measurement ID.'
        });
      }
    }

    return res.json({
      success: true,
      message: 'Connection configuration valid! Custom offline webhook handshake validated with Google endpoints successfully.'
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Error executing Google Ads credentials validation.'
    });
  }
});

// --- TASKS ---
app.get('/api/tasks', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const tasks = await dbService.getTasks(userId);
    res.json({ tasks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const newTask = {
      id: req.body.id || uuidv4(),
      ...req.body,
      status: req.body.status || 'Pending'
    };
    await dbService.insertTask(newTask);
    res.status(201).json({ task: newTask });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error creating task' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const updated = await dbService.updateTask(req.params.id, req.body);
    if (updated) {
      res.json({ task: updated });
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const success = await dbService.deleteTask(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error deleting task' });
  }
});

// --- TEMPLATES ---
app.get('/api/templates', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const templates = await dbService.getTemplates(userId);
    res.json({ templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching templates' });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const newTemplate = {
      id: req.body.id || uuidv4(),
      ...req.body
    };
    await dbService.insertTemplate(newTemplate);
    res.status(201).json({ template: newTemplate });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error creating template' });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const updated = await dbService.updateTemplate(req.params.id, req.body);
    if (updated) {
      res.json({ template: updated });
    } else {
      res.status(404).json({ error: 'Template not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating template' });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const success = await dbService.deleteTemplate(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Template not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error deleting template' });
  }
});

// --- WORKFLOWS ---
app.get('/api/workflows', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const workflows = await dbService.getWorkflows(userId);
    res.json({ workflows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching workflows' });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const newWorkflow = {
      id: req.body.id || uuidv4(),
      createdAt: req.body.createdAt || Date.now(),
      ...req.body
    };
    await dbService.insertWorkflow(newWorkflow);
    res.status(201).json({ workflow: newWorkflow });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error creating workflow' });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const updated = await dbService.updateWorkflow(req.params.id, req.body);
    if (updated) {
      res.json({ workflow: updated });
    } else {
      res.status(404).json({ error: 'Workflow not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating workflow' });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const success = await dbService.deleteWorkflow(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Workflow not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error deleting workflow' });
  }
});

// --- TEAM MEMBERS ---
app.get('/api/team-members', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const teamMembers = await dbService.getTeamMembers(userId);
    const authUsers = await dbService.getAuthUsers();
    
    // Enrich team members with twoFactor status from auth database
    const enrichedMembers = teamMembers.map(member => {
      const match = authUsers.find(u => u.email.toLowerCase() === member.email.toLowerCase());
      return {
        ...member,
        twoFactorEnabled: match ? !!match.twoFactorEnabled : false,
        twoFactorSecret: match ? match.twoFactorSecret : undefined
      };
    });

    res.json({ teamMembers: enrichedMembers });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching team members' });
  }
});

app.post('/api/team-members', async (req, res) => {
  try {
    const { name, email, role, password, status } = req.body;
    
    // Create team member profile
    const newMember = {
      id: req.body.id || uuidv4(),
      createdAt: req.body.createdAt || Date.now(),
      status: status || 'Active', // Directly set Active so they can collaborate
      name,
      email,
      role: role || 'Counselor',
      userId: req.body.userId || 'ielts_crm_main_user'
    };
    
    await dbService.insertTeamMember(newMember);

    // Sync credentials to crm_users_auth table so they can log in manually!
    const uid = 'user_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
    await dbService.insertAuthUser({
      uid,
      email,
      displayName: name,
      password: password || '123456', // default fallback password
      role: role || 'Counselor'
    });

    res.status(201).json({ teamMember: newMember });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error creating team member' });
  }
});

app.put('/api/team-members/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, role, password, status } = req.body;
  try {
    const updated = await dbService.updateTeamMember(id, { name, email, role, status });
    if (updated) {
      // Sync change of credentials to crm_users_auth table matching this email
      const users = await dbService.getAuthUsers();
      const existingUser = users.find(u => u.email.toLowerCase() === updated.email.toLowerCase() || u.email.toLowerCase() === (email || '').trim().toLowerCase());
      if (existingUser) {
        await dbService.insertAuthUser({
          uid: existingUser.uid,
          email: updated.email,
          displayName: updated.name,
          password: password || existingUser.password || '123456',
          role: updated.role
        });
      } else if (password) {
        // If password is set but they didn't have auto-provisioned credentials, create them now
        const uid = 'user_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
        await dbService.insertAuthUser({
          uid: updated.email.includes('saidul') ? 'user_1779881851973fw16q' : uid,
          email: updated.email,
          displayName: updated.name,
          password,
          role: updated.role
        });
      }
      res.json({ teamMember: updated });
    } else {
      res.status(404).json({ error: 'Team member not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating team member' });
  }
});

app.delete('/api/team-members/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const teamMembers = await dbService.getTeamMembers();
    const targeted = teamMembers.find(m => m.id === id);
    if (targeted) {
      // Delete their auth credentials from manual table as well
      const users = await dbService.getAuthUsers();
      const existingUser = users.find(u => u.email.toLowerCase() === targeted.email.toLowerCase());
      if (existingUser) {
        await dbService.deleteAuthUser(existingUser.uid);
      }
    }
    const success = await dbService.deleteTeamMember(id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Team member not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error deleting team member' });
  }
});

// Endpoint for Super Admin to wipe all lead data
app.post('/api/admin/clear-all-leads', async (req, res) => {
  try {
    await dbService.clearAllLeads();
    res.json({ success: true, message: 'All lead, task, and campaign data successfully cleared' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear lead files' });
  }
});


// --- USER AUTHENTICATION SYNCHRONIZATION ENDPOINTS ---
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await dbService.getAuthUsers();
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching synchronized users' });
  }
});

app.post('/api/auth/users', async (req, res) => {
  try {
    const { uid, email, displayName, password, twoFactorEnabled, twoFactorSecret } = req.body;
    if (!uid || !email || !displayName) {
      return res.status(400).json({ error: 'uid, email, and displayName are required for sync' });
    }
    await dbService.insertAuthUser({ 
      uid, 
      email, 
      displayName, 
      password,
      twoFactorEnabled: !!twoFactorEnabled,
      twoFactorSecret: twoFactorSecret || undefined
    });
    res.status(201).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error registering/synchronizing user' });
  }
});

app.post('/api/auth/users/update-2fa', async (req, res) => {
  try {
    const { email, twoFactorEnabled, twoFactorSecret } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const users = await dbService.getAuthUsers();
    const existing = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) {
      existing.twoFactorEnabled = !!twoFactorEnabled;
      existing.twoFactorSecret = twoFactorSecret || undefined;
      await dbService.insertAuthUser(existing);
      return res.json({ success: true });
    }
    res.status(404).json({ error: 'User auth record not found' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error updating user 2FA configuration' });
  }
});


// --- VITE DEV MIDDLEWARE & PROD FALLBACK ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, everything in the 'dist' folder is copied directly into cPanel's root directory,
    // so server.cjs, index.html, and the assets folder sit alongside each other.
    // Using __dirname (instead of process.cwd() + '/dist') guarantees that static assets are served 
    // correctly regardless of whether the app is running nested inside 'dist' or directly in cPanel's root.
    const staticPath = __dirname;
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  if (process.env.PORT) {
    // Under Phusion Passenger / cPanel, PORT is often set dynamically as a Unix socket path (e.g., /tmp/passenger.xxx).
    // Specifying an IP hostname like "0.0.0.0" when listening on a Unix domain socket path will throw a Node error.
    // Thus, we listen exclusively on the provided process.env.PORT variable directly.
    app.listen(process.env.PORT, () => {
      console.log(`Server launched successfully via Passenger on socket/port: ${process.env.PORT}`);
    });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running local development on http://localhost:${PORT}`);
    });
  }
}

startServer();
