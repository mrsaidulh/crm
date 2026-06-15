import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Search,
  Plus,
  Filter,
  Mail,
  Phone,
  Edit2,
  Trash2,
  X,
  Download,
  ArrowUpDown,
  Tag,
  Globe,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Sliders,
  BookOpen,
  Clock,
  FileText,
  Check,
  RefreshCw,
  MessageSquare,
  Smartphone,
  Send,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import type { Lead, LeadStatus, LeadSource } from "../types";
import { calculateLeadScore } from "../utils/scoring";
import {
  triggerGlobalWebhook,
  triggerWorkflowAutomations,
  evaluateKeywordsTrigger,
} from "../utils/automation";
import { logAuditEvent } from "../utils/auditLogger";

export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [countryFilter, setCountryFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<string>("createdAt-desc");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  // Row Expansion States
  const [expandedLeadIds, setExpandedLeadIds] = useState<string[]>([]);
  const [editingNotesText, setEditingNotesText] = useState<
    Record<string, string>
  >({});
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  const toggleLeadExpand = (leadId: string) => {
    setExpandedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId],
    );
  };

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Tag Manager States
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");

  // Bulk Tag Input States
  const [bulkTagToAdd, setBulkTagToAdd] = useState("");
  const [bulkTagToRemove, setBulkTagToRemove] = useState("");
  const [showBulkTagAdd, setShowBulkTagAdd] = useState(false);
  const [showBulkTagRemove, setShowBulkTagRemove] = useState(false);

  // Bulk Lead Import States
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkImportProgress, setBulkImportProgress] = useState<{
    current: number;
    total: number;
    active: boolean;
    results: string[];
  }>({
    current: 0,
    total: 0,
    active: false,
    results: [],
  });

  // Manual SMS States
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState<Lead[]>([]);
  const [smsTemplates, setSmsTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsLogsSummary, setSmsLogsSummary] = useState<{
    successCount: number;
    failedCount: number;
    results: string[];
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch templates when modal is opened
  const handleOpenSmsModal = (recipients: Lead[]) => {
    setSmsRecipients(recipients);
    setIsSmsModalOpen(true);
    setSmsMessage("");
    setSelectedTemplateId("");
    setSmsLogsSummary(null);

    fetch(`/api/templates?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.templates) {
          // Filter only SMS templates
          const smsTpls = data.templates.filter((tpl: any) => tpl.type === "SMS");
          setSmsTemplates(smsTpls);
        }
      })
      .catch((error) => console.error("Error fetching templates for manual SMS:", error));
  };

  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    if (!tplId) {
      setSmsMessage("");
      return;
    }
    const selected = smsTemplates.find((t) => t.id === tplId);
    if (selected) {
      setSmsMessage(selected.body);
    }
  };

  const replaceSmsPlaceholders = (text: string, lead: Lead) => {
    if (!text) return "";
    return text
      .replace(/\{\{name\}\}/gi, lead.name || "")
      .replace(/\{\{phone\}\}/gi, lead.phone || "")
      .replace(/\{\{email\}\}/gi, lead.email || "")
      .replace(/\{\{targetcourse\}\}/gi, lead.targetCourse || "")
      .replace(/\{\{targetband\}\}/gi, lead.targetBand || "")
      .replace(/\{\{destination\}\}/gi, lead.destination || "");
  };

  const insertPlaceholderAtCursor = (placeholder: string) => {
    const txtarea = textareaRef.current;
    if (!txtarea) {
      setSmsMessage((prev) => prev + placeholder);
      return;
    }
    const start = txtarea.selectionStart;
    const end = txtarea.selectionEnd;
    const text = txtarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const updated = before + placeholder + after;
    setSmsMessage(updated);
    
    // Reset cursor to be right after the inserted placeholder
    setTimeout(() => {
      txtarea.focus();
      txtarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 10);
  };

  const handleSendManualSms = async () => {
    if (!smsMessage.trim() || smsRecipients.length === 0) return;
    setIsSendingSms(true);
    setSmsLogsSummary(null);

    let succ = 0;
    let fail = 0;
    const runLogs: string[] = [];

    // Process all recipients
    for (const lead of smsRecipients) {
      const personalizedMessage = replaceSmsPlaceholders(smsMessage, lead);
      try {
        const response = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: lead.phone,
            message: personalizedMessage,
            userId,
          }),
        });

        const resData = await response.json();
        if (response.ok && resData.success) {
          succ++;
          runLogs.push(`✓ Connected to ${lead.name} (${lead.phone}) - Sent successfully.`);
          
          // Add a custom note on the lead interaction log
          await fetch(`/api/leads/${lead.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notes: `${lead.notes || ""}\n\n[SMS sent on ${format(new Date(), "PP p")}]: "${personalizedMessage}"`.trim(),
            }),
          }).catch(err => console.warn(`Timeline sync error for ${lead.name}`, err));
        } else {
          fail++;
          runLogs.push(`✗ Failed for ${lead.name} (${lead.phone}) - ${resData.error || "Provider rejected payload instruction."}`);
        }
      } catch (err: any) {
        fail++;
        runLogs.push(`✗ Error connecting for ${lead.name} (${lead.phone}) - ${err.message || "Network Error."}`);
      }
    }

    setSmsLogsSummary({
      successCount: succ,
      failedCount: fail,
      results: runLogs,
    });
    setIsSendingSms(false);

    // Refresh student leads state
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch((error) => console.error("Error refreshing leads page after custom SMS dispatch:", error));
  };

  const downloadTemplateCSV = () => {
    const templateContent =
      "Name,Email,Phone,Source,Target Course,Target Band,Destination,Expected Value,Notes\n" +
      "John Doe,john@example.com,01712345678,Facebook Ads,IELTS Academic,7.5,Australia,15000,Interested in quick study visa info\n" +
      "Jane Smith,jane@example.com,01812345678,Google Ads,IELTS General,6.5,Canada,12000,Needs weekday batches";
    const blob = new Blob([templateContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "student_leads_bulk_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setBulkInputText(text);
      }
    };
    reader.readAsText(file);
  };

  const parseLeadsFromText = (text: string): any[] => {
    if (!text.trim()) return [];
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    // Determine delimiter
    let delimiter = ",";
    if (lines[0].includes("\t")) delimiter = "\t";
    else if (lines[0].includes(";")) delimiter = ";";

    const splitRow = (rowText: string) => {
      const result: string[] = [];
      let currentVal = "";
      let insideQuote = false;
      for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === delimiter && !insideQuote) {
          result.push(currentVal.trim());
          currentVal = "";
        } else {
          currentVal += char;
        }
      }
      result.push(currentVal.trim());
      return result.map((v) => v.replace(/^"|"$/g, ""));
    };

    const headerRow = splitRow(lines[0]);
    const hasHeader = headerRow.some((col) =>
      [
        "name",
        "full name",
        "email",
        "phone",
        "contact",
        "source",
        "status",
        "band",
        "target",
        "destination",
        "country",
      ].includes(col.toLowerCase()),
    );

    let rowsToParse = lines;
    let colIndices = {
      name: 0,
      email: 1,
      phone: 2,
      source: -1,
      targetCourse: -1,
      targetBand: -1,
      destination: -1,
      expectedValue: -1,
      notes: -1,
    };

    if (hasHeader) {
      rowsToParse = lines.slice(1);
      headerRow.forEach((col, idx) => {
        const low = col.toLowerCase().replace(/[\s_-]/g, "");
        if (low.includes("name")) colIndices.name = idx;
        else if (low.includes("email") || low.includes("mail"))
          colIndices.email = idx;
        else if (
          low.includes("phone") ||
          low.includes("number") ||
          low.includes("contact") ||
          low.includes("mobile")
        )
          colIndices.phone = idx;
        else if (low.includes("source")) colIndices.source = idx;
        else if (low.includes("course") || low.includes("targetcourse"))
          colIndices.targetCourse = idx;
        else if (
          low.includes("band") ||
          low.includes("score") ||
          low.includes("targetband")
        )
          colIndices.targetBand = idx;
        else if (
          low.includes("destination") ||
          low.includes("country") ||
          low.includes("targetcountry")
        )
          colIndices.destination = idx;
        else if (low.includes("expected") || low.includes("value"))
          colIndices.expectedValue = idx;
        else if (low.includes("note") || low.includes("comment"))
          colIndices.notes = idx;
      });
    }

    return rowsToParse
      .map((rowText) => {
        const cols = splitRow(rowText);
        if (cols.length === 0 || (cols.length === 1 && !cols[0])) return null;

        const getVal = (index: number, fallback: string = "") => {
          if (index >= 0 && index < cols.length) {
            return cols[index] || fallback;
          }
          return fallback;
        };

        const name = hasHeader ? getVal(colIndices.name) : getVal(0);
        const email = hasHeader ? getVal(colIndices.email) : getVal(1);
        const phone = hasHeader ? getVal(colIndices.phone) : getVal(2);
        const source = hasHeader
          ? getVal(colIndices.source)
          : getVal(3, "Direct");
        const targetCourse = hasHeader
          ? getVal(colIndices.targetCourse)
          : getVal(4, "IELTS Academic");
        const targetBand = hasHeader
          ? getVal(colIndices.targetBand)
          : getVal(5, "7.0");
        const destination = hasHeader
          ? getVal(colIndices.destination)
          : getVal(6, "United Kingdom");
        const expectedValue = hasHeader
          ? getVal(colIndices.expectedValue)
          : getVal(7, "");
        const notes = hasHeader
          ? getVal(colIndices.notes)
          : getVal(8, "Imported in bulk");

        return {
          name,
          email,
          phone,
          source: source || "Direct",
          targetCourse: targetCourse || "IELTS Academic",
          targetBand: targetBand || "7.0",
          destination: destination || "United Kingdom",
          expectedValue: expectedValue || "",
          notes: notes || "Imported in bulk",
        };
      })
      .filter(Boolean);
  };

  const handleBulkImport = async (parsedLeads: any[]) => {
    if (parsedLeads.length === 0) {
      alert("No valid leads parsed. Clear inputs and try again.");
      return;
    }

    setBulkImportProgress({
      current: 0,
      total: parsedLeads.length,
      active: true,
      results: [],
    });

    let successCount = 0;
    let failCount = 0;
    const newImportedLeads: Lead[] = [];

    for (let i = 0; i < parsedLeads.length; i++) {
      const raw = parsedLeads[i];
      const payload = {
        name: raw.name?.trim() || "Imported Lead",
        email: raw.email?.trim() || `imported_${Date.now()}_${i}@example.com`,
        phone: raw.phone?.trim() || `8801700000${String(i).padStart(2, "0")}`,
        source: raw.source?.trim() || "Direct",
        status: "New Lead" as LeadStatus,
        expectedValue: raw.expectedValue || "",
        targetCourse: raw.targetCourse || "IELTS Academic",
        targetBand: raw.targetBand || "7.0",
        destination: raw.destination || "United Kingdom",
        tags: ["bulk-imported"],
        notes: raw.notes || "Imported via Bulk Upload",
      };

      try {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            userId: userId,
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          const createdLead = resData.lead;
          const finalizedLead = await evaluateKeywordsTrigger(
            userId,
            createdLead,
          );
          newImportedLeads.push(finalizedLead);

          triggerGlobalWebhook(userId, "Lead Created", finalizedLead);
          triggerWorkflowAutomations(
            userId,
            "Lead Created",
            "New Lead",
            finalizedLead,
          );
          triggerWorkflowAutomations(
            userId,
            "Lead Status Changed",
            "New Lead",
            finalizedLead,
          );

          logAuditEvent({
            action: "Lead Acquired",
            entityType: "lead",
            entityId: finalizedLead.id,
            details: `Imported student lead "${finalizedLead.name}" via Bulk Upload.`,
          });

          successCount++;
          setBulkImportProgress((prev) => ({
            ...prev,
            current: i + 1,
            results: [...prev.results, `✅ ${payload.name} (Success)`],
          }));
        } else {
          const errData = await response.json().catch(() => ({}));
          failCount++;
          setBulkImportProgress((prev) => ({
            ...prev,
            current: i + 1,
            results: [
              ...prev.results,
              `❌ ${payload.name}: ${errData.error || response.statusText}`,
            ],
          }));
        }
      } catch (err: any) {
        failCount++;
        setBulkImportProgress((prev) => ({
          ...prev,
          current: i + 1,
          results: [
            ...prev.results,
            `❌ ${payload.name}: ${err.message || "Network error"}`,
          ],
        }));
      }
    }

    if (newImportedLeads.length > 0) {
      setLeads((prev) => [...newImportedLeads, ...prev]);
    }

    alert(
      `Bulk Import Completed!\nSuccess: ${successCount}\nFailed: ${failCount}`,
    );
    setBulkImportProgress((prev) => ({ ...prev, active: false }));
    setIsBulkImportOpen(false);
    setBulkInputText("");
  };

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [formCustomCountry, setFormCustomCountry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedCallingCode, setDetectedCallingCode] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    source: "Direct" as LeadSource,
    notes: "",
    expectedValue: "" as string | number,
    targetCourse: "IELTS Academic",
    targetBand: "",
    destination: "United Kingdom",
    tags: "",
  });

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    targetCourse: false,
    targetBand: false,
    destination: false,
  });

  const [errors, setErrors] = useState({
    name: "",
    email: "",
    phone: "",
    targetCourse: "",
    targetBand: "",
    destination: "",
  });

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "name": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Full name is required";
        }
        if (trimmed.length < 3) {
          return "Name must be at least 3 characters";
        }
        if (trimmed.length > 50) {
          return "Name must be at most 50 characters";
        }
        if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
          return "Name can only contain letters, spaces, hyphens, and apostrophes";
        }
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2) {
          return "Please enter your full name (first and last)";
        }
        return "";
      }
      case "email": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Email address is required";
        }
        if (trimmed.length > 100) {
          return "Email address must be at most 100 characters";
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
          return "Please enter a valid email address (e.g., you@email.com)";
        }
        return "";
      }
      case "phone": {
        const cleaned = value.replace(/[\s-]/g, "");
        if (!cleaned) {
          return "Phone number is required";
        }
        const numeric = cleaned.replace(/^\+/, "");
        if (numeric.startsWith("8801") && numeric.length === 13) {
          const withoutCc = numeric.slice(2);
          if (!/^01[3-9]\d{8}$/.test(withoutCc)) {
            return "Please enter a valid Bangladeshi mobile number";
          }
        } else if (numeric.startsWith("01") && numeric.length === 11) {
          if (!/^01[3-9]\d{8}$/.test(numeric)) {
            return "Please enter a valid Bangladeshi mobile number";
          }
        } else {
          return "Please enter an 11-digit or 13-digit Bangladeshi mobile number starting with 01 or 8801";
        }
        return "";
      }
      case "targetCourse": {
        if (!value || value === "") {
          return "Please select a course";
        }
        return "";
      }
      case "targetBand": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Target band is required";
        }
        const num = parseFloat(trimmed);
        if (isNaN(num) || num < 6.0 || num > 9.0) {
          return "Band score must be between 6.0 and 9.0";
        }
        if (!/^([6-8](\.[05])?|9(\.0)?)$/.test(trimmed)) {
          return "Band score must be in 0.5 increments (e.g., 6.0, 6.5, 7.0)";
        }
        return "";
      }
      case "destination": {
        if (!value || value === "" || value === "Others" || value === "Other") {
          return "Please specify student's target country";
        }
        return "";
      }
      default:
        return "";
    }
  };

  useEffect(() => {
    setErrors({
      name: validateField("name", formData.name),
      email: validateField("email", formData.email),
      phone: validateField("phone", formData.phone),
      targetCourse: validateField("targetCourse", formData.targetCourse),
      targetBand: validateField("targetBand", formData.targetBand),
      destination: validateField("destination", formData.destination),
    });
  }, [formData]);

  const handleInputChange = (
    field:
      | "name"
      | "email"
      | "phone"
      | "targetCourse"
      | "targetBand"
      | "destination",
    value: string,
  ) => {
    if (field === "phone") {
      const formattedInput = value.replace(/[^0-9\s-]/g, "");
      setFormData((prev) => ({ ...prev, phone: formattedInput }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleBlurField = (
    field:
      | "name"
      | "email"
      | "phone"
      | "targetCourse"
      | "targetBand"
      | "destination",
  ) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (
      field === "name" ||
      field === "email" ||
      field === "targetBand" ||
      field === "targetCourse" ||
      field === "destination"
    ) {
      setFormData((prev) => ({ ...prev, [field]: prev[field].trim() }));
    } else if (field === "phone") {
      let val = formData.phone.trim().replace(/[\s-]/g, "");
      if (val.startsWith("01") && val.length === 11) {
        setFormData((prev) => ({ ...prev, phone: "88" + val }));
      } else if (val.startsWith("1") && val.length === 10) {
        setFormData((prev) => ({ ...prev, phone: "880" + val }));
      }
    }
  };

  const getFieldStyles = (
    fieldName:
      | "name"
      | "email"
      | "phone"
      | "targetCourse"
      | "targetBand"
      | "destination",
  ) => {
    const base =
      "w-full border rounded-xl px-4 py-2 text-sm focus:outline-none transition-all duration-200 text-slate-850";
    if (!touched[fieldName]) {
      return `${base} border-slate-200 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white`;
    }
    if (errors[fieldName]) {
      return `${base} border-red-400 bg-red-50/10 focus:ring-2 focus:ring-red-500/20 focus:border-red-500`;
    }
    return `${base} border-emerald-400 bg-emerald-50/10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`;
  };

  const isFormValid =
    formData.name.trim() !== "" &&
    formData.email.trim() !== "" &&
    formData.phone.trim() !== "" &&
    formData.targetCourse.trim() !== "" &&
    formData.targetBand.trim() !== "" &&
    formData.destination.trim() !== "" &&
    !errors.name &&
    !errors.email &&
    !errors.phone &&
    !errors.targetCourse &&
    !errors.targetBand &&
    !errors.destination;

  const { user, isSuperAdmin } = useAuth();
  const userId = user?.uid || "ielts_crm_main_user";

  const [customSources, setCustomSources] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/settings?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (
          data &&
          data.settings &&
          Array.isArray(data.settings.customSources)
        ) {
          setCustomSources(data.settings.customSources);
        }
      })
      .catch((error) =>
        console.error("Error fetching settings in LeadsView:", error),
      );
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch((error) => {
        console.error("API Error:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    const detectCode = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) {
          const data = await res.json();
          if (data.country_calling_code) {
            setDetectedCallingCode(data.country_calling_code);
            return;
          }
        }
      } catch (e) {
        console.warn("ipapi.co failed:", e);
      }
      try {
        const res = await fetch("https://ipinfo.io/json");
        if (res.ok) {
          const data = await res.json();
          const country = data.country;
          const map: Record<string, string> = {
            BD: "+880",
            US: "+1",
            CA: "+1",
            GB: "+44",
            AU: "+61",
            NZ: "+64",
            IE: "+353",
            IN: "+91",
          };
          if (country && map[country]) {
            setDetectedCallingCode(map[country]);
            return;
          }
        }
      } catch (e2) {
        console.warn("ipinfo.io failed:", e2);
      }
      setDetectedCallingCode("+880");
    };
    detectCode();
  }, []);

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (response.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)),
        );
        const updatedLead = { ...lead, status: newStatus };
        // Trigger global webhooks or active custom automation rules
        triggerGlobalWebhook(userId, "Lead Status Changed", updatedLead);
        triggerWorkflowAutomations(
          userId,
          "Lead Status Changed",
          newStatus,
          updatedLead,
        );

        // Publish log event
        logAuditEvent({
          action: "Lead Status Transition",
          entityType: "lead",
          entityId: id,
          details: `Lead "${lead.name}" status transitioned from "${lead.status}" to "${newStatus}".`,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkStatusChange = async (newStatus: LeadStatus) => {
    if (selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const promises = selectedLeadIds.map(async (id) => {
        await fetch(`/api/leads/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
      });
      await Promise.all(promises);

      setLeads((prev) =>
        prev.map((l) =>
          selectedLeadIds.includes(l.id) ? { ...l, status: newStatus } : l,
        ),
      );

      // Trigger integration events for every affected lead
      selectedLeadIds.forEach((id) => {
        const lead = leads.find((l) => l.id === id);
        if (lead) {
          const updatedLead = { ...lead, status: newStatus };
          triggerGlobalWebhook(userId, "Lead Status Changed", updatedLead);
          triggerWorkflowAutomations(
            userId,
            "Lead Status Changed",
            newStatus,
            updatedLead,
          );
        }
      });

      // Publish log event
      logAuditEvent({
        action: "Lead Bulk Status Update",
        entityType: "lead",
        details: `Updated the status of ${selectedLeadIds.length} lead(s) collectively to "${newStatus}".`,
      });

      setSelectedLeadIds([]);
    } catch (e) {
      console.error("Error updating bulk status:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!isSuperAdmin) {
      alert(
        "Access Denied: Only a Super Admin is authorized to permanently delete leads.",
      );
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete ${selectedLeadIds.length} selected lead(s)?`,
      )
    )
      return;
    try {
      setLoading(true);
      const promises = selectedLeadIds.map((id) =>
        fetch(`/api/leads/${id}`, { method: "DELETE" }),
      );
      await Promise.all(promises);

      setLeads((prev) => prev.filter((l) => !selectedLeadIds.includes(l.id)));

      logAuditEvent({
        action: "Lead Bulk Deletion",
        entityType: "lead",
        details: `Deleted ${selectedLeadIds.length} lead(s) permanently from the directory.`,
      });

      setSelectedLeadIds([]);
    } catch (e) {
      console.error("Error deleting bulk leads:", e);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic calculation of unique tags and counts
  const distinctTagsWithCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      if (l.tags && Array.isArray(l.tags)) {
        l.tags.forEach((t) => {
          const trimmed = t.trim();
          if (trimmed) {
            counts[trimmed] = (counts[trimmed] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Dynamic calculation of unique destinations and their counts for the country filter
  const uniqueCountries = React.useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((l) => {
      const dest = l.destination?.trim();
      if (dest) {
        counts[dest] = (counts[dest] || 0) + 1;
      }
    });

    // Make sure common core options are defined so they always exist even with 0 counts
    const defaults = [
      "United Kingdom",
      "USA",
      "Canada",
      "Australia",
      "New Zealand",
      "Germany",
      "Ireland",
    ];
    defaults.forEach((c) => {
      if (counts[c] === undefined) {
        counts[c] = 0;
      }
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [leads]);

  const handleRenameTag = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName) return;

    const leadsToUpdate = leads.filter(
      (l) => l.tags && l.tags.includes(oldName),
    );
    if (leadsToUpdate.length === 0) return;

    setLoading(true);
    try {
      let updatedCount = 0;
      const updatedLeadsList = [...leads];

      for (const lead of leadsToUpdate) {
        const updatedTags = lead.tags!.map((t) =>
          t === oldName ? trimmedNew : t,
        );
        const uniqueTags = Array.from(new Set(updatedTags));

        const response = await fetch(`/api/leads/${lead.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: uniqueTags }),
        });

        if (response.ok) {
          const resJson = await response.json();
          const savedLead = resJson.lead;
          const idx = updatedLeadsList.findIndex((l) => l.id === lead.id);
          if (idx !== -1) {
            updatedLeadsList[idx] = savedLead;
          }
          updatedCount++;
        }
      }

      setLeads(updatedLeadsList);
      logAuditEvent({
        action: "Tag Renamed Globally",
        entityType: "system",
        details: `Renamed tag "${oldName}" to "${trimmedNew}" across ${updatedCount} lead(s).`,
      });
      alert(`Successfully renamed tag on ${updatedCount} lead(s).`);
    } catch (err) {
      console.error("Error renaming tag:", err);
      alert("Failed to rename tag completely.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the tag "${tagName}" from all leads?`,
      )
    )
      return;

    const leadsToUpdate = leads.filter(
      (l) => l.tags && l.tags.includes(tagName),
    );
    if (leadsToUpdate.length === 0) {
      alert("No leads carried this tag.");
      return;
    }

    setLoading(true);
    try {
      let updatedCount = 0;
      const updatedLeadsList = [...leads];

      for (const lead of leadsToUpdate) {
        const updatedTags = lead.tags!.filter((t) => t !== tagName);
        const response = await fetch(`/api/leads/${lead.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: updatedTags }),
        });

        if (response.ok) {
          const resJson = await response.json();
          const savedLead = resJson.lead;
          const idx = updatedLeadsList.findIndex((l) => l.id === lead.id);
          if (idx !== -1) {
            updatedLeadsList[idx] = savedLead;
          }
          updatedCount++;
        }
      }

      setLeads(updatedLeadsList);
      logAuditEvent({
        action: "Tag Deleted Globally",
        entityType: "system",
        details: `Deleted tag "${tagName}" from all ${updatedCount} lead(s).`,
      });
      alert(`Successfully deleted tag from ${updatedCount} lead(s).`);
    } catch (err) {
      console.error("Error deleting tag:", err);
      alert("Failed to delete tag.");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddTag = async (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed || selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const updatedLeadsList = [...leads];
      const promises = selectedLeadIds.map(async (id) => {
        const lead = leads.find((l) => l.id === id);
        if (lead) {
          const currentTags = lead.tags || [];
          if (!currentTags.includes(trimmed)) {
            const newTags = [...currentTags, trimmed];
            const response = await fetch(`/api/leads/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tags: newTags }),
            });
            if (response.ok) {
              const resJson = await response.json();
              const savedLead = resJson.lead;
              const idx = updatedLeadsList.findIndex((l) => l.id === id);
              if (idx !== -1) {
                updatedLeadsList[idx] = savedLead;
              }
            }
          }
        }
      });
      await Promise.all(promises);
      setLeads(updatedLeadsList);

      logAuditEvent({
        action: "Lead Bulk Tag Added",
        entityType: "lead",
        details: `Added tag "${trimmed}" to ${selectedLeadIds.length} lead(s).`,
      });

      setSelectedLeadIds([]);
      setBulkTagToAdd("");
      setShowBulkTagAdd(false);
      alert(`Tag "${trimmed}" successfully added to selected leads.`);
    } catch (e) {
      console.error("Error bulk adding tag:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRemoveTag = async (tagToRemove: string) => {
    const trimmed = tagToRemove.trim();
    if (!trimmed || selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const updatedLeadsList = [...leads];
      const promises = selectedLeadIds.map(async (id) => {
        const lead = leads.find((l) => l.id === id);
        if (lead) {
          const currentTags = lead.tags || [];
          if (currentTags.includes(trimmed)) {
            const newTags = currentTags.filter((t) => t !== trimmed);
            const response = await fetch(`/api/leads/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tags: newTags }),
            });
            if (response.ok) {
              const resJson = await response.json();
              const savedLead = resJson.lead;
              const idx = updatedLeadsList.findIndex((l) => l.id === id);
              if (idx !== -1) {
                updatedLeadsList[idx] = savedLead;
              }
            }
          }
        }
      });
      await Promise.all(promises);
      setLeads(updatedLeadsList);

      logAuditEvent({
        action: "Lead Bulk Tag Removed",
        entityType: "lead",
        details: `Removed tag "${trimmed}" from ${selectedLeadIds.length} lead(s).`,
      });

      setSelectedLeadIds([]);
      setBulkTagToRemove("");
      setShowBulkTagRemove(false);
      alert(`Tag "${trimmed}" successfully removed from selected leads.`);
    } catch (e) {
      console.error("Error bulk removing tag:", e);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLeadId(null);
    setFormCustomCountry("");
    setFormData({
      name: "",
      email: "",
      phone: detectedCallingCode || "+880",
      source: "Direct",
      notes: "",
      expectedValue: "",
      targetCourse: "IELTS Academic",
      targetBand: "",
      destination: "United Kingdom",
      tags: "",
    });
    setTouched({
      name: false,
      email: false,
      phone: false,
      targetCourse: false,
      targetBand: false,
      destination: false,
    });
    setErrors({
      name: "",
      email: "",
      phone: "",
      targetCourse: "",
      targetBand: "",
      destination: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLeadId(lead.id);
    const dest = lead.destination || "United Kingdom";
    const coreList = [
      "United Kingdom",
      "USA",
      "Canada",
      "Australia",
      "New Zealand",
      "Germany",
      "Ireland",
    ];
    if (dest && !coreList.includes(dest)) {
      setFormCustomCountry(dest);
    } else {
      setFormCustomCountry("");
    }
    setFormData({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      notes: lead.notes || "",
      expectedValue: lead.expectedValue || "",
      targetCourse: lead.targetCourse || "IELTS Academic",
      targetBand: lead.targetBand || "",
      destination: dest,
      tags: lead.tags ? lead.tags.join(", ") : "",
    });
    setTouched({
      name: false,
      email: false,
      phone: false,
      targetCourse: false,
      targetBand: false,
      destination: false,
    });
    setErrors({
      name: "",
      email: "",
      phone: "",
      targetCourse: "",
      targetBand: "",
      destination: "",
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setTouched({
      name: true,
      email: true,
      phone: true,
      targetCourse: true,
      targetBand: true,
      destination: true,
    });

    if (!isFormValid) {
      alert("Please resolve form validation parameters before submitting.");
      return;
    }

    setIsSubmitting(true);

    let finalPhone = formData.phone.trim().replace(/[\s-]/g, "");
    if (finalPhone.startsWith("01") && finalPhone.length === 11) {
      finalPhone = "88" + finalPhone;
    } else if (finalPhone.startsWith("1") && finalPhone.length === 10) {
      finalPhone = "880" + finalPhone;
    }

    try {
      const parsedTags = formData.tags
        ? formData.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

      const baseData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: finalPhone,
        source: formData.source,
        status: editingLeadId ? undefined : "New Lead", // Add status field
        notes: formData.notes,
        targetCourse: formData.targetCourse,
        targetBand: formData.targetBand,
        destination: formData.destination,
        tags: parsedTags,
      };

      const dataToSave: any = { ...baseData };
      if (formData.expectedValue) {
        dataToSave.expectedValue = Number(formData.expectedValue);
      }

      if (editingLeadId) {
        const response = await fetch(`/api/leads/${editingLeadId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSave),
        });
        if (response.ok) {
          const resData = await response.json();
          const savedLead = resData.lead;

          // Evaluate keywords trigger and update state accordingly
          const finalizedLead = await evaluateKeywordsTrigger(
            userId,
            savedLead,
          );
          setLeads((prev) =>
            prev.map((l) => (l.id === editingLeadId ? finalizedLead : l)),
          );

          // If status changed in the edit, trigger status changed events
          const lead = leads.find((l) => l.id === editingLeadId);
          if (lead && dataToSave.status && lead.status !== dataToSave.status) {
            const updatedLead = {
              ...lead,
              ...dataToSave,
              tags: finalizedLead.tags,
            };
            triggerGlobalWebhook(userId, "Lead Status Changed", updatedLead);
            triggerWorkflowAutomations(
              userId,
              "Lead Status Changed",
              dataToSave.status,
              updatedLead,
            );
          }

          // Publish log event
          logAuditEvent({
            action: "Lead Profile Updated",
            entityType: "lead",
            entityId: editingLeadId,
            details: `Lead "${dataToSave.name || lead?.name || "Unknown"}" details updated by admin.`,
          });
        } else {
          const errData = await response.json().catch(() => ({}));
          alert(`Error saving: ${errData.error || response.statusText}`);
          setIsSubmitting(false);
          return;
        }
      } else {
        const response = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...dataToSave,
            userId: userId,
          }),
        });
        if (response.ok) {
          const resData = await response.json();
          const createdLead = resData.lead;

          // Evaluate keywords trigger and update state accordingly
          const finalizedLead = await evaluateKeywordsTrigger(
            userId,
            createdLead,
          );
          setLeads((prev) => [finalizedLead, ...prev]);

          // Dispatch automation trigger on lead creation
          triggerGlobalWebhook(userId, "Lead Created", finalizedLead);
          triggerWorkflowAutomations(
            userId,
            "Lead Created",
            "New Lead",
            finalizedLead,
          );
          triggerWorkflowAutomations(
            userId,
            "Lead Status Changed",
            "New Lead",
            finalizedLead,
          );

          // Publish log event
          logAuditEvent({
            action: "Lead Acquired",
            entityType: "lead",
            entityId: finalizedLead.id,
            details: `Registered new student lead: "${finalizedLead.name}" via "${finalizedLead.source}".`,
          });
        } else {
          const errData = await response.json().catch(() => ({}));
          alert(`Error creating: ${errData.error || response.statusText}`);
          setIsSubmitting(false);
          return;
        }
      }
      closeModal();
    } catch (err: any) {
      console.error("Error saving lead", err);
      alert(err.message || "Error saving lead");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Source",
      "Status",
      "Lead Score",
      "Tags",
      "Expected Value",
      "Target Course",
      "Target Band",
      "Destination",
      "Created At",
    ];

    const rows = leads.map((lead) => [
      lead.name,
      lead.email,
      lead.phone,
      lead.source,
      lead.status,
      calculateLeadScore(lead).score,
      lead.tags ? lead.tags.join("; ") : "",
      lead.expectedValue || "",
      lead.targetCourse || "",
      lead.targetBand || "",
      lead.destination || "",
      format(new Date(lead.createdAt), "yyyy-MM-dd HH:mm:ss"),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((e) =>
        e.map((val) => `"${String(val || "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `crm_leads_export_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!isSuperAdmin) {
      alert(
        "Access Denied: Only a Super Admin is authorized to permanently delete leads.",
      );
      return;
    }
    if (!confirm("Are you sure you want to delete this lead?")) return;
    try {
      const resp = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (resp.ok) {
        setLeads((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Find duplicates of Email
  const duplicateEmails = React.useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((l) => {
      const email = l.email?.trim().toLowerCase();
      if (email) {
        counts.set(email, (counts.get(email) || 0) + 1);
      }
    });
    return counts;
  }, [leads]);

  // Find duplicates of Phone
  const duplicatePhones = React.useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((l) => {
      const phone = l.phone?.trim().replace(/[\s-]/g, "");
      if (phone) {
        counts.set(phone, (counts.get(phone) || 0) + 1);
      }
    });
    return counts;
  }, [leads]);

  const isDuplicateEmail = (email?: string) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    return (duplicateEmails.get(clean) || 0) > 1;
  };

  const isDuplicatePhone = (phone?: string) => {
    if (!phone) return false;
    const clean = phone.trim().replace(/[\s-]/g, "");
    return (duplicatePhones.get(clean) || 0) > 1;
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.email.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search) ||
      lead.status.toLowerCase().includes(search.toLowerCase()) ||
      (lead.tags &&
        lead.tags.some((t) => t.toLowerCase().includes(search.toLowerCase())));
    const matchesStatus =
      statusFilter === "All" || lead.status === statusFilter;
    const matchesSource =
      sourceFilter === "All" || lead.source === sourceFilter;
    const matchesCountry =
      countryFilter === "All" || lead.destination === countryFilter;
    const matchesTag =
      tagFilter === "All" || (lead.tags && lead.tags.includes(tagFilter));

    if (showDuplicatesOnly) {
      const email = lead.email?.trim().toLowerCase();
      const phone = lead.phone?.trim().replace(/[\s-]/g, "");
      const hasDupEmail = email ? (duplicateEmails.get(email) || 0) > 1 : false;
      const hasDupPhone = phone ? (duplicatePhones.get(phone) || 0) > 1 : false;
      if (!hasDupEmail && !hasDupPhone) {
        return false;
      }
    }

    return (
      matchesSearch &&
      matchesStatus &&
      matchesSource &&
      matchesCountry &&
      matchesTag
    );
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === "createdAt-desc") {
      return b.createdAt - a.createdAt;
    }
    if (sortBy === "createdAt-asc") {
      return a.createdAt - b.createdAt;
    }
    if (sortBy === "score-desc") {
      return calculateLeadScore(b).score - calculateLeadScore(a).score;
    }
    if (sortBy === "expectedValue-desc") {
      return (b.expectedValue || 0) - (a.expectedValue || 0);
    }
    return 0;
  });

  const statusColors: Record<LeadStatus, string> = {
    "New Lead": "bg-blue-100 text-blue-700",
    Contact: "bg-amber-100 text-amber-700",
    "Follow-up Required": "bg-purple-100 text-purple-700",
    "Consultation Booked": "bg-indigo-100 text-indigo-700",
    "Counseling Done": "bg-teal-100 text-teal-700",
    "Demo Class Booked": "bg-pink-100 text-pink-700",
    "Payment Pending": "bg-orange-100 text-orange-700",
    "Re-engagement Offer": "bg-fuchsia-100 text-fuchsia-700",
    Enrolled: "bg-emerald-100 text-emerald-700",
    Discarded: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">
            Leads Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage inquiries from all ad sources and forms.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            title="Export leads to a CSV file"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Leads
          </button>
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
            title="Import multiple leads via file upload or paste"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            Bulk Import
          </button>
          <button
            onClick={() => setIsTagManagerOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
            title="Open global CRM tag manager"
          >
            <Tag className="w-4 h-4 text-indigo-600 animate-pulse" />
            Tag Manager
          </button>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-350">
        {/* Quick Filter Tabs for Status */}
        <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 flex flex-wrap gap-2 items-center bg-slate-50/20">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none mr-1.5">
            Quick Status:
          </span>
          {[
            "All",
            "New Lead",
            "Contact",
            "Follow-up Required",
            "Consultation Booked",
            "Enrolled",
          ].map((st) => {
            const isActive = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-250 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-150"
                    : "bg-slate-100/80 hover:bg-slate-200 text-slate-700 hover:text-slate-900 shadow-3xs"
                }`}
              >
                {st === "All" ? "All Leads" : st}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row gap-4 justify-between items-stretch xl:items-center bg-slate-50/50">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, status, phone, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-14 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white shadow-3xs placeholder-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-150 hover:bg-slate-200 text-slate-500 hover:text-slate-700 hover:scale-105 active:scale-95 px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">
            {/* Status Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs hover:border-slate-350 transition-all">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700 leading-none select-none"
              >
                <option value="All">All Statuses</option>
                <option value="New Lead">New Lead</option>
                <option value="Contact">Contact</option>
                <option value="Follow-up Required">Follow-up Required</option>
                <option value="Consultation Booked">Consultation Booked</option>
                <option value="Counseling Done">Counseling Done</option>
                <option value="Demo Class Booked">Demo Class Booked</option>
                <option value="Payment Pending">Payment Pending</option>
                <option value="Re-engagement Offer">Re-engagement Offer</option>
                <option value="Enrolled">Enrolled</option>
                <option value="Discarded">Discarded</option>
              </select>
            </div>

            {/* Lead Source Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs hover:border-slate-350 transition-all">
              <Tag className="w-4 h-4 text-slate-400" />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700 leading-none select-none"
              >
                <option value="All">All Sources</option>
                <option value="Facebook Ads">Facebook Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Youtube Ads">Youtube Ads</option>
                <option value="Website Form">Website Form</option>
                <option value="Direct">Direct</option>
                <option value="Referral">Referral</option>
                {customSources.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
                <option value="Others">Others</option>
              </select>
            </div>

            {/* Target Country Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs hover:border-slate-350 transition-all">
              <Globe className="w-4 h-4 text-slate-400" />
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700 max-w-[130px] truncate leading-none select-none"
              >
                <option value="All">All Countries</option>
                {uniqueCountries.map(({ name, count }) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Tag / Category Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs hover:border-slate-350 transition-all">
              <Tag className="w-4 h-4 text-indigo-500" />
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700 max-w-[130px] truncate leading-none select-none"
              >
                <option value="All">All Tags</option>
                {distinctTagsWithCounts.map(({ name, count }) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Diagnostics / Duplicates Filter */}
            <button
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all duration-200 shadow-xs cursor-pointer ${
                showDuplicatesOnly
                  ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white hover:scale-102 active:scale-98"
                  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
              }`}
              title="Show only leads that have duplicate email or phone numbers"
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${showDuplicatesOnly ? "text-white" : "text-amber-500"}`}
              />
              {showDuplicatesOnly ? "Duplicates Only" : "Find Duplicates"}
            </button>

            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs hover:border-slate-350 transition-all">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700 leading-none select-none"
              >
                <option value="createdAt-desc">Newest First</option>
                <option value="createdAt-asc">Oldest First</option>
                <option value="score-desc">Highest Lead Score</option>
                <option value="expectedValue-desc">Highest Pipeline</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filters Summary Row */}
        {(search !== "" ||
          statusFilter !== "All" ||
          sourceFilter !== "All" ||
          countryFilter !== "All" ||
          tagFilter !== "All" ||
          showDuplicatesOnly) && (
          <div className="bg-amber-50/30 border-b border-amber-100/50 px-4 py-2 flex flex-wrap gap-2 items-center text-xs text-slate-600 justify-between animate-in slide-in-from-top-1 duration-200">
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider select-none mr-1">
                Active Filters:
              </span>
              {search !== "" && (
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  Keyword:{" "}
                  <strong className="text-slate-900 font-mono text-[10px]">
                    {search}
                  </strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setSearch("")}
                  />
                </span>
              )}
              {statusFilter !== "All" && (
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  Status:{" "}
                  <strong className="text-indigo-950 font-bold">
                    {statusFilter}
                  </strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setStatusFilter("All")}
                  />
                </span>
              )}
              {sourceFilter !== "All" && (
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  Source:{" "}
                  <strong className="text-slate-900 font-bold">
                    {sourceFilter}
                  </strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setSourceFilter("All")}
                  />
                </span>
              )}
              {countryFilter !== "All" && (
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  Country:{" "}
                  <strong className="text-slate-900 font-bold">
                    {countryFilter}
                  </strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setCountryFilter("All")}
                  />
                </span>
              )}
              {tagFilter !== "All" && (
                <span className="bg-white border border-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  Tag:{" "}
                  <strong className="text-slate-900 font-semibold">
                    {tagFilter}
                  </strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setTagFilter("All")}
                  />
                </span>
              )}
              {showDuplicatesOnly && (
                <span className="bg-amber-100 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-3xs">
                  <strong>Duplicates Only</strong>
                  <X
                    className="w-3 h-3 hover:text-red-500 cursor-pointer ml-0.5"
                    onClick={() => setShowDuplicatesOnly(false)}
                  />
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("All");
                setSourceFilter("All");
                setCountryFilter("All");
                setTagFilter("All");
                setShowDuplicatesOnly(false);
              }}
              className="text-xs text-indigo-600 hover:text-indigo-850 font-bold hover:underline transition-all cursor-pointer underline-offset-2 ml-auto"
            >
              Reset All Filters
            </button>
          </div>
        )}

        {/* Dynamic Bulk Actions Bar */}
        {selectedLeadIds.length > 0 && (
          <div className="bg-indigo-50/80 border-b border-indigo-100 px-6 py-3 flex flex-col sm:flex-row gap-3 justify-between items-center animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-900 bg-indigo-100 px-2.5 py-1 rounded-full">
                {selectedLeadIds.length} select
                {selectedLeadIds.length === 1 ? "ed" : "s"}
              </span>
              <span className="text-sm font-medium text-indigo-700">
                Leads selected for bulk operations
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <div className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-xl px-3 py-1.5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                  Change Status:
                </span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value as LeadStatus);
                      e.target.value = ""; // Reset select
                    }
                  }}
                  defaultValue=""
                  className="text-xs font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                >
                  <option value="" disabled>
                    Select Status...
                  </option>
                  <option value="New Lead">New Lead</option>
                  <option value="Contact">Contact</option>
                  <option value="Follow-up Required">Follow-up Required</option>
                  <option value="Consultation Booked">
                    Consultation Booked
                  </option>
                  <option value="Counseling Done">Counseling Done</option>
                  <option value="Demo Class Booked">Demo Class Booked</option>
                  <option value="Payment Pending">Payment Pending</option>
                  <option value="Re-engagement Offer">
                    Re-engagement Offer
                  </option>
                  <option value="Enrolled">Enrolled</option>
                  <option value="Discarded">Discarded</option>
                </select>
              </div>

              {/* Bulk Tag addition */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBulkTagAdd(!showBulkTagAdd);
                    setShowBulkTagRemove(false);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Tag className="w-3.5 h-3.5 text-indigo-500" />+ Add Tag
                </button>
                {showBulkTagAdd && (
                  <div className="absolute right-0 top-full mt-1.5 z-10 bg-white border border-slate-200 rounded-xl p-3 shadow-md w-56 flex flex-col gap-2">
                    <input
                      type="text"
                      className="border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 w-full"
                      placeholder="e.g. priority-lead"
                      value={bulkTagToAdd}
                      onChange={(e) => setBulkTagToAdd(e.target.value)}
                    />
                    <button
                      onClick={() => handleBulkAddTag(bulkTagToAdd)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1 text-[11px] font-bold"
                    >
                      Apply Tag
                    </button>
                  </div>
                )}
              </div>

              {/* Bulk Tag removal */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBulkTagRemove(!showBulkTagRemove);
                    setShowBulkTagAdd(false);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <X className="w-3.5 h-3.5 text-red-500" />- Remove Tag
                </button>
                {showBulkTagRemove && (
                  <div className="absolute right-0 top-full mt-1.5 z-10 bg-white border border-slate-200 rounded-xl p-3 shadow-md w-56 flex flex-col gap-2">
                    <input
                      type="text"
                      className="border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 w-full"
                      placeholder="e.g. test-tag"
                      value={bulkTagToRemove}
                      onChange={(e) => setBulkTagToRemove(e.target.value)}
                    />
                    <button
                      onClick={() => handleBulkRemoveTag(bulkTagToRemove)}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-lg py-1 text-[11px] font-bold"
                    >
                      Remove Tag
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  const targetLeads = leads.filter(l => selectedLeadIds.includes(l.id));
                  handleOpenSmsModal(targetLeads);
                }}
                className="bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send SMS
              </button>

              <button
                onClick={handleBulkDelete}
                className="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>

              <button
                onClick={() => {
                  setSelectedLeadIds([]);
                  setShowBulkTagAdd(false);
                  setShowBulkTagRemove(false);
                }}
                className="text-slate-500 hover:text-slate-800 px-2.5 py-1.5 text-xs font-semibold"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="pl-6 pr-2 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      sortedLeads.length > 0 &&
                      sortedLeads.every((l) => selectedLeadIds.includes(l.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLeadIds((prev) => {
                          const newSelection = [...prev];
                          sortedLeads.forEach((l) => {
                            if (!newSelection.includes(l.id)) {
                              newSelection.push(l.id);
                            }
                          });
                          return newSelection;
                        });
                      } else {
                        setSelectedLeadIds((prev) =>
                          prev.filter(
                            (id) => !sortedLeads.some((l) => l.id === id),
                          ),
                        );
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                  />
                </th>
                <th className="px-6 py-4">Lead Name</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Lead Score</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-slate-400 animate-pulse"
                  >
                    Loading leads...
                  </td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    No leads found matching your criteria.
                  </td>
                </tr>
              ) : (
                sortedLeads.map((lead, idx) => {
                  const scoreDetails = calculateLeadScore(lead);
                  const isSelected = selectedLeadIds.includes(lead.id);
                  const isExpanded = expandedLeadIds.includes(lead.id);
                  return (
                    <React.Fragment
                      key={lead.id ? `${lead.id}-${idx}` : `lead-idx-${idx}`}
                    >
                      <tr
                        className={`hover:bg-slate-50/50 transition-colors cursor-pointer group ${isSelected ? "bg-indigo-50/30" : ""} ${isExpanded ? "bg-slate-50/70 border-b-none" : ""}`}
                        onClick={(e) => {
                          const isInteractive = (
                            e.target as HTMLElement
                          ).closest(
                            'select, input, button, a, [role="button"]',
                          );
                          if (!isInteractive) {
                            toggleLeadExpand(lead.id);
                          }
                        }}
                      >
                        <td className="pl-6 pr-2 py-4 w-14">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedLeadIds((prev) =>
                                  prev.includes(lead.id)
                                    ? prev.filter((id) => id !== lead.id)
                                    : [...prev, lead.id],
                                );
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4 shrink-0"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLeadExpand(lead.id);
                              }}
                              className="p-0.5 rounded hover:bg-slate-200/50 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                              title={
                                isExpanded
                                  ? "Collapse Details"
                                  : "Expand Details"
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                            <span>{lead.name}</span>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${scoreDetails.badgeBg} ${scoreDetails.badgeText}`}
                              title={`Lead Score: ${scoreDetails.score} (${scoreDetails.level})`}
                            >
                              ★ {scoreDetails.score}
                            </span>
                          </div>

                          {/* Tags Pill Container */}
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {lead.tags.map((tag, idx) => (
                                <span
                                  key={`${tag}-${idx}`}
                                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700/80 border border-indigo-100/50"
                                >
                                  <Tag className="w-2 h-2 text-indigo-400" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {lead.notes && (
                            <div
                              className="text-[11px] text-slate-400 font-medium truncate max-w-[150px] mt-1"
                              title={lead.notes}
                            >
                              📝 {lead.notes}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col space-y-1">
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <Phone className="w-3.5 h-3.5" /> {lead.phone}
                              {lead.phoneVerified && (
                                <CheckCircle2
                                  className="w-3.5 h-3.5 text-emerald-500"
                                  title="Phone number verified via OTP"
                                />
                              )}
                              {isDuplicatePhone(lead.phone) && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                  title="Duplicate Phone Number detected"
                                >
                                  Duplicate Phone
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                              <Mail className="w-3.5 h-3.5" /> {lead.email}
                              {isDuplicateEmail(lead.email) && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                  title="Duplicate Email Address detected"
                                >
                                  Duplicate Email
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 border border-slate-200">
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              handleStatusChange(
                                lead.id,
                                e.target.value as LeadStatus,
                              )
                            }
                            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 cursor-pointer ${statusColors[lead.status]}`}
                          >
                            <option value="New Lead">New Lead</option>
                            <option value="Contact">Contact</option>
                            <option value="Follow-up Required">
                              Follow-up Required
                            </option>
                            <option value="Consultation Booked">
                              Consultation Booked
                            </option>
                            <option value="Counseling Done">
                              Counseling Done
                            </option>
                            <option value="Demo Class Booked">
                              Demo Class Booked
                            </option>
                            <option value="Payment Pending">
                              Payment Pending
                            </option>
                            <option value="Re-engagement Offer">
                              Re-engagement Offer
                            </option>
                            <option value="Enrolled">Enrolled</option>
                            <option value="Discarded">Discarded</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-bold ${scoreDetails.color}`}
                            >
                              {scoreDetails.score}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreDetails.badgeBg} ${scoreDetails.badgeText}`}
                            >
                              {scoreDetails.level}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                          {format(new Date(lead.createdAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSmsModal([lead]);
                              }}
                              className="text-slate-400 hover:text-emerald-600 p-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
                              title="Send Manual SMS"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEditModal(lead)}
                              className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                              title="Edit Lead"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(lead.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              title="Delete Lead"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable row detail view */}
                      {isExpanded && (
                        <tr className="bg-slate-50/20 select-none">
                          <td
                            colSpan={8}
                            className="p-0 border-b border-slate-100"
                          >
                            <div className="px-6 py-5 bg-slate-50/40 divide-y divide-slate-100">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-5 border-none">
                                {/* Item 1: Student IELTS & Course Profile */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <GraduationCap className="w-4 h-4 text-indigo-500" />
                                    Academic & Target Country
                                  </h4>
                                  <div className="bg-white border border-slate-200/70 p-4 rounded-xl space-y-2.5 shadow-3xs">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500">
                                        Target Course:
                                      </span>
                                      <span className="font-bold text-slate-800 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                                        {lead.targetCourse || "Not Specified"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500">
                                        Target Band:
                                      </span>
                                      <span className="font-bold text-slate-800 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
                                        ★ {lead.targetBand || "Any"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-slate-500">
                                        Destination:
                                      </span>
                                      <span className="font-bold text-slate-800 flex items-center gap-1">
                                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                                        {lead.destination || "Not Specified"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-2 mt-2">
                                      <span className="text-slate-500 font-medium">
                                        Expected Value (Budget):
                                      </span>
                                      <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                        {lead.expectedValue
                                          ? `৳${Number(lead.expectedValue).toLocaleString()}`
                                          : "Not Specified"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Item 2: Mock scores / Performance logs */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <BookOpen className="w-4 h-4 text-emerald-500" />
                                    IELTS Mock Test Scores
                                  </h4>
                                  <div className="bg-white border border-slate-200/70 p-4 rounded-xl text-xs flex flex-col justify-between shadow-3xs min-h-[135px]">
                                    {lead.mockScores &&
                                    lead.mockScores.length > 0 ? (
                                      <div className="space-y-2 max-h-32 overflow-y-auto">
                                        {lead.mockScores.map((score, sIdx) => (
                                          <div
                                            key={sIdx}
                                            className="border border-slate-100 p-2 rounded-lg space-y-1"
                                          >
                                            <div className="flex justify-between items-center">
                                              <span className="font-bold text-slate-700">
                                                Mock Run #{sIdx + 1}
                                              </span>
                                              <span className="text-[10px] text-slate-400">
                                                {format(
                                                  new Date(score.date),
                                                  "MMM d, yyyy",
                                                )}
                                              </span>
                                            </div>
                                            <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-mono">
                                              <div className="bg-slate-50 p-0.5 rounded leading-tight">
                                                <div className="text-[8px] text-slate-400">
                                                  L
                                                </div>
                                                <div className="font-bold">
                                                  {score.listening}
                                                </div>
                                              </div>
                                              <div className="bg-slate-50 p-0.5 rounded leading-tight">
                                                <div className="text-[8px] text-slate-400">
                                                  R
                                                </div>
                                                <div className="font-bold">
                                                  {score.reading}
                                                </div>
                                              </div>
                                              <div className="bg-slate-50 p-0.5 rounded leading-tight">
                                                <div className="text-[8px] text-slate-400">
                                                  W
                                                </div>
                                                <div className="font-bold">
                                                  {score.writing}
                                                </div>
                                              </div>
                                              <div className="bg-slate-50 p-0.5 rounded leading-tight">
                                                <div className="text-[8px] text-slate-400">
                                                  S
                                                </div>
                                                <div className="font-bold">
                                                  {score.speaking}
                                                </div>
                                              </div>
                                              <div className="bg-indigo-50 border border-indigo-100 p-0.5 rounded leading-tight text-indigo-700 font-bold">
                                                <div className="text-[8px] text-indigo-400">
                                                  O
                                                </div>
                                                <div>{score.overall}</div>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-center py-4 text-slate-400 italic">
                                        No mock exam scores recorded.
                                      </div>
                                    )}
                                    <button
                                      onClick={() => openEditModal(lead)}
                                      className="w-full text-center border border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-emerald-700 font-bold py-1 rounded-lg transition-all text-[11px] flex items-center justify-center gap-1 mt-2 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" /> Log Scores /
                                      Edit Profile
                                    </button>
                                  </div>
                                </div>

                                {/* Item 3: Communications & Study Mode Preferences */}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    Adviser Insights & Timeline
                                  </h4>
                                  <div className="bg-white border border-slate-200/70 p-4 rounded-xl space-y-2 text-xs shadow-3xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">
                                        Registration Date:
                                      </span>
                                      <span className="font-semibold text-slate-700">
                                        {format(
                                          new Date(lead.createdAt),
                                          "PP p",
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">
                                        Study Preferences:
                                      </span>
                                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                        {lead.preferences?.studyMode ||
                                          "Not Specified"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">
                                        Time to Start:
                                      </span>
                                      <span className="font-semibold text-slate-700">
                                        {lead.preferences?.timeline ||
                                          "Not Specified"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500">
                                        Phone Verification:
                                      </span>
                                      <span
                                        className={`font-bold flex items-center gap-1 ${lead.phoneVerified ? "text-emerald-600" : "text-slate-400"}`}
                                      >
                                        {lead.phoneVerified
                                          ? "✓ Verified (OTP)"
                                          : "Unverified"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Save Direct Notes Interface */}
                              <div className="pt-4 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start border-t border-slate-200/50">
                                <div className="lg:col-span-3">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <FileText className="w-4 h-4 text-slate-500" />
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                      Direct Counselor Comments & Intake Notes
                                    </span>
                                  </div>
                                  <textarea
                                    value={
                                      editingNotesText[lead.id] !== undefined
                                        ? editingNotesText[lead.id]
                                        : lead.notes || ""
                                    }
                                    onChange={(e) => {
                                      setEditingNotesText((prev) => ({
                                        ...prev,
                                        [lead.id]: e.target.value,
                                      }));
                                    }}
                                    className="w-full h-20 text-xs border border-slate-200 rounded-xl p-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 placeholder-slate-400 leading-relaxed font-sans"
                                    placeholder="Write quick interactions, counseling logs, target university/degree requirement detail or next follow up logs..."
                                  />
                                </div>
                                <div className="space-y-2 lg:mt-6">
                                  <button
                                    disabled={savingNotesId === lead.id}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const nText =
                                        editingNotesText[lead.id] !== undefined
                                          ? editingNotesText[lead.id]
                                          : lead.notes || "";
                                      setSavingNotesId(lead.id);
                                      try {
                                        const r = await fetch(
                                          `/api/leads/${lead.id}`,
                                          {
                                            method: "PUT",
                                            headers: {
                                              "Content-Type":
                                                "application/json",
                                            },
                                            body: JSON.stringify({
                                              notes: nText,
                                            }),
                                          },
                                        );
                                        if (r.ok) {
                                          const d = await r.json();
                                          setLeads((prev) =>
                                            prev.map((l) =>
                                              l.id === lead.id
                                                ? { ...l, notes: d.lead.notes }
                                                : l,
                                            ),
                                          );
                                          logAuditEvent({
                                            action: "Lead Profile Updated",
                                            entityType: "lead",
                                            entityId: lead.id,
                                            details: `Directly updated table-expand comments/notes for student lead "${lead.name}".`,
                                          });
                                          alert("Comments saved successfully!");
                                        } else {
                                          alert(
                                            "Failed to save updated notes.",
                                          );
                                        }
                                      } catch (error) {
                                        console.error(error);
                                        alert("Network error updating notes.");
                                      } finally {
                                        setSavingNotesId(null);
                                      }
                                    }}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer hover:scale-101 active:scale-99"
                                  >
                                    {savingNotesId === lead.id ? (
                                      <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        Save Note Changes
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => toggleLeadExpand(lead.id)}
                                    className="w-full border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 font-bold text-xs py-2 px-4 rounded-xl text-center cursor-pointer block"
                                  >
                                    Collapse Panel
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500 text-center sm:text-left flex justify-between items-center">
          Showing {sortedLeads.length} of {leads.length} total leads
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeModal}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingLeadId ? "Edit Lead" : "Add New Lead"}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  onBlur={() => handleBlurField("name")}
                  className={getFieldStyles("name")}
                  placeholder="John Doe"
                />
                {touched.name && errors.name && (
                  <span
                    role="alert"
                    className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                  >
                    ⚠️ {errors.name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    onBlur={() => handleBlurField("phone")}
                    className={getFieldStyles("phone")}
                    placeholder="0171..."
                  />
                  {touched.phone && errors.phone && (
                    <span
                      role="alert"
                      className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                    >
                      ⚠️ {errors.phone}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    onBlur={() => handleBlurField("email")}
                    className={getFieldStyles("email")}
                    placeholder="john@example.com"
                  />
                  {touched.email && errors.email && (
                    <span
                      role="alert"
                      className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                    >
                      ⚠️ {errors.email}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Lead Source
                </label>
                <select
                  value={formData.source}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      source: e.target.value as LeadSource,
                    })
                  }
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-505 bg-white font-medium"
                >
                  <option value="Facebook Ads">Facebook Ads</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="Youtube Ads">Youtube Ads</option>
                  <option value="Website Form">Website Form</option>
                  <option value="Direct">Direct</option>
                  <option value="Referral">Referral</option>
                  {customSources.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                  <option value="Others">Others</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tags{" "}
                  <span className="text-[11px] text-slate-400 font-normal">
                    (comma-separated labels)
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) =>
                    setFormData({ ...formData, tags: e.target.value })
                  }
                  placeholder="e.g. Study Abroad, High Intent, Referral"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Activity Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm placeholder:text-slate-400"
                  placeholder="Record call summaries, applicant history, or follow-up notes here..."
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Target Course
                  </label>
                  <select
                    value={formData.targetCourse}
                    onChange={(e) =>
                      handleInputChange("targetCourse", e.target.value)
                    }
                    onBlur={() => handleBlurField("targetCourse")}
                    className={getFieldStyles("targetCourse")}
                  >
                    <option value="">Select Course</option>
                    <option value="IELTS Academic">IELTS Academic</option>
                    <option value="IELTS GT">IELTS GT</option>
                    <option value="IELTS UKVI">IELTS UKVI</option>
                    <option value="IELTS Life Skills">IELTS Life Skills</option>
                  </select>
                  {touched.targetCourse && errors.targetCourse && (
                    <span
                      role="alert"
                      className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                    >
                      ⚠️ {errors.targetCourse}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Target Band
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="6"
                    max="9"
                    value={formData.targetBand}
                    onChange={(e) =>
                      handleInputChange("targetBand", e.target.value)
                    }
                    onBlur={() => handleBlurField("targetBand")}
                    className={getFieldStyles("targetBand")}
                    placeholder="e.g. 7.5"
                  />
                  {touched.targetBand && errors.targetBand && (
                    <span
                      role="alert"
                      className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                    >
                      ⚠️ {errors.targetBand}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Target Country
                  </label>
                  <select
                    value={
                      formData.destination === "Other" ||
                      formData.destination === "Others" ||
                      ![
                        "",
                        "United Kingdom",
                        "USA",
                        "Canada",
                        "Australia",
                        "New Zealand",
                        "Germany",
                        "Ireland",
                      ].includes(formData.destination)
                        ? "Others"
                        : formData.destination
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "Others") {
                        handleInputChange("destination", "Others");
                        setFormCustomCountry("");
                      } else {
                        handleInputChange("destination", val);
                        setFormCustomCountry("");
                      }
                    }}
                    onBlur={() => handleBlurField("destination")}
                    className={getFieldStyles("destination")}
                  >
                    <option value="">Select target destination</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="USA">USA</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="New Zealand">New Zealand</option>
                    <option value="Germany">Germany</option>
                    <option value="Ireland">Ireland</option>
                    <option value="Others">Others</option>
                  </select>
                  {touched.destination && errors.destination && (
                    <span
                      role="alert"
                      className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1"
                    >
                      ⚠️ {errors.destination}
                    </span>
                  )}

                  {/* If others is selected, specify the exact country */}
                  {(formData.destination === "Others" ||
                    formData.destination === "Other" ||
                    (![
                      "",
                      "United Kingdom",
                      "USA",
                      "Canada",
                      "Australia",
                      "New Zealand",
                      "Germany",
                      "Ireland",
                    ].includes(formData.destination) &&
                      formData.destination !== "")) && (
                    <div className="mt-2 text-left relative animate-in fade-in duration-200">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1 pl-0.5">
                        Please specify country{" "}
                        <span className="text-[#e31c3d]">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Japan, Sweden, Malaysia"
                        value={
                          formCustomCountry ||
                          (formData.destination !== "Others" &&
                          formData.destination !== "Other"
                            ? formData.destination
                            : "")
                        }
                        onChange={(e) => {
                          const userVal = e.target.value;
                          setFormCustomCountry(userVal);
                          setFormData((prev) => ({
                            ...prev,
                            destination: userVal,
                          }));
                        }}
                        onBlur={() => handleBlurField("destination")}
                        className={getFieldStyles("destination")}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Expected Pipeline Value ($)
                  </label>
                  <input
                    type="number"
                    value={formData.expectedValue}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expectedValue: e.target.value,
                      })
                    }
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2 rounded-xl transition-colors border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  className={`flex-1 font-medium py-2 rounded-xl transition-colors shadow-sm ${
                    isFormValid && !isSubmitting
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingLeadId
                      ? "Save Changes"
                      : "Create Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Tag Manager Modal */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div
            className="absolute inset-0"
            onClick={() => {
              setIsTagManagerOpen(false);
              setEditingTag(null);
              setNewTagName("");
            }}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900 font-display">
                  CRM Tag Manager
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsTagManagerOpen(false);
                  setEditingTag(null);
                  setNewTagName("");
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-grow">
              <p className="text-slate-500 text-sm leading-relaxed">
                Globally manage CRM tags across all leads. You can rename tags
                to update all matching student profiles, filter leads, or delete
                tags permanently.
              </p>

              {distinctTagsWithCounts.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">
                    No tags found on active leads
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Tags can be entered comma-separated when editing or adding
                    student leads.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {distinctTagsWithCounts.map(({ name, count }, idx) => {
                    const isBeingEdited = editingTag === name;
                    return (
                      <div
                        key={`${name || "tag"}-${idx}`}
                        className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors group"
                      >
                        {isBeingEdited ? (
                          <div className="flex items-center gap-2 w-full animate-in fade-in duration-150">
                            <input
                              type="text"
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              className="flex-grow border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="New tag label..."
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                handleRenameTag(name, newTagName);
                                setEditingTag(null);
                                setNewTagName("");
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingTag(null);
                                setNewTagName("");
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5">
                              <span className="bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-lg text-xs border border-indigo-100/50">
                                {name}
                              </span>
                              <span className="text-xs text-slate-400 font-medium font-mono">
                                {count} lead{count === 1 ? "" : "s"}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setTagFilter(name);
                                  setSearch("");
                                  setIsTagManagerOpen(false);
                                }}
                                className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-lg transition-colors"
                                title="Filter leads by this tag"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTag(name);
                                  setNewTagName(name);
                                }}
                                className="p-1.5 hover:bg-slate-100 hover:text-slate-700 text-slate-400 rounded-lg transition-colors"
                                title="Rename tag globally"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTag(name)}
                                className="p-1.5 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-colors"
                                title="Delete tag globally from all leads"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 text-center flex-shrink-0 font-medium">
              💡 Tip: Click search icon to instantly filter the leads list by
              that tag category
            </div>
          </div>
        </div>
      )}

      {/* Bulk Lead Import Modal */}
      {isBulkImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!bulkImportProgress.active) {
                setIsBulkImportOpen(false);
                setBulkInputText("");
              }
            }}
          ></div>

          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900 font-display font-medium">
                  Bulk Import Student Leads
                </h2>
              </div>
              <button
                onClick={() => {
                  if (!bulkImportProgress.active) {
                    setIsBulkImportOpen(false);
                    setBulkInputText("");
                  }
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                disabled={bulkImportProgress.active}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Info Tips & Download Template Banner */}
              <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                    Quick Bulk Template
                  </h4>
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    Import Name, Email, Phone, Country & Courses in one click.
                    Download our starter CSV template to begin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplateCSV}
                  className="bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Template.csv
                </button>
              </div>

              {/* Paste Text / CSV Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-slate-700">
                    Paste CSV or Tab-Delimited Leads Data
                  </label>
                  <label className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer flex items-center gap-1 transition-colors">
                    <Upload className="w-3 h-3" />
                    Upload .csv file
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={bulkImportProgress.active}
                    />
                  </label>
                </div>
                <textarea
                  rows={6}
                  placeholder={`Example row format (First row is headers or positional values like Name,Email,Phone,Source,Course,Band,Destination):\nJohn Doe,john@example.com,01712345678,Facebook Ads,IELTS Academic,7.5,Australia,Interested in fast-track coaching\nJane Doe,jane@example.com,01812345678,Google Ads,IELTS General,6.5,Canada,Wants evening courses`}
                  value={bulkInputText}
                  onChange={(e) => setBulkInputText(e.target.value)}
                  className="w-full text-xs font-mono p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 placeholder-slate-400"
                  disabled={bulkImportProgress.active}
                />
              </div>

              {/* Parsed Preview Section */}
              {bulkInputText.trim().length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 font-bold" />
                    Parsed Leads Preview (
                    {parseLeadsFromText(bulkInputText).length} rows detected)
                  </h3>
                  <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-white shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-medium select-none sticky top-0">
                          <th className="p-2.5 font-bold">Name</th>
                          <th className="p-2.5 font-bold">Phone</th>
                          <th className="p-2.5 font-bold">Email</th>
                          <th className="p-2.5 font-bold">Target Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parseLeadsFromText(bulkInputText).map((lead, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-semibold text-slate-800">
                              {lead.name || "—"}
                            </td>
                            <td className="p-2.5 text-slate-600 font-mono">
                              {lead.phone || "—"}
                            </td>
                            <td className="p-2.5 text-slate-500 font-mono">
                              {lead.email || "—"}
                            </td>
                            <td className="p-2.5 text-slate-600">
                              <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 font-mono">
                                {lead.targetBand ? `${lead.targetBand}` : "7.0"}
                              </span>
                              <span className="text-slate-500">
                                {lead.destination || "UK"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Progress Panel */}
              {bulkImportProgress.active && (
                <div className="bg-[#23085a] text-white rounded-xl p-5 space-y-3.5 shadow-md animate-pulse">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-indigo-200">
                      Importing Student Records...
                    </span>
                    <span className="text-xs font-bold text-indigo-300 font-mono">
                      {bulkImportProgress.current} / {bulkImportProgress.total}{" "}
                      Complete
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-2.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${(bulkImportProgress.current / bulkImportProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  {/* Latest logs */}
                  <div className="text-[10px] h-20 overflow-y-auto bg-slate-900/60 rounded-lg p-2.5 font-mono space-y-1 text-slate-300 divide-y divide-slate-800/20">
                    {bulkImportProgress.results.slice(-4).map((res, i) => (
                      <div key={i} className="pt-0.5">
                        {res}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsBulkImportOpen(false);
                  setBulkInputText("");
                }}
                disabled={bulkImportProgress.active}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50 cursor-pointer animate-in fade-in"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleBulkImport(parseLeadsFromText(bulkInputText))
                }
                disabled={
                  bulkImportProgress.active ||
                  parseLeadsFromText(bulkInputText).length === 0
                }
                className={`px-5 py-2 text-sm font-bold text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                  bulkImportProgress.active ||
                  parseLeadsFromText(bulkInputText).length === 0
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-[#23085a] hover:bg-[#34117f] hover:scale-[1.02] cursor-pointer"
                }`}
              >
                {bulkImportProgress.active
                  ? "Importing..."
                  : `Import ${parseLeadsFromText(bulkInputText).length} Lead${parseLeadsFromText(bulkInputText).length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual & Bulk SMS Dispatch Modal */}
      {isSmsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isSendingSms) setIsSmsModalOpen(false);
            }}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800 font-display">
                    Send Direct CRM SMS
                  </h2>
                  <p className="text-xs text-slate-500">
                    Broadcast manual notifications or personalized templates
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSmsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                disabled={isSendingSms}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scroll */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Recipient summary info banner */}
              <div className="bg-indigo-50/40 border border-indigo-100/50 p-4 rounded-xl space-y-2">
                <span className="text-[10px] font-black uppercase text-indigo-750 tracking-wider bg-indigo-100/60 px-2 py-0.5 rounded-full">
                  Target Recipients ({smsRecipients.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                  {smsRecipients.slice(0, 8).map((recipient) => (
                    <span
                      key={recipient.id}
                      className="text-[11px] font-medium bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs"
                    >
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      {recipient.name} ({recipient.phone})
                    </span>
                  ))}
                  {smsRecipients.length > 8 && (
                    <span className="text-[11px] font-bold text-indigo-600 py-1 px-1">
                      + {smsRecipients.length - 8} more student(s) selected
                    </span>
                  )}
                </div>
              </div>

              {/* Template selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block uppercase tracking-wide">
                  Load Saved Template (Optional)
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="w-full text-xs font-medium border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer text-slate-750"
                  disabled={isSendingSms}
                >
                  <option value="">-- Write Custom SMS from scratch --</option>
                  {smsTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} [Subject: {tpl.subject || "No Subject"}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Message body input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    Message Body Content
                  </label>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      smsMessage.length > 160
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {smsMessage.length} characters (
                    {Math.ceil(smsMessage.length / 160)} Part{Math.ceil(smsMessage.length / 160) === 1 ? "" : "s"})
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  rows={4}
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Enter notification texts here. E.g. Hello {{name}}, Welcome to IELTS Academy! Zoom url: https://zoom.us/j/999 ID: 123 Pass: 456"
                  className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white placeholder-slate-400 font-sans leading-relaxed"
                  disabled={isSendingSms}
                />

                {/* Auto tag insertion pills */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Click to insert dynamic client details:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { key: "{{name}}", label: "Student Name" },
                      { key: "{{phone}}", label: "Phone" },
                      { key: "{{email}}", label: "Email" },
                      { key: "{{targetcourse}}", label: "Target Course" },
                      { key: "{{targetband}}", label: "Target Band Score" },
                      { key: "{{destination}}", label: "Destination Country" },
                    ].map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        onClick={() => insertPlaceholderAtCursor(item.key)}
                        disabled={isSendingSms}
                        className="text-[10px] font-bold bg-slate-50 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 text-slate-600 px-2 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Preview Block (for single recipient) */}
              {smsRecipients.length > 0 && smsMessage.trim().length > 0 && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1.5">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-500 font-bold" />
                    Live Personalized Example Preview ({smsRecipients[0].name})
                  </span>
                  <p className="text-xs text-slate-700 bg-white border border-slate-100 rounded-lg p-2.5 shadow-3xs leading-relaxed font-sans whitespace-pre-wrap">
                    {replaceSmsPlaceholders(smsMessage, smsRecipients[0])}
                  </p>
                </div>
              )}

              {/* Broadcast Run Summary logs */}
              {smsLogsSummary && (
                <div className="bg-slate-900 rounded-xl p-4 text-white space-y-2.5 border border-slate-850 shadow-md">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="text-xs font-bold font-display text-indigo-300">
                      Dispatched Direct Bulk Log Summary
                    </span>
                    <span className="text-[10px] font-bold bg-white/10 px-2.5 py-0.5 rounded-full font-mono">
                      Success: {smsLogsSummary.successCount} | Failed: {smsLogsSummary.failedCount}
                    </span>
                  </div>
                  <div className="space-y-1 text-[10px] font-mono h-24 overflow-y-auto text-slate-300 divide-y divide-white/5">
                    {smsLogsSummary.results.map((log, idx) => (
                      <div
                        key={idx}
                        className={`pt-1 pb-1 ${
                          log.startsWith("✓") ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsSmsModalOpen(false)}
                disabled={isSendingSms}
                className="px-4 py-2 text-sm font-medium text-slate-705 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSendManualSms}
                disabled={isSendingSms || !smsMessage.trim() || smsRecipients.length === 0}
                className={`px-5 py-2 text-sm font-bold text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 ${
                  isSendingSms || !smsMessage.trim() || smsRecipients.length === 0
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] cursor-pointer"
                }`}
              >
                {isSendingSms ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending Broadcaster...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to {smsRecipients.length} Recipient{smsRecipients.length === 1 ? "" : "s"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
