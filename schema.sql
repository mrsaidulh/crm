-- Database construction schema for cPanel deployment of IELTS Academic CRM
-- This is standard ANSI SQL compatible with MySQL 5.7+ and 8.0+
-- 
-- Target Database: `mockhub_crm`
-- Database User:   `mockhub_crmuser`
-- Connection PW:   `Crmuser1$%`

-- CREATE DATABASE IF NOT EXISTS `mockhub_crm` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `mockhub_crm`; 

-- 1. Users settings configurations
CREATE TABLE IF NOT EXISTS `settings` (
  `user_id` VARCHAR(128) NOT NULL,
  `sms_provider` VARCHAR(64) DEFAULT 'bulk_sms_bd',
  `sms_api_url` VARCHAR(255) DEFAULT NULL,
  `sms_api_key` VARCHAR(255) DEFAULT NULL,
  `sms_sender_id` VARCHAR(255) DEFAULT NULL,
  `sms_client_id` VARCHAR(255) DEFAULT NULL,
  `smtp_host` VARCHAR(255) DEFAULT NULL,
  `smtp_port` VARCHAR(16) DEFAULT NULL,
  `smtp_username` VARCHAR(255) DEFAULT NULL,
  `smtp_password` VARCHAR(255) DEFAULT NULL,
  `smtp_from_email` VARCHAR(255) DEFAULT NULL,
  `smtp_from_name` VARCHAR(255) DEFAULT NULL,
  `smtp_encryption` VARCHAR(16) DEFAULT 'tls',
  `n8n_lead_created_url` VARCHAR(512) DEFAULT NULL,
  `n8n_status_changed_url` VARCHAR(512) DEFAULT NULL,
  `n8n_task_reminder_url` VARCHAR(512) DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Leads collection
CREATE TABLE IF NOT EXISTS `leads` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) NOT NULL,
  `source` VARCHAR(64) NOT NULL DEFAULT 'Website Form',
  `status` VARCHAR(64) NOT NULL DEFAULT 'New',
  `expected_value` INT DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `target_course` VARCHAR(128) DEFAULT 'IELTS Academic',
  `target_band` VARCHAR(32) DEFAULT NULL,
  `destination` VARCHAR(128) DEFAULT 'United Kingdom',
  `tags` JSON DEFAULT NULL, -- Array of strings
  `mock_scores` JSON DEFAULT NULL, -- Array of objects
  `communications` JSON DEFAULT NULL, -- Custom timeline array
  `preferences` JSON DEFAULT NULL, -- Key-value map
  `lead_score` INT DEFAULT 50,
  `phone_verified` TINYINT(1) DEFAULT 0,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_userid` (`user_id`),
  KEY `idx_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Follow-up Tasks
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `lead_id` VARCHAR(128) NOT NULL,
  `lead_name` VARCHAR(255) DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `due_date` BIGINT NOT NULL,
  `reminder_date` BIGINT DEFAULT NULL,
  `task_type` VARCHAR(64) DEFAULT 'General',
  `assignee` VARCHAR(128) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Pending',
  `comments` JSON DEFAULT NULL, -- Follow-up comments feed
  PRIMARY KEY (`id`),
  KEY `idx_userid_tasks` (`user_id`),
  KEY `idx_leadid_tasks` (`lead_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Campaigns log
CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `type` VARCHAR(32) NOT NULL, -- 'SMS' | 'Email'
  `audience` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `body` TEXT DEFAULT NULL,
  `sent_at` BIGINT NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Sent',
  PRIMARY KEY (`id`),
  KEY `idx_userid_campaigns` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Broadcast Templates
CREATE TABLE IF NOT EXISTS `templates` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(32) NOT NULL, -- 'SMS' | 'Email'
  `subject` VARCHAR(255) DEFAULT NULL,
  `body` TEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_userid_templates` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Team Members
CREATE TABLE IF NOT EXISTS `team_members` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `role` VARCHAR(64) NOT NULL DEFAULT 'Counselor', -- 'Admin' | 'Counselor' | 'Teacher' | 'Marketing'
  `status` VARCHAR(32) NOT NULL DEFAULT 'Invited', -- 'Active' | 'Invited' | 'Suspended'
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email` (`email`),
  KEY `idx_userid_team` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Automation Workflow Rules
CREATE TABLE IF NOT EXISTS `workflows` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `trigger_event` VARCHAR(128) NOT NULL, -- 'Lead Created' | 'Lead Status Changed'
  `trigger_condition` VARCHAR(128) DEFAULT NULL,
  `action_type` VARCHAR(128) NOT NULL,
  `action_template_id` VARCHAR(128) DEFAULT NULL,
  `task_title` VARCHAR(255) DEFAULT NULL,
  `n8n_webhook_url` VARCHAR(512) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_userid_workflows` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Audit logs history
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(128) NOT NULL,
  `user_id` VARCHAR(128) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `entity_type` VARCHAR(64) DEFAULT NULL,
  `entity_id` VARCHAR(128) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_userid_audit` (`user_id`),
  KEY `idx_created_audit` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

