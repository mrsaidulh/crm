export type LeadSource = 'Facebook Ads' | 'Google Ads' | 'Youtube Ads' | 'Website Form' | 'Direct' | 'Referral' | 'Others' | (string & {});
export type LeadStatus = 'New Lead' | 'Contact' | 'Follow-up' | 'Consultation Booked' | 'Counseling Done' | 'Demo Class Booked' | 'Payment Pending' | 'Re-engagement Offer' | 'Enrolled' | 'Discarded';

export interface MockScore {
  date: number;
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
  overall: number;
}

export interface Communication {
  id: string;
  type: 'Note' | 'Email' | 'SMS' | 'Call' | 'Meeting';
  date: number;
  summary: string;
}

export interface Preferences {
  preferredContactMethod?: 'Email' | 'Phone' | 'WhatsApp';
  studyMode?: 'Online' | 'Offline' | 'Hybrid';
  timeline?: 'Immediately' | 'Within 1-3 Months' | 'Unknown';
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  phoneVerified?: boolean;
  source: LeadSource;
  status: LeadStatus;
  createdAt: number;
  userId: string;
  notes?: string;
  expectedValue?: number;
  targetCourse?: string;
  targetBand?: string;
  destination?: string;
  tags?: string[];
  mockScores?: MockScore[];
  communications?: Communication[];
  preferences?: Preferences;
  leadScore?: number;
}

export interface Task {
  id: string;
  leadId: string;
  leadName?: string;
  title: string;
  description?: string;
  dueDate: number;
  reminderDate?: number;
  taskType?: 'Call' | 'Meeting' | 'Email' | 'General';
  assignee?: string;
  status: 'Pending' | 'Completed';
  userId: string;
  comments?: {
    id: string;
    text: string;
    createdAt: number;
    authorName?: string;
  }[];
}

export interface Campaign {
  id: string;
  type: 'SMS' | 'Email';
  audience: string;
  subject?: string;
  message?: string;
  body?: string;
  sentAt: number;
  status: string;
  userId: string;
}

export interface Template {
  id: string;
  name: string;
  type: 'SMS' | 'Email';
  subject?: string;
  body: string;
  userId: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Counselor' | 'Teacher' | 'Marketing';
  status: 'Active' | 'Invited' | 'Suspended';
  createdAt: number;
  userId: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

export interface UserSettings {
  smsProvider?: 'custom' | 'bulk_sms_bd' | 'greenweb' | 'sms_bd';
  smsApiUrl?: string;
  smsApiKey?: string;
  smsSenderId?: string;
  smsClientId?: string; // Optional for some providers
  
  // Two-Factor Authentication Requirements
  twoFactorEnforced?: boolean;
  
  // SMTP Configuration
  smtpHost?: string;
  smtpPort?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;
  smtpEncryption?: 'tls' | 'ssl' | 'none';

  // n8n Webhooks Configuration
  n8nLeadCreatedUrl?: string;
  n8nStatusChangedUrl?: string;
  n8nTaskReminderUrl?: string;
  
  // Custom Lead Sources
  customSources?: string[];

  // Meta Conversions API Configuration
  metaEnabled?: boolean;
  metaPixelId?: string;
  metaAccessToken?: string;
  metaTestEventCode?: string;
  metaMapping?: Record<string, string>;

  // Anthropic Claude Configuration
  claudeEnabled?: boolean;
  claudeApiKey?: string;
  claudeDefaultModel?: string;
  claudeSystemPrompt?: string;

  // Google Ads & GA4 Configuration
  googleEnabled?: boolean;
  googleConversionId?: string;
  googleConversionLabel?: string;
  googleMeasurementId?: string;
  googleApiSecret?: string;
  googleMapping?: Record<string, string>;

  // Zapier, Make.com and Custom Webhooks Configuration
  zapierLeadCreatedUrl?: string;
  zapierStatusChangedUrl?: string;
  makeLeadCreatedUrl?: string;
  makeStatusChangedUrl?: string;
  customWebhookUrl?: string;
  customWebhookEvents?: string[];
}

export interface WorkflowRule {
  id: string;
  name: string;
  triggerEvent: 'Lead Created' | 'Lead Status Changed' | 'Keywords Match';
  triggerCondition?: string; // For "Lead Status Changed" or "Keywords Match"
  actionType: 'Send SMS' | 'Send Email' | 'Create Task' | 'Trigger n8n Webhook' | 'Add Tags';
  actionTemplateId?: string;
  taskTitle?: string;
  n8nWebhookUrl?: string;
  isActive: boolean;
  userId: string;
  createdAt: number;
}

export interface Stats {
  totalLeads: number;
  newLeads: number;
  enrolled: number;
  conversionRate: number;
  bySource: Record<string, number>;
  estimatedPipelineValue: number;
  conversionValue: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType?: 'lead' | 'task' | 'campaign' | 'template' | 'workflow' | 'system';
  entityId?: string;
  details: string;
  createdAt: number;
}

