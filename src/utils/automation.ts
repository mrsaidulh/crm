import type { UserSettings, WorkflowRule } from "../types";
import { logAuditEvent } from "./auditLogger";

/**
 * Triggers a webhook using our Node/Express backend proxy to overcome CORS restrictions.
 */
export async function triggerWebhookProxy(
  webhookUrl: string,
  event: string,
  data: any,
): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const response = await fetch("/api/automation/trigger-webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhookUrl,
        event,
        data,
      }),
    });

    if (!response.ok) {
      console.warn(`Webhook proxy call returned status: ${response.status}`);
      return false;
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error("Error triggering webhook proxy:", error);
    return false;
  }
}

/**
 * Triggers global n8n webhooks configured in CRM settings.
 */
export async function triggerGlobalWebhook(
  userId: string,
  event: "Lead Created" | "Lead Status Changed" | "Task Reminder",
  data: any,
): Promise<void> {
  if (!userId) return;
  try {
    const response = await fetch(
      `/api/settings?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) return;

    const resData = await response.json();
    const settings = resData.settings as UserSettings;
    if (!settings) return;

    let url: string | undefined;

    switch (event) {
      case "Lead Created":
        url = settings.n8nLeadCreatedUrl;
        break;
      case "Lead Status Changed":
        url = settings.n8nStatusChangedUrl;
        break;
      case "Task Reminder":
        url = settings.n8nTaskReminderUrl;
        break;
    }

    if (url) {
      console.log(`Triggering global n8n Webhook for event: ${event}`);
      await triggerWebhookProxy(url, event, data);
    }
  } catch (error) {
    console.error(`Error in triggerGlobalWebhook for ${event}:`, error);
  }
}

/**
 * Triggers email alerts to CRM administrators when a new lead is added or lead status changes.
 */
export async function alertCRMAdministrators(
  userId: string,
  event: "Lead Created" | "Lead Status Changed",
  newValue: string,
  lead: any,
): Promise<void> {
  try {
    const adminEmails = new Set<string>();

    // Add default admin emails
    adminEmails.add("toieltsrevolution@gmail.com");
    adminEmails.add("saidulgmac@gmail.com");

    // Attempt to dynamically fetch and append email addresses of Admins and Super Admins
    try {
      const response = await fetch(
        `/api/team-members?userId=${encodeURIComponent(userId)}`,
      );
      if (response.ok) {
        const data = await response.json();
        const members = data.teamMembers || [];
        for (const m of members) {
          if (
            m &&
            m.email &&
            (m.role === "Admin" ||
              m.role === "Super Admin" ||
              m.role.toLowerCase().includes("admin"))
          ) {
            adminEmails.add(m.email.trim().toLowerCase());
          }
        }
      }
    } catch (teamError) {
      console.warn(
        "Could not fetch team members for admin notification fallback:",
        teamError,
      );
    }

    // Send email alert to each unique administrator email
    for (const email of adminEmails) {
      const subject =
        event === "Lead Created"
          ? `🚨 [CRM Alert] New Lead Captured: "${lead.name || "N/A"}"`
          : `🔄 [CRM Alert] Lead Status Updated: "${lead.name || "N/A"}" (${newValue})`;

      const body = `
Hello CRM Administrator,

An automated event has been recorded in your IELTS CRM system.

Event Details:
------------------------------------------
Type: ${event === "Lead Created" ? "New Lead Registered" : "Lead Status Transitioned"}
Details: ${event === "Lead Created" ? `A new lead has completed registration or been entered into the system.` : `Lead status has changed to "${newValue}".`}
Timestamp: ${new Date().toLocaleString()}
------------------------------------------

Lead Profile:
- Full Name: ${lead.name || "N/A"}
- Email: ${lead.email || "N/A"}
- Phone: ${lead.phone || "N/A"}
- Lead Source: ${lead.source || "Website Form"}
- Current Status: ${lead.status || newValue || "New"}
- Target Course: ${lead.targetCourse || "N/A"}
- Target Band Score: ${lead.targetBand || "N/A"}
- Destination Country: ${lead.destination || "N/A"}

Additional Information:
- Current Expected Pipeline Value: $${lead.expectedValue || "0"}
- Initial Tags: ${(lead.tags || []).join(", ") || "None"}
- Latest Notes: ${lead.notes || "None entered."}

Manage this lead online in your IELTS CRM system board.
      `.trim();

      await fetch("/api/campaigns/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: email,
          subject,
          body,
          userId,
        }),
      });

      console.log(
        `[Admin Notification] Email notification successfully dispatched to CRM Admin: ${email}`,
      );
    }

    // Log consolidated audit log
    await logAuditEvent({
      action: "System notification",
      entityType: "lead",
      entityId: lead.id,
      details: `Dispatched automated administrator email notification(s) regarding lead "${lead.name || "N/A"}" (${event}).`,
    });
  } catch (error) {
    console.error("Error in alertCRMAdministrators:", error);
  }
}

/**
 * Evaluates active custom CRM workflows for a user and triggers matches.
 */
export async function triggerWorkflowAutomations(
  userId: string,
  triggerEvent: "Lead Created" | "Lead Status Changed",
  checkConditionValue: string,
  payload: any,
): Promise<void> {
  if (!userId) return;

  // Proactively alert CRM administrators via email for new leads or state changes
  await alertCRMAdministrators(
    userId,
    triggerEvent,
    checkConditionValue,
    payload,
  );

  try {
    const response = await fetch(
      `/api/workflows?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) return;

    const resData = await response.json();
    const workflowsData = resData.workflows as WorkflowRule[];
    if (!workflowsData || !Array.isArray(workflowsData)) return;

    // Filter active rules for the given trigger event
    const activeRules = workflowsData.filter(
      (w) => w.isActive && w.triggerEvent === triggerEvent,
    );

    // Normalize status strings for comparative checks
    const normalizeStatus = (statusStr: string) => {
      if (!statusStr) return "";
      const clean = statusStr.toLowerCase().replace(/[\s_-]+/g, "");
      if (clean === "new" || clean === "newlead" || clean === "newleads")
        return "newlead";
      if (
        clean === "enrolled" ||
        clean === "enrolledstudent" ||
        clean === "enrolledstudents" ||
        clean === "enroll"
      )
        return "enrolled";
      return clean;
    };

    for (const rule of activeRules) {
      // Validate configuration value if status changes
      if (triggerEvent === "Lead Status Changed") {
        const normRuleCond = normalizeStatus(rule.triggerCondition || "");
        const normCheckVal = normalizeStatus(checkConditionValue || "");
        if (normRuleCond !== normCheckVal) {
          console.log(
            `[Automation Match Skip] Rule "${rule.name}" condition "${rule.triggerCondition}" (norm: "${normRuleCond}") does not match checked value "${checkConditionValue}" (norm: "${normCheckVal}")`,
          );
          continue; // condition doesn't match
        }
      }

      console.log(
        `Executing automation rule: ${rule.name} of type: ${rule.actionType}`,
      );

      if (rule.actionType === "Trigger n8n Webhook" && rule.n8nWebhookUrl) {
        // Trigger n8n webhook
        await triggerWebhookProxy(rule.n8nWebhookUrl, triggerEvent, payload);
      } else if (rule.actionType === "Create Task" && rule.taskTitle) {
        // Automatically create a fallback follow-up task
        const leadName = payload.name || "N/A";
        const leadId = payload.id || "";
        await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: rule.taskTitle,
            description: `Auto-generated by workflow: "${rule.name}" for Lead: ${leadName}`,
            leadId,
            leadName,
            dueDate: Date.now() + 86400000, // Due in 1 day
            status: "Pending",
            userId,
            taskType: "General",
          }),
        });
      } else if (
        (rule.actionType === "Send Email" || rule.actionType === "Send SMS") &&
        rule.actionTemplateId
      ) {
        // Fetch templates
        let templates: any[] = [];
        const templatesRes = await fetch(
          `/api/templates?userId=${encodeURIComponent(userId)}`,
        );
        if (templatesRes.ok) {
          const tData = await templatesRes.json();
          templates = tData.templates || [];
        }

        const template = templates.find((t) => t.id === rule.actionTemplateId);
        if (template) {
          // Helper to interpolate variables
          const interpolate = (text: string, data: any) => {
            if (!text) return "";
            return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
              const trimmedKey = key.trim().toLowerCase();
              if (trimmedKey === "name") return data.name || "";
              if (trimmedKey === "email") return data.email || "";
              if (trimmedKey === "phone") return data.phone || "";
              if (trimmedKey === "course" || trimmedKey === "targetcourse")
                return data.targetCourse || "";
              if (trimmedKey === "band" || trimmedKey === "targetband")
                return data.targetBand || "";
              if (trimmedKey === "country" || trimmedKey === "destination")
                return data.destination || "";
              return data[key.trim()] || data[key] || "";
            });
          };

          const bodyMerged = interpolate(template.body, payload);

          if (rule.actionType === "Send Email") {
            const subjectMerged = interpolate(template.subject || "", payload);
            console.log(
              `[Auto-Responder] Dispatching Email to ${payload.email || payload.name}`,
            );

            await fetch("/api/campaigns/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audience: payload.email || payload.name,
                subject: subjectMerged,
                body: bodyMerged,
                userId: userId,
              }),
            });

            await logAuditEvent({
              action: "Workflow Auto-responder",
              entityType: "workflow",
              entityId: rule.id,
              details: `Auto-responder triggered: Sent Email template "${template.name}" to ${payload.name} (${payload.email})`,
            });
          } else {
            console.log(
              `[Auto-Responder] Dispatching SMS to ${payload.phone || payload.name}`,
            );

            await fetch("/api/campaigns/sms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                audience: payload.phone || payload.name,
                message: bodyMerged,
                userId: userId,
                recipientPhones: payload.phone ? [payload.phone] : [],
              }),
            });

            await logAuditEvent({
              action: "Workflow Auto-responder",
              entityType: "workflow",
              entityId: rule.id,
              details: `Auto-responder triggered: Sent SMS template "${template.name}" to ${payload.name} (${payload.phone})`,
            });
          }
        } else {
          console.warn(
            `Template with ID ${rule.actionTemplateId} not found for workflow auto-responder.`,
          );
        }
      }
    }
  } catch (error) {
    console.error(
      `Error executing workflow automations for event ${triggerEvent}:`,
      error,
    );
  }
}

