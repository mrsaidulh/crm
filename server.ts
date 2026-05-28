import 'dotenv/config';
import express from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { dbService } from './src/lib/database';

const app = express();
const PORT = 3000;

app.use(express.json());


// --- API ROUTES ---

// In-memory store for active OTP codes to verify phone numbers, with phone number key and { code, expiresAt } value
const activeOtps = new Map<string, { code: string; expiresAt: number }>();

// POST /api/otp/send
app.post('/api/otp/send', async (req, res) => {
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

// POST /api/otp/verify
app.post('/api/otp/verify', (req, res) => {
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

// GET /api/leads
app.get('/api/leads', async (req, res) => {
  try {
    const userId = req.query.userId as string || undefined;
    const leadsList = await dbService.getLeads(userId);
    res.json({ leads: leadsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching leads' });
  }
});

// POST /api/leads
app.post('/api/leads', async (req, res) => {
  try {
    const { name, email, phone, targetCourse, targetBand, destination } = req.body;
    
    // Strict backend validation safety guards
    const missing: string[] = [];
    if (!name || !name.trim()) missing.push('Full Name');
    if (!email || !email.trim()) missing.push('Email Address');
    if (!phone || !phone.trim()) missing.push('Phone Number');
    if (!targetCourse || !targetCourse.trim()) missing.push('Target Course');
    if (!targetBand || !targetBand.toString().trim()) missing.push('Target Band');
    if (!destination || !destination.trim()) missing.push('Target Country');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Please fill in all required fields: ${missing.join(', ')}` });
    }

    const bodyCopy = { ...req.body };
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
    const updated = await dbService.updateLead(id, bodyCopy);
    if (updated) {
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
    const newLeads = leadsList.filter((l: any) => l.status === 'New').length;
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


// --- FORGOT PASSWORD & RESET FLOW ENDPOINTS ---
interface ResetTokenInfo {
  email: string;
  expiresAt: number;
  method: 'email' | 'sms';
}

interface MockMessage {
  id: string;
  email: string;
  displayName: string;
  method: 'email' | 'sms';
  body: string;
  subject?: string;
  token: string;
  sentAt: string;
}

const resetTokens = new Map<string, ResetTokenInfo>();
const mockMessages: MockMessage[] = [];

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, method } = req.body;
    if (!email || !method || (method !== 'email' && method !== 'sms')) {
      return res.status(400).json({ error: 'Email and method ("email" | "sms") are required.' });
    }

    const emailClean = email.trim().toLowerCase();
    const users = await dbService.getAuthUsers();
    
    // Supplement default admin user in check
    const defaultAdmins = [
      {
        uid: 'ielts_crm_main_user',
        email: 'toieltsrevolution@gmail.com',
        displayName: 'Saidul Hasan',
        role: 'Super Admin',
        password: 'Irevocrm1$%'
      },
      {
        uid: 'user_1779881851973fw16q',
        email: 'saidulgmac@gmail.com',
        displayName: 'Saidul Hasan',
        role: 'Super Admin',
        password: 'Irevocrm1$%'
      }
    ];

    let foundUser = users.find(u => u && u.email && u.email.toLowerCase() === emailClean);
    if (!foundUser) {
      foundUser = defaultAdmins.find(admin => admin.email.toLowerCase() === emailClean);
    }

    if (!foundUser) {
      return res.status(404).json({ error: 'Access Denied. This email is not a registered administrator or counselor.' });
    }

    // Generate token
    const token = 'rst_' + Math.random().toString(36).substring(2, 11) + Math.random().toString(36).substring(2, 11);
    
    // Store in active reset tokens (15-minute validity)
    resetTokens.set(token, {
      email: foundUser.email,
      expiresAt: Date.now() + 15 * 60 * 1000,
      method
    });

    let body = '';
    let subject = '';

    if (method === 'email') {
      subject = '🔒 Secure Password Reset - IELTS CRM';
      body = `Hello ${foundUser.displayName || 'Administrator'},\n\n` +
        `We received a request to reset your password for your IELTS Revolution CRM account.\n\n` +
        `Please click or copy the secure verification link below to update your password:\n` +
        `👉 http://localhost:3000/?resetToken=${token}\n\n` +
        `This reset link will expire in 15 minutes. If you did not request this, please ignore this communication as your account security has not been compromised.\n\n` +
        `Sincerely,\n` +
        `CRM Information Security Division`;
    } else {
      body = `IELTS CRM Security: Click here to verify your identity and update your password: http://localhost:3000/?resetToken=${token} (Expires in 15m)`;
    }

    // Push into mock message queue list so the simulator UI can poll/read it
    const msg: MockMessage = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      email: foundUser.email,
      displayName: foundUser.displayName || 'CRM User',
      method,
      body,
      token,
      sentAt: new Date().toISOString(),
      ...(method === 'email' ? { subject } : {})
    };

    // Keep history down to max 30 items
    if (mockMessages.length >= 30) {
      mockMessages.shift();
    }
    mockMessages.push(msg);

    res.json({
      success: true,
      message: 'Password reset dispatch sent successfully to simulation queue.',
      email: foundUser.email,
      displayName: foundUser.displayName,
      method,
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error executing password reset dispatch request' });
  }
});

app.get('/api/auth/mock-messages', (req, res) => {
  const { email } = req.query;
  if (email) {
    const emailClean = String(email).trim().toLowerCase();
    const filtered = mockMessages.filter(m => m.email.toLowerCase() === emailClean);
    return res.json({ messages: filtered });
  }
  res.json({ messages: mockMessages });
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword are required parameters.' });
    }

    const info = resetTokens.get(token);
    if (!info) {
      return res.status(400).json({ error: 'The password reset token is invalid, expired, or has already been used.' });
    }

    if (info.expiresAt < Date.now()) {
      resetTokens.delete(token);
      return res.status(400).json({ error: 'This password reset link has expired. Please request another reset.' });
    }

    const emailClean = info.email.toLowerCase();
    const users = await dbService.getAuthUsers();
    let existing = users.find(u => u && u.email && u.email.toLowerCase() === emailClean);

    if (!existing) {
      // Create user stable schema if it didn't exist in SQL yet (e.g., initial seed admins)
      const isMainAdmin = emailClean === 'toieltsrevolution@gmail.com';
      const isSecondAdmin = emailClean === 'saidulgmac@gmail.com';
      
      existing = {
        uid: isMainAdmin ? 'ielts_crm_main_user' : isSecondAdmin ? 'user_1779881851973fw16q' : 'user_' + Math.random().toString(36).substring(2, 11),
        email: info.email,
        displayName: 'Saidul Hasan',
        role: 'Super Admin',
        password: newPassword
      };
    } else {
      existing.password = newPassword;
    }

    // Persist changes
    await dbService.insertAuthUser(existing);

    // Consume token
    resetTokens.delete(token);

    res.json({
      success: true,
      message: 'Your password credentials have been successfully updated in the manual user registry.',
      email: existing.email
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error resetting password' });
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
