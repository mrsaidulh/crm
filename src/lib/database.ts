import mysql from 'mysql2/promise';
import { Lead, Campaign, AuditLog, Task, Template, WorkflowRule, UserSettings, TeamMember } from '../types';

export interface ManualAuthUser {
  uid: string;
  email: string;
  displayName: string;
  password?: string;
  role?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

// hold our in-memory fallback list
let inMemoryLeads: Lead[] = [];

let inMemoryCampaigns: Campaign[] = [];

let inMemoryAuditLogs: AuditLog[] = [
  {
    id: 'log_init_1',
    userId: 'ielts_crm_main_user',
    action: 'System Initialized',
    entityType: 'system',
    entityId: 'system',
    details: 'IELTS Revolution CRM system has completed database boot sequence successfully.',
    createdAt: Date.now() - 86400000 * 2
  }
];

let inMemoryTasks: Task[] = [];
let inMemoryTemplates: Template[] = [];
let inMemoryWorkflows: WorkflowRule[] = [];
let inMemorySettings: Record<string, UserSettings> = {};
let inMemoryTeamMembers: TeamMember[] = [];
let inMemoryUsers: ManualAuthUser[] = [];

// Convert DB row to domain Tasks object
function mapDbRowToTask(r: any): Task {
  return {
    id: r.id,
    userId: r.user_id,
    leadId: r.lead_id,
    leadName: r.lead_name || undefined,
    title: r.title,
    description: r.description || undefined,
    dueDate: typeof r.due_date === 'number' ? r.due_date : Number(r.due_date || Date.now()),
    reminderDate: r.reminder_date ? (typeof r.reminder_date === 'number' ? r.reminder_date : Number(r.reminder_date)) : undefined,
    taskType: r.task_type || undefined,
    assignee: r.assignee || undefined,
    status: r.status,
    comments: r.comments ? (typeof r.comments === 'string' ? JSON.parse(r.comments) : r.comments) : undefined
  };
}

// Convert DB row to domain Template object
function mapDbRowToTemplate(r: any): Template {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    type: r.type,
    subject: r.subject || undefined,
    body: r.body
  };
}

// Convert DB row to domain Workflow object
function mapDbRowToWorkflow(r: any): WorkflowRule {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    triggerEvent: r.trigger_event,
    triggerCondition: r.trigger_condition || undefined,
    actionType: r.action_type,
    actionTemplateId: r.action_template_id || undefined,
    taskTitle: r.task_title || undefined,
    n8nWebhookUrl: r.n8n_webhook_url || undefined,
    isActive: !!r.is_active,
    createdAt: typeof r.created_at === 'number' ? r.created_at : Number(r.created_at || Date.now())
  };
}

// Convert DB row to domain UserSettings object
function mapDbRowToSettings(r: any): UserSettings {
  return {
    smsProvider: r.sms_provider as any || undefined,
    smsApiUrl: r.sms_api_url || undefined,
    smsApiKey: r.sms_api_key || undefined,
    smsSenderId: r.sms_sender_id || undefined,
    smsClientId: r.sms_client_id || undefined,
    smtpHost: r.smtp_host || undefined,
    smtpPort: r.smtp_port || undefined,
    smtpUsername: r.smtp_username || undefined,
    smtpPassword: r.smtp_password || undefined,
    smtpFromEmail: r.smtp_from_email || undefined,
    smtpFromName: r.smtp_from_name || undefined,
    smtpEncryption: r.smtp_encryption as any || undefined,
    n8nLeadCreatedUrl: r.n8n_lead_created_url || undefined,
    n8nStatusChangedUrl: r.n8n_status_changed_url || undefined,
    n8nTaskReminderUrl: r.n8n_task_reminder_url || undefined,
    metaEnabled: r.meta_enabled === 1,
    metaPixelId: r.meta_pixel_id || undefined,
    metaAccessToken: r.meta_access_token || undefined,
    metaTestEventCode: r.meta_test_event_code || undefined,
    metaMapping: r.meta_mapping ? (typeof r.meta_mapping === 'string' ? JSON.parse(r.meta_mapping) : r.meta_mapping) : undefined,
    claudeEnabled: r.claude_enabled === 1,
    claudeApiKey: r.claude_api_key || undefined,
    claudeDefaultModel: r.claude_default_model || undefined,
    claudeSystemPrompt: r.claude_system_prompt || undefined,
    googleEnabled: r.google_enabled === 1,
    googleConversionId: r.google_conversion_id || undefined,
    googleConversionLabel: r.google_conversion_label || undefined,
    googleMeasurementId: r.google_measurement_id || undefined,
    googleApiSecret: r.google_api_secret || undefined,
    googleMapping: r.google_mapping ? (typeof r.google_mapping === 'string' ? JSON.parse(r.google_mapping) : r.google_mapping) : undefined
  };
}