/**
 * Evaluates active 'Keywords Match' workflow rules for a lead and automatically updates tags if needed.
 */
export async function evaluateKeywordsTrigger(
  userId: string,
  lead: any,
): Promise<any> {
  if (!userId || !lead) return lead;
  try {
    const response = await fetch(
      `/api/workflows?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) return lead;

    const resData = await response.json();
    const workflowsData = resData.workflows as WorkflowRule[];
    if (!workflowsData || !Array.isArray(workflowsData)) return lead;

    // Filter active 'Keywords Match' rules
    const activeRules = workflowsData.filter(
      (w) => w.isActive && w.triggerEvent === "Keywords Match",
    );

    if (activeRules.length === 0) return lead;

    const notes = lead.notes || "";
    const email = lead.email || "";

    let tagsToSet = Array.isArray(lead.tags) ? [...lead.tags] : [];
    let hasChanges = false;

    // Helper to see if any keyword exists in a text
    const checkMatch = (text: string, keywordsCsv: string): boolean => {
      if (!text || !keywordsCsv) return false;
      const keywords = keywordsCsv
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const textLower = text.toLowerCase();
      return keywords.some((kw) => textLower.includes(kw));
    };

    for (const rule of activeRules) {
      if (!rule.triggerCondition) continue;

      const isMatch =
        checkMatch(notes, rule.triggerCondition) ||
        checkMatch(email, rule.triggerCondition);

      if (isMatch) {
        // Tag to add from rule (stored in taskTitle/task_title)
        const tagsToAdd = (rule.taskTitle || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        const originalLength = tagsToSet.length;

        // Merge and uniquely filter
        tagsToSet = Array.from(new Set([...tagsToSet, ...tagsToAdd]));

        if (tagsToSet.length > originalLength) {
          hasChanges = true;
          console.log(
            `Keywords Match rule "${rule.name}" triggered. Adding tags: ${tagsToAdd.join(", ")}`,
          );
        }
      }
    }

    if (hasChanges) {
      // Promptly save the new tags to the lead
      const updateResponse = await fetch(`/api/leads/${lead.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags: tagsToSet }),
      });
      if (updateResponse.ok) {
        const updateData = await updateResponse.json();
        return updateData.lead;
      }
    }
  } catch (error) {
    console.error("Error evaluating keywords trigger:", error);
  }
  return lead;
}