// Convert DB row to domain TeamMember object
function mapDbRowToTeamMember(r: any): TeamMember {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: typeof r.created_at === 'number' ? r.created_at : Number(r.created_at || Date.now())
  };
}

// Convert DB row to domain ManualAuthUser object
function mapDbRowToUser(r: any): ManualAuthUser {
  return {
    uid: r.uid,
    email: r.email,
    displayName: r.display_name,
    password: r.password || undefined,
    role: r.role || 'Counselor',
    twoFactorSecret: r.two_factor_secret || undefined,
    twoFactorEnabled: r.two_factor_enabled === 1 || r.two_factor_enabled === true
  };
}



// Determine if MySQL credentials are provided (supporting both DB_ and MYSQL_ prefixes)
const dbHost = process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306');
const dbUser = process.env.MYSQL_USER || process.env.DB_USER || 'mockhub_crmuser';
const dbPassword = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || 'Crmuser1$%';
const dbName = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'mockhub_crm';

let pool: mysql.Pool | null = null;
let connectionError: string | null = null;

try {
  const tempPool = mysql.createPool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 5000 // 5 seconds connection handshake timeout
  });
  
  // Proactively check handshake connection asynchronously to prevent error logs spamming
  tempPool.getConnection()
    .then(async (conn) => {
      console.log(`[MySQL] Active Handshake Succeeded. Database cPanel is live and connected at ${dbHost}:${dbPort}`);
      
      try {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS \`crm_users_auth\` (
            \`uid\` VARCHAR(128) NOT NULL,
            \`email\` VARCHAR(255) NOT NULL,
            \`display_name\` VARCHAR(255) NOT NULL,
            \`password\` VARCHAR(255) DEFAULT NULL,
            \`role\` VARCHAR(64) DEFAULT 'Counselor',
            \`two_factor_secret\` VARCHAR(255) DEFAULT NULL,
            \`two_factor_enabled\` TINYINT DEFAULT 0,
            PRIMARY KEY (\`uid\`),
            UNIQUE KEY \`uniq_email_auth\` (\`email\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        
        // Ensure role column is present if the database table had been created earlier
        try {
          await conn.query("ALTER TABLE `crm_users_auth` ADD COLUMN `role` VARCHAR(64) DEFAULT 'Counselor'");
        } catch (alterColErr) {
          // Column already exists
        }
        try {
          await conn.query("ALTER TABLE `crm_users_auth` ADD COLUMN `two_factor_secret` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {
          // Column already exists
        }
        try {
          await conn.query("ALTER TABLE `crm_users_auth` ADD COLUMN `two_factor_enabled` TINYINT DEFAULT 0");
        } catch (alterColErr) {
          // Column already exists
        }

        // Ensure Meta Conversions API columns are present on settings table
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `meta_enabled` TINYINT DEFAULT 0");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `meta_pixel_id` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `meta_access_token` TEXT DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `meta_test_event_code` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `meta_mapping` JSON DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `claude_enabled` TINYINT DEFAULT 0");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `claude_api_key` TEXT DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `claude_default_model` VARCHAR(128) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `claude_system_prompt` TEXT DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_enabled` TINYINT DEFAULT 0");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_conversion_id` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_conversion_label` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_measurement_id` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_api_secret` VARCHAR(255) DEFAULT NULL");
        } catch (alterColErr) {}
        try {
          await conn.query("ALTER TABLE `settings` ADD COLUMN `google_mapping` JSON DEFAULT NULL");
        } catch (alterColErr) {}

        // Wipe all previous lead and activity logs data as requested by the user
        await conn.query('DELETE FROM `leads`');
        await conn.query('DELETE FROM `tasks`');
        await conn.query('DELETE FROM `campaigns`');
        console.log('[MySQL] Auto-initialized crm_users_auth table, added safety Columns, and wiped previous lead/task data successfully.');
      } catch (tableErr: any) {
        console.warn('[MySQL] Failed to auto-create and alter tables or wipe previous data:', tableErr.message);
      }

      pool = tempPool; // Only make the pool active once connection is proven healthy
      conn.release();
    })
    .catch((err) => {
      connectionError = err.message || String(err);
      console.warn(`[MySQL] Connection refused on ${dbHost}:${dbPort}. System is falling back silently to localized high-performance in-memory simulation mode.`);
      console.warn(`[MySQL] Probe Message: ${err.message || err}`);
      tempPool.end().catch(() => {});
    });

} catch (err: any) {
  connectionError = err.message || String(err);
  console.error('[MySQL] Error initializing connection pool. Falling back to simulation mode:', err);
}

// Convert DB row to domain Lead object
function mapDbRowToLead(row: any): Lead {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    notes: row.notes || undefined,
    expectedValue: row.expected_value !== null ? Number(row.expected_value) : undefined,
    targetCourse: row.target_course || undefined,
    targetBand: row.target_band || undefined,
    destination: row.destination || undefined,
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : undefined,
    mockScores: row.mock_scores ? (typeof row.mock_scores === 'string' ? JSON.parse(row.mock_scores) : row.mock_scores) : undefined,
    communications: row.communications ? (typeof row.communications === 'string' ? JSON.parse(row.communications) : row.communications) : undefined,
    preferences: row.preferences ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences) : undefined,
    leadScore: row.lead_score !== null ? Number(row.lead_score) : undefined,
    createdAt: typeof row.created_at === 'number' ? row.created_at : Number(row.created_at || Date.now()),
  };
}

export const dbService = {
  // --- LEADS INTERACTION ROUTES ---
  
  async getLeads(userId?: string): Promise<Lead[]> {
    let list: Lead[] = [];
    if (pool) {
      try {
        const [results] = await pool.execute('SELECT * FROM leads ORDER BY created_at DESC');
        const rows = results as any[];
        list = rows.map(mapDbRowToLead);
      } catch (err) {
        console.error('[MySQL] getLeads failed. Falling back to in-memory store:', err);
        list = inMemoryLeads;
      }
    } else {
      // Fallback to In-memory logic
      list = inMemoryLeads;
    }
    return list.filter(l => l && l.email?.toLowerCase().trim() !== 'sdflj@gmail.com' && l.name?.trim() !== 'Saidul');
  },

  async getLeadById(id: string): Promise<Lead | null> {
    if (pool) {
      try {
        const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToLead(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] getLeadById failed:', err);
      }
    }
    return inMemoryLeads.find(l => l.id === id) || null;
  },

  async insertLead(lead: Lead): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO leads (
            id, user_id, name, email, phone, source, status, expected_value, notes, 
            target_course, target_band, destination, tags, mock_scores, communications, 
            preferences, lead_score, phone_verified, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(sql, [
          lead.id,
          lead.userId || 'ielts_crm_main_user',
          lead.name,
          lead.email,
          lead.phone,
          lead.source,
          lead.status,
          lead.expectedValue || 0,
          lead.notes || null,
          lead.targetCourse || 'IELTS Academic',
          lead.targetBand || null,
          lead.destination || 'United Kingdom',
          JSON.stringify(lead.tags || []),
          JSON.stringify(lead.mockScores || []),
          JSON.stringify(lead.communications || []),
          JSON.stringify(lead.preferences || {}),
          lead.leadScore || 50,
          1, // phone verified is true upon register completion
          lead.createdAt || Date.now()
        ]);
        console.log(`[MySQL] Inserted lead ${lead.id} successfully`);
        return;
      } catch (err) {
        console.error('[MySQL] insertLead failed. Falling back to in-memory store:', err);
      }
    }
    // Fallback logic
    inMemoryLeads.unshift(lead);
  },

  async updateLeadStatus(id: string, status: string): Promise<Lead | null> {
    if (pool) {
      try {
        await pool.execute('UPDATE leads SET status = ? WHERE id = ?', [status, id]);
        const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToLead(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateLeadStatus failed. Falling back to in-memory store:', err);
      }
    }
    // Fallback logic
    const lead = inMemoryLeads.find(l => l.id === id);
    if (lead) {
      lead.status = status as any;
      return lead;
    }
    return null;
  },

  async updateLead(id: string, updateData: Partial<Lead>): Promise<Lead | null> {
    if (pool) {
      try {
        // Build SQL dynamically based on keys
        const keysToUpdate: string[] = [];
        const params: any[] = [];
        
        if (updateData.name !== undefined) { keysToUpdate.push('name = ?'); params.push(updateData.name); }
        if (updateData.email !== undefined) { keysToUpdate.push('email = ?'); params.push(updateData.email); }
        if (updateData.phone !== undefined) { keysToUpdate.push('phone = ?'); params.push(updateData.phone); }
        if (updateData.source !== undefined) { keysToUpdate.push('source = ?'); params.push(updateData.source); }
        if (updateData.status !== undefined) { keysToUpdate.push('status = ?'); params.push(updateData.status); }
        if (updateData.expectedValue !== undefined) { keysToUpdate.push('expected_value = ?'); params.push(updateData.expectedValue); }
        if (updateData.notes !== undefined) { keysToUpdate.push('notes = ?'); params.push(updateData.notes); }
        if (updateData.targetCourse !== undefined) { keysToUpdate.push('target_course = ?'); params.push(updateData.targetCourse); }
        if (updateData.targetBand !== undefined) { keysToUpdate.push('target_band = ?'); params.push(updateData.targetBand); }
        if (updateData.destination !== undefined) { keysToUpdate.push('destination = ?'); params.push(updateData.destination); }
        if (updateData.tags !== undefined) { keysToUpdate.push('tags = ?'); params.push(JSON.stringify(updateData.tags)); }
        if (updateData.mockScores !== undefined) { keysToUpdate.push('mock_scores = ?'); params.push(JSON.stringify(updateData.mockScores)); }
        if (updateData.communications !== undefined) { keysToUpdate.push('communications = ?'); params.push(JSON.stringify(updateData.communications)); }
        if (updateData.preferences !== undefined) { keysToUpdate.push('preferences = ?'); params.push(JSON.stringify(updateData.preferences)); }
        if (updateData.leadScore !== undefined) { keysToUpdate.push('lead_score = ?'); params.push(updateData.leadScore); }

        if (keysToUpdate.length > 0) {
          const sql = `UPDATE leads SET ${keysToUpdate.join(', ')} WHERE id = ?`;
          params.push(id);
          await pool.execute(sql, params);
        }

        const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToLead(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateLead failed. Falling back to in-memory store:', err);
      }
    }
    // Fallback logic
    const index = inMemoryLeads.findIndex(l => l.id === id);
    if (index !== -1) {
      inMemoryLeads[index] = { ...inMemoryLeads[index], ...updateData };
      return inMemoryLeads[index];
    }
    return null;
  },

  async deleteLead(id: string): Promise<Lead | null> {
    if (pool) {
      try {
        const [rows] = await pool.execute('SELECT * FROM leads WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          const oldLead = mapDbRowToLead(results[0]);
          await pool.execute('DELETE FROM leads WHERE id = ?', [id]);
          return oldLead;
        }
        return null;
      } catch (err) {
        console.error('[MySQL] deleteLead failed. Falling back to in-memory:', err);
      }
    }
    // Fallback logic
    const index = inMemoryLeads.findIndex(l => l.id === id);
    if (index !== -1) {
      const deleted = inMemoryLeads.splice(index, 1);
      return deleted[0];
    }
    return null;
  },

  // --- CAMPAIGNS INTERACTION ROUTES ---
  
  async getCampaigns(userId?: string): Promise<Campaign[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM campaigns WHERE user_id = ? ORDER BY sent_at DESC', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM campaigns ORDER BY sent_at DESC');
          rows = results as any[];
        }
        return rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          type: r.type,
          audience: r.audience,
          subject: r.subject || undefined,
          message: r.message || undefined,
          body: r.body || undefined,
          sentAt: typeof r.sent_at === 'number' ? r.sent_at : Number(r.sent_at || Date.now()),
          status: r.status
        }));
      } catch (err) {
        console.error('[MySQL] getCampaigns failed. Falling back to in-memory:', err);
      }
    }
    // Fallback
    if (userId) {
      return inMemoryCampaigns.filter(c => c.userId === userId);
    }
    return inMemoryCampaigns;
  },

  async insertCampaign(campaign: Campaign): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO campaigns (id, user_id, type, audience, subject, message, body, sent_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(sql, [
          campaign.id,
          campaign.userId || 'ielts_crm_main_user',
          campaign.type,
          campaign.audience,
          campaign.subject || null,
          campaign.message || null,
          campaign.body || null,
          campaign.sentAt || Date.now(),
          campaign.status || 'Sent'
        ]);
        console.log(`[MySQL] Logged campaign ${campaign.id} successfully`);
        return;
      } catch (err) {
        console.error('[MySQL] insertCampaign failed. Falling back to in-memory:', err);
      }
    }
    // Fallback
    inMemoryCampaigns.unshift(campaign);
  },

  // --- AUDIT LOGS INTERACTION ROUTES ---
  
  async getAuditLogs(userId?: string): Promise<AuditLog[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM audit_logs ORDER BY created_at DESC');
          rows = results as any[];
        }
        return rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          action: r.action,
          entityType: r.entity_type || undefined,
          entityId: r.entity_id || undefined,
          details: r.details || '',
          createdAt: typeof r.created_at === 'number' ? r.created_at : Number(r.created_at || Date.now())
        }));
      } catch (err) {
        console.error('[MySQL] getAuditLogs failed. Falling back to in-memory:', err);
      }
    }
    // Fallback
    if (userId) {
      return inMemoryAuditLogs.filter(log => log.userId === userId);
    }
    return inMemoryAuditLogs;
  },

  async insertAuditLog(log: AuditLog): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(sql, [
          log.id,
          log.userId || 'ielts_crm_main_user',
          log.action,
          log.entityType || null,
          log.entityId || null,
          log.details || '',
          log.createdAt || Date.now()
        ]);
        console.log(`[MySQL] Saved audit log ${log.id} successfully`);
        return;
      } catch (err) {
        console.error('[MySQL] insertAuditLog failed. Falling back to in-memory:', err);
      }
    }
    // Fallback
    inMemoryAuditLogs.unshift(log);
  },

  async clearAuditLogs(userId?: string): Promise<void> {
    if (pool) {
      try {
        if (userId) {
          await pool.execute('DELETE FROM audit_logs WHERE user_id = ?', [userId]);
        } else {
          await pool.execute('DELETE FROM audit_logs');
        }
        console.log(`[MySQL] Cleared logs for user: ${userId || 'All'}`);
        return;
      } catch (err) {
        console.error('[MySQL] clearAuditLogs failed:', err);
      }
    }
    // Fallback
    if (userId) {
      inMemoryAuditLogs = inMemoryAuditLogs.filter(log => log.userId !== userId);
    } else {
      inMemoryAuditLogs = [];
    }
  },

  // --- SETTINGS ---
  async getSettings(userId: string): Promise<UserSettings | null> {
    if (pool) {
      try {
        const [rows] = await pool.execute('SELECT * FROM settings WHERE user_id = ?', [userId]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToSettings(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] getSettings failed:', err);
      }
    }
    return inMemorySettings[userId] || null;
  },

  async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO settings (
            user_id, sms_provider, sms_api_url, sms_api_key, sms_sender_id, sms_client_id,
            smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_encryption,
            n8n_lead_created_url, n8n_status_changed_url, n8n_task_reminder_url,
            meta_enabled, meta_pixel_id, meta_access_token, meta_test_event_code, meta_mapping,
            claude_enabled, claude_api_key, claude_default_model, claude_system_prompt,
            google_enabled, google_conversion_id, google_conversion_label, google_measurement_id, google_api_secret, google_mapping
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            sms_provider = VALUES(sms_provider),
            sms_api_url = VALUES(sms_api_url),
            sms_api_key = VALUES(sms_api_key),
            sms_sender_id = VALUES(sms_sender_id),
            sms_client_id = VALUES(sms_client_id),
            smtp_host = VALUES(smtp_host),
            smtp_port = VALUES(smtp_port),
            smtp_username = VALUES(smtp_username),
            smtp_password = VALUES(smtp_password),
            smtp_from_email = VALUES(smtp_from_email),
            smtp_from_name = VALUES(smtp_from_name),
            smtp_encryption = VALUES(smtp_encryption),
            n8n_lead_created_url = VALUES(n8n_lead_created_url),
            n8n_status_changed_url = VALUES(n8n_status_changed_url),
            n8n_task_reminder_url = VALUES(n8n_task_reminder_url),
            meta_enabled = VALUES(meta_enabled),
            meta_pixel_id = VALUES(meta_pixel_id),
            meta_access_token = VALUES(meta_access_token),
            meta_test_event_code = VALUES(meta_test_event_code),
            meta_mapping = VALUES(meta_mapping),
            claude_enabled = VALUES(claude_enabled),
            claude_api_key = VALUES(claude_api_key),
            claude_default_model = VALUES(claude_default_model),
            claude_system_prompt = VALUES(claude_system_prompt),
            google_enabled = VALUES(google_enabled),
            google_conversion_id = VALUES(google_conversion_id),
            google_conversion_label = VALUES(google_conversion_label),
            google_measurement_id = VALUES(google_measurement_id),
            google_api_secret = VALUES(google_api_secret),
            google_mapping = VALUES(google_mapping)
        `;
        await pool.execute(sql, [
          userId,
          settings.smsProvider || 'bulk_sms_bd',
          settings.smsApiUrl || null,
          settings.smsApiKey || null,
          settings.smsSenderId || null,
          settings.smsClientId || null,
          settings.smtpHost || null,
          settings.smtpPort || null,
          settings.smtpUsername || null,
          settings.smtpPassword || null,
          settings.smtpFromEmail || null,
          settings.smtpFromName || null,
          settings.smtpEncryption || 'tls',
          settings.n8nLeadCreatedUrl || null,
          settings.n8nStatusChangedUrl || null,
          settings.n8nTaskReminderUrl || null,
          settings.metaEnabled ? 1 : 0,
          settings.metaPixelId || null,
          settings.metaAccessToken || null,
          settings.metaTestEventCode || null,
          settings.metaMapping ? JSON.stringify(settings.metaMapping) : null,
          settings.claudeEnabled ? 1 : 0,
          settings.claudeApiKey || null,
          settings.claudeDefaultModel || null,
          settings.claudeSystemPrompt || null,
          settings.googleEnabled ? 1 : 0,
          settings.googleConversionId || null,
          settings.googleConversionLabel || null,
          settings.googleMeasurementId || null,
          settings.googleApiSecret || null,
          settings.googleMapping ? JSON.stringify(settings.googleMapping) : null
        ]);
        console.log(`[MySQL] Saved settings for user ${userId}`);
        return;
      } catch (err) {
        console.error('[MySQL] saveSettings failed:', err);
      }
    }
    inMemorySettings[userId] = settings;
  },

  // --- TASKS ---
  async getTasks(userId?: string): Promise<Task[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date ASC', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM tasks ORDER BY due_date ASC');
          rows = results as any[];
        }
        return rows.map(mapDbRowToTask);
      } catch (err) {
        console.error('[MySQL] getTasks failed:', err);
      }
    }
    if (userId) {
      return inMemoryTasks.filter(t => t.userId === userId);
    }
    return inMemoryTasks;
  },

  async insertTask(task: Task): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO tasks (id, user_id, lead_id, lead_name, title, description, due_date, reminder_date, task_type, assignee, status, comments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(sql, [
          task.id,
          task.userId || 'ielts_crm_main_user',
          task.leadId,
          task.leadName || null,
          task.title,
          task.description || null,
          task.dueDate,
          task.reminderDate || null,
          task.taskType || 'General',
          task.assignee || null,
          task.status || 'Pending',
          JSON.stringify(task.comments || [])
        ]);
        return;
      } catch (err) {
        console.error('[MySQL] insertTask failed:', err);
      }
    }
    inMemoryTasks.unshift(task);
  },

  async updateTask(id: string, task: Partial<Task>): Promise<Task | null> {
    if (pool) {
      try {
        const keysToUpdate: string[] = [];
        const params: any[] = [];
        if (task.title !== undefined) { keysToUpdate.push('title = ?'); params.push(task.title); }
        if (task.description !== undefined) { keysToUpdate.push('description = ?'); params.push(task.description); }
        if (task.dueDate !== undefined) { keysToUpdate.push('due_date = ?'); params.push(task.dueDate); }
        if (task.reminderDate !== undefined) { keysToUpdate.push('reminder_date = ?'); params.push(task.reminderDate); }
        if (task.taskType !== undefined) { keysToUpdate.push('task_type = ?'); params.push(task.taskType); }
        if (task.assignee !== undefined) { keysToUpdate.push('assignee = ?'); params.push(task.assignee); }
        if (task.status !== undefined) { keysToUpdate.push('status = ?'); params.push(task.status); }
        if (task.comments !== undefined) { keysToUpdate.push('comments = ?'); params.push(JSON.stringify(task.comments || [])); }
        
        if (keysToUpdate.length > 0) {
          const sql = `UPDATE tasks SET ${keysToUpdate.join(', ')} WHERE id = ?`;
          params.push(id);
          await pool.execute(sql, params);
        }
        const [rows] = await pool.execute('SELECT * FROM tasks WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToTask(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateTask failed:', err);
      }
    }
    const idx = inMemoryTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTasks[idx] = { ...inMemoryTasks[idx], ...task };
      return inMemoryTasks[idx];
    }
    return null;
  },

  async deleteTask(id: string): Promise<boolean> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM tasks WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.error('[MySQL] deleteTask failed:', err);
      }
    }
    const idx = inMemoryTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTasks.splice(idx, 1);
      return true;
    }
    return false;
  },

  // --- TEMPLATES ---
  async getTemplates(userId?: string): Promise<Template[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM templates WHERE user_id = ?', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM templates');
          rows = results as any[];
        }
        return rows.map(mapDbRowToTemplate);
      } catch (err) {
        console.error('[MySQL] getTemplates failed:', err);
      }
    }
    if (userId) {
      return inMemoryTemplates.filter(t => t.userId === userId);
    }
    return inMemoryTemplates;
  },

  async insertTemplate(template: Template): Promise<void> {
    if (pool) {
      try {
        const sql = `INSERT INTO templates (id, user_id, name, type, subject, body) VALUES (?, ?, ?, ?, ?, ?)`;
        await pool.execute(sql, [
          template.id,
          template.userId || 'ielts_crm_main_user',
          template.name,
          template.type,
          template.subject || null,
          template.body
        ]);
        return;
      } catch (err) {
        console.error('[MySQL] insertTemplate failed:', err);
      }
    }
    inMemoryTemplates.unshift(template);
  },

  async updateTemplate(id: string, template: Partial<Template>): Promise<Template | null> {
    if (pool) {
      try {
        const keysToUpdate: string[] = [];
        const params: any[] = [];
        if (template.name !== undefined) { keysToUpdate.push('name = ?'); params.push(template.name); }
        if (template.type !== undefined) { keysToUpdate.push('type = ?'); params.push(template.type); }
        if (template.subject !== undefined) { keysToUpdate.push('subject = ?'); params.push(template.subject); }
        if (template.body !== undefined) { keysToUpdate.push('body = ?'); params.push(template.body); }
        
        if (keysToUpdate.length > 0) {
          const sql = `UPDATE templates SET ${keysToUpdate.join(', ')} WHERE id = ?`;
          params.push(id);
          await pool.execute(sql, params);
        }
        const [rows] = await pool.execute('SELECT * FROM templates WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToTemplate(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateTemplate failed:', err);
      }
    }
    const idx = inMemoryTemplates.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTemplates[idx] = { ...inMemoryTemplates[idx], ...template };
      return inMemoryTemplates[idx];
    }
    return null;
  },

  async deleteTemplate(id: string): Promise<boolean> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM templates WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.error('[MySQL] deleteTemplate failed:', err);
      }
    }
    const idx = inMemoryTemplates.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTemplates.splice(idx, 1);
      return true;
    }
    return false;
  },

  // --- WORKFLOWS ---
  async getWorkflows(userId?: string): Promise<WorkflowRule[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM workflows WHERE user_id = ? ORDER BY created_at DESC', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM workflows ORDER BY created_at DESC');
          rows = results as any[];
        }
        return rows.map(mapDbRowToWorkflow);
      } catch (err) {
        console.error('[MySQL] getWorkflows failed:', err);
      }
    }
    if (userId) {
      return inMemoryWorkflows.filter(w => w.userId === userId);
    }
    return inMemoryWorkflows;
  },

  async insertWorkflow(workflow: WorkflowRule): Promise<void> {
    if (pool) {
      try {
        const sql = `
          INSERT INTO workflows (id, user_id, name, trigger_event, trigger_condition, action_type, action_template_id, task_title, n8n_webhook_url, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(sql, [
          workflow.id,
          workflow.userId || 'ielts_crm_main_user',
          workflow.name,
          workflow.triggerEvent,
          workflow.triggerCondition || null,
          workflow.actionType,
          workflow.actionTemplateId || null,
          workflow.taskTitle || null,
          workflow.n8nWebhookUrl || null,
          workflow.isActive ? 1 : 0,
          workflow.createdAt || Date.now()
        ]);
        return;
      } catch (err) {
        console.error('[MySQL] insertWorkflow failed:', err);
      }
    }
    inMemoryWorkflows.unshift(workflow);
  },

  async updateWorkflow(id: string, workflow: Partial<WorkflowRule>): Promise<WorkflowRule | null> {
    if (pool) {
      try {
        const keysToUpdate: string[] = [];
        const params: any[] = [];
        if (workflow.name !== undefined) { keysToUpdate.push('name = ?'); params.push(workflow.name); }
        if (workflow.triggerEvent !== undefined) { keysToUpdate.push('trigger_event = ?'); params.push(workflow.triggerEvent); }
        if (workflow.triggerCondition !== undefined) { keysToUpdate.push('trigger_condition = ?'); params.push(workflow.triggerCondition); }
        if (workflow.actionType !== undefined) { keysToUpdate.push('action_type = ?'); params.push(workflow.actionType); }
        if (workflow.actionTemplateId !== undefined) { keysToUpdate.push('action_template_id = ?'); params.push(workflow.actionTemplateId); }
        if (workflow.taskTitle !== undefined) { keysToUpdate.push('task_title = ?'); params.push(workflow.taskTitle); }
        if (workflow.n8nWebhookUrl !== undefined) { keysToUpdate.push('n8n_webhook_url = ?'); params.push(workflow.n8nWebhookUrl); }
        if (workflow.isActive !== undefined) { keysToUpdate.push('is_active = ?'); params.push(workflow.isActive ? 1 : 0); }
        
        if (keysToUpdate.length > 0) {
          const sql = `UPDATE workflows SET ${keysToUpdate.join(', ')} WHERE id = ?`;
          params.push(id);
          await pool.execute(sql, params);
        }
        const [rows] = await pool.execute('SELECT * FROM workflows WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToWorkflow(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateWorkflow failed:', err);
      }
    }
    const idx = inMemoryWorkflows.findIndex(w => w.id === id);
    if (idx !== -1) {
      inMemoryWorkflows[idx] = { ...inMemoryWorkflows[idx], ...workflow };
      return inMemoryWorkflows[idx];
    }
    return null;
  },

  async deleteWorkflow(id: string): Promise<boolean> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM workflows WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.error('[MySQL] deleteWorkflow failed:', err);
      }
    }
    const idx = inMemoryWorkflows.findIndex(w => w.id === id);
    if (idx !== -1) {
      inMemoryWorkflows.splice(idx, 1);
      return true;
    }
    return false;
  },

  // --- TEAM MEMBERS ---
  async getTeamMembers(userId?: string): Promise<TeamMember[]> {
    if (pool) {
      try {
        let rows: any[];
        if (userId) {
          const [results] = await pool.execute('SELECT * FROM team_members WHERE user_id = ? ORDER BY created_at DESC', [userId]);
          rows = results as any[];
        } else {
          const [results] = await pool.execute('SELECT * FROM team_members ORDER BY created_at DESC');
          rows = results as any[];
        }
        return rows.map(mapDbRowToTeamMember);
      } catch (err) {
        console.error('[MySQL] getTeamMembers failed:', err);
      }
    }
    if (userId) {
      return inMemoryTeamMembers.filter(t => t.userId === userId);
    }
    return inMemoryTeamMembers;
  },

  async insertTeamMember(teamMember: TeamMember): Promise<void> {
    if (pool) {
      try {
        const sql = `INSERT INTO team_members (id, user_id, name, email, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await pool.execute(sql, [
          teamMember.id,
          teamMember.userId || 'ielts_crm_main_user',
          teamMember.name,
          teamMember.email,
          teamMember.role || 'Counselor',
          teamMember.status || 'Invited',
          teamMember.createdAt || Date.now()
        ]);
        return;
      } catch (err) {
        console.error('[MySQL] insertTeamMember failed:', err);
      }
    }
    inMemoryTeamMembers.unshift(teamMember);
  },

  async updateTeamMember(id: string, teamMember: Partial<TeamMember>): Promise<TeamMember | null> {
    if (pool) {
      try {
        const keysToUpdate: string[] = [];
        const params: any[] = [];
        if (teamMember.name !== undefined) { keysToUpdate.push('name = ?'); params.push(teamMember.name); }
        if (teamMember.email !== undefined) { keysToUpdate.push('email = ?'); params.push(teamMember.email); }
        if (teamMember.role !== undefined) { keysToUpdate.push('role = ?'); params.push(teamMember.role); }
        if (teamMember.status !== undefined) { keysToUpdate.push('status = ?'); params.push(teamMember.status); }
        
        if (keysToUpdate.length > 0) {
          const sql = `UPDATE team_members SET ${keysToUpdate.join(', ')} WHERE id = ?`;
          params.push(id);
          await pool.execute(sql, params);
        }
        const [rows] = await pool.execute('SELECT * FROM team_members WHERE id = ?', [id]);
        const results = rows as any[];
        if (results.length > 0) {
          return mapDbRowToTeamMember(results[0]);
        }
        return null;
      } catch (err) {
        console.error('[MySQL] updateTeamMember failed:', err);
      }
    }
    const idx = inMemoryTeamMembers.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTeamMembers[idx] = { ...inMemoryTeamMembers[idx], ...teamMember };
      return inMemoryTeamMembers[idx];
    }
    return null;
  },

  async deleteTeamMember(id: string): Promise<boolean> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM team_members WHERE id = ?', [id]);
        return true;
      } catch (err) {
        console.error('[MySQL] deleteTeamMember failed:', err);
      }
    }
    const idx = inMemoryTeamMembers.findIndex(t => t.id === id);
    if (idx !== -1) {
      inMemoryTeamMembers.splice(idx, 1);
      return true;
    }
    return false;
  },

  // --- USER AUTHENTICATION SYNCHRONIZATION ---
  async getAuthUsers(): Promise<ManualAuthUser[]> {
    if (pool) {
      try {
        const [results] = await pool.execute('SELECT * FROM crm_users_auth');
        return (results as any[]).map(mapDbRowToUser);
      } catch (err) {
        console.error('[MySQL] getAuthUsers failed:', err);
      }
    }
    return inMemoryUsers;
  },

  async insertAuthUser(u: ManualAuthUser): Promise<void> {
    if (pool) {
      try {
        const sql = `INSERT INTO crm_users_auth (uid, email, display_name, password, role, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), password = VALUES(password), role = VALUES(role), two_factor_secret = VALUES(two_factor_secret), two_factor_enabled = VALUES(two_factor_enabled)`;
        await pool.execute(sql, [
          u.uid, 
          u.email.toLowerCase(), 
          u.displayName, 
          u.password || null, 
          u.role || 'Counselor',
          u.twoFactorSecret || null,
          u.twoFactorEnabled ? 1 : 0
        ]);
        return;
      } catch (err) {
        console.error('[MySQL] insertAuthUser failed:', err);
      }
    }
    const existingIdx = inMemoryUsers.findIndex(x => x.email.toLowerCase() === u.email.toLowerCase());
    if (existingIdx !== -1) {
      inMemoryUsers[existingIdx] = { ...inMemoryUsers[existingIdx], ...u };
    } else {
      inMemoryUsers.push(u);
    }
  },

  async deleteAuthUser(uid: string): Promise<void> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM crm_users_auth WHERE uid = ?', [uid]);
        return;
      } catch (err) {
        console.error('[MySQL] deleteAuthUser failed:', err);
      }
    }
    inMemoryUsers = inMemoryUsers.filter(u => u.uid !== uid);
  },

  isPoolActive(): boolean {
    return pool !== null;
  },

  async clearAllLeads(): Promise<void> {
    if (pool) {
      try {
        await pool.execute('DELETE FROM leads');
        await pool.execute('DELETE FROM tasks');
        await pool.execute('DELETE FROM campaigns');
      } catch (err) {
        console.error('[MySQL] clearAllLeads query failed:', err);
      }
    }
    inMemoryLeads = [];
    inMemoryTasks = [];
    inMemoryCampaigns = [];
  },

  getDbConfigDetails() {
    return {
      host: dbHost,
      port: dbPort,
      user: dbUser,
      database: dbName,
      error: connectionError
    };
  }
};

