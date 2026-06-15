import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import {
  Search,
  Filter,
  MessageSquare,
  Smartphone,
  Send,
  Plus,
  Check,
  X,
  Sparkles,
  Video,
  RefreshCw,
  Users,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Info
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import type { Lead } from "../types";

export default function SmsBroadcasterView() {
  const { user } = useAuth();
  const userId = user?.uid || "ielts_crm_main_user";

  // Data states
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [courseFilter, setCourseFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");

  // Selection state
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  
  // SMS Composer state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [dispatchLogs, setDispatchLogs] = useState<{
    successCount: number;
    failedCount: number;
    results: string[];
  } | null>(null);

  // Zoom / Live Class Parameter states
  const [classTopic, setClassTopic] = useState(() => localStorage.getItem("zoom_class_topic") || "IELTS Speaking & Writing Band 8+ Masterclass");
  const [classDate, setClassDate] = useState(() => localStorage.getItem("zoom_class_date") || "Today (Monday)");
  const [classTime, setClassTime] = useState(() => localStorage.getItem("zoom_class_time") || "06:00 PM GMT");
  const [zoomUrl, setZoomUrl] = useState(() => localStorage.getItem("zoom_zoom_url") || "https://zoom.us/j/9518473022");
  const [zoomId, setZoomId] = useState(() => localStorage.getItem("zoom_zoom_id") || "951 847 3022");
  const [zoomPasscode, setZoomPasscode] = useState(() => localStorage.getItem("zoom_zoom_passcode") || "IELTS88");

  // Save dynamic template parameters to local storage whenever they change
  useEffect(() => {
    localStorage.setItem("zoom_class_topic", classTopic);
    localStorage.setItem("zoom_class_date", classDate);
    localStorage.setItem("zoom_class_time", classTime);
    localStorage.setItem("zoom_zoom_url", zoomUrl);
    localStorage.setItem("zoom_zoom_id", zoomId);
    localStorage.setItem("zoom_zoom_passcode", zoomPasscode);
  }, [classTopic, classDate, classTime, zoomUrl, zoomId, zoomPasscode]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch initial data
  useEffect(() => {
    setLoading(true);
    // Fetch Leads
    const fetchLeads = fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch((err) => console.error("Error fetching leads for broadcaster:", err));

    // Fetch Templates
    const fetchTemplates = fetch(`/api/templates?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.templates) {
          // Filter only SMS templates
          const smsTpls = data.templates.filter((tpl: any) => tpl.type === "SMS");
          setTemplates(smsTpls);
        }
      })
      .catch((err) => console.error("Error fetching templates for broadcaster:", err));

    Promise.all([fetchLeads, fetchTemplates]).finally(() => setLoading(false));
  }, [userId]);

  // Unique lists for filter inputs
  const distinctStatuses = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
  const distinctCourses = Array.from(new Set(leads.map((l) => l.targetCourse).filter(Boolean)));
  const distinctSources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean)));

  // Filtered leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      (lead.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.phone || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "All" || lead.status === statusFilter;
    const matchesCourse = courseFilter === "All" || lead.targetCourse === courseFilter;
    const matchesSource = sourceFilter === "All" || lead.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesCourse && matchesSource;
  });

  // Handle Select All Visible
  const handleSelectAllVisible = () => {
    const visibleIds = filteredLeads.map((l) => l.id);
    setSelectedLeadIds((prev) => {
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  };

  // Handle Deselect All Visible
  const handleDeselectAllVisible = () => {
    const visibleIds = filteredLeads.map((l) => l.id);
    setSelectedLeadIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
  };

  // Preset Filters and Selections e.g. "Select New Leads", "Select Enrolled"
  const handlePresetSelect = (presetType: "New" | "Enrolled" | "Contacted" | "All") => {
    if (presetType === "All") {
      setSelectedLeadIds(leads.map((l) => l.id));
      return;
    }
    const filteredPresetIds = leads
      .filter((l) => {
        const status = (l.status || "").toLowerCase();
        if (presetType === "New") return status === "new lead" || status === "new";
        if (presetType === "Enrolled") return status === "enrolled";
        if (presetType === "Contacted") return status === "contact" || status === "contacted";
        return false;
      })
      .map((l) => l.id);

    setSelectedLeadIds(filteredPresetIds);
  };

  // Individual checkbox toggle
  const handleToggleLeadSelection = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Template select handler
  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    if (!tplId) {
      setSmsMessage("");
      return;
    }
    const selected = templates.find((t) => t.id === tplId);
    if (selected) {
      setSmsMessage(selected.body);
    }
  };

  // Insert template placeholder
  const insertPlaceholder = (token: string) => {
    const txtarea = textareaRef.current;
    if (!txtarea) {
      setSmsMessage((prev) => prev + token);
      return;
    }
    const start = txtarea.selectionStart;
    const end = txtarea.selectionEnd;
    const text = txtarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const updated = before + token + after;
    setSmsMessage(updated);

    setTimeout(() => {
      txtarea.focus();
      txtarea.setSelectionRange(start + token.length, start + token.length);
    }, 10);
  };

  // Replace placeholders dynamically for previews or real sending
  const replacePlaceholders = (text: string, lead: Lead) => {
    if (!text) return "";
    return text
      .replace(/\{\{name\}\}/gi, lead.name || "Student")
      .replace(/\{\{phone\}\}/gi, lead.phone || "")
      .replace(/\{\{email\}\}/gi, lead.email || "")
      .replace(/\{\{targetcourse\}\}/gi, lead.targetCourse || "IELTS Coaching")
      .replace(/\{\{targetband\}\}/gi, lead.targetBand || "7.5")
      .replace(/\{\{destination\}\}/gi, lead.destination || "Canada")
      .replace(/\{\{classtopic\}\}/gi, classTopic)
      .replace(/\{\{classdate\}\}/gi, classDate)
      .replace(/\{\{classtime\}\}/gi, classTime)
      .replace(/\{\{zoomid\}\}/gi, zoomId)
      .replace(/\{\{zoompasscode\}\}/gi, zoomPasscode)
      .replace(/\{\{zoomurl\}\}/gi, zoomUrl);
  };

  // Mass Send Trigger
  const handleExecuteBroadcast = async () => {
    const targetLeads = leads.filter((l) => selectedLeadIds.includes(l.id));
    if (targetLeads.length === 0) {
      alert("Please select at least one target student lead first.");
      return;
    }
    if (!smsMessage.trim()) {
      alert("Please compose some notification SMS text before broadcasting.");
      return;
    }

    const confirmSend = window.confirm(
      `Are you sure you want to trigger this SMS dispatch directly to ${targetLeads.length} selected students?`
    );
    if (!confirmSend) return;

    setIsSending(true);
    setDispatchLogs(null);

    let succ = 0;
    let fail = 0;
    const runLogs: string[] = [];

    for (const lead of targetLeads) {
      const personalizedMessage = replacePlaceholders(smsMessage, lead);
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
          runLogs.push(`✓ Connected with ${lead.name} (${lead.phone}) - Sent successfully.`);

          // Log transaction timeline details on the student lead
          await fetch(`/api/leads/${lead.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notes: `${lead.notes || ""}\n\n[Dedicated Broadcast Match on ${format(new Date(), "PP p")}]: "${personalizedMessage}"`.trim(),
            }),
          }).catch((err) => console.warn(`Timeline update failed for ${lead.name}`, err));
        } else {
          fail++;
          runLogs.push(`✗ Failed for ${lead.name} (${lead.phone}) - ${resData.error || "Provider reject state."}`);
        }
      } catch (err: any) {
        fail++;
        runLogs.push(`✗ Connectivity error for ${lead.name} (${lead.phone}) - ${err.message || "Network Error."}`);
      }
    }

    setDispatchLogs({
      successCount: succ,
      failedCount: fail,
      results: runLogs,
    });
    setIsSending(false);

    // Refresh Leads
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch((err) => console.error("Error updating leads sync list:", err));
  };

  // Get active preview lead
  const previewLead = leads.find((l) => selectedLeadIds.includes(l.id)) || filteredLeads[0] || null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-950 font-display flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            Dedicated SMS Broadcaster
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Build targeting parameters, choose saved SMS templates, insert markers, and trigger direct notification dispatches.
          </p>
        </div>

        {/* Short info card on active API configurations */}
        <div className="bg-emerald-50 border border-emerald-100/80 px-4 py-2 rounded-xl flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 text-emerald-600" />
          <div className="text-[11px]">
            <span className="font-bold text-emerald-900 block leading-tight">SMS Gateway Mode:</span>
            <span className="text-emerald-700 font-medium font-sans">Active (BulkSMSBD API integration checked)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Target Selector */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-2xs p-5 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-500" />
              Step 1: Select Target Recipients
            </h2>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
              {selectedLeadIds.length} select{selectedLeadIds.length === 1 ? "ed" : "s"}
            </span>
          </div>

          {/* Quick Selection Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fast Presets Selections:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handlePresetSelect("All")}
                className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Select All CRM ({leads.length})
              </button>
              <button
                onClick={() => handlePresetSelect("New")}
                className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Select New Leads
              </button>
              <button
                onClick={() => handlePresetSelect("Contacted")}
                className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-amber-50 hover:text-amber-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Select Contacted
              </button>
              <button
                onClick={() => handlePresetSelect("Enrolled")}
                className="text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Select Enrolled Students
              </button>
              <button
                onClick={() => setSelectedLeadIds([])}
                className="text-[11px] font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 bg-white transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>

          {/* Search Table & Filter Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-2 cursor-pointer focus:outline-none focus:border-indigo-500 bg-slate-50/50"
            >
              <option value="All">All Statuses</option>
              {distinctStatuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>

            {/* Course Filter */}
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-2 cursor-pointer focus:outline-none focus:border-indigo-500 bg-slate-50/50"
            >
              <option value="All">All Courses</option>
              {distinctCourses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2.5 py-2 cursor-pointer focus:outline-none focus:border-indigo-500 bg-slate-50/50"
            >
              <option value="All">All Sources</option>
              {distinctSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Multi-toggle Shortcuts */}
          <div className="flex gap-2 justify-end text-[11px] font-semibold text-indigo-600">
            <button
              onClick={handleSelectAllVisible}
              className="hover:underline cursor-pointer flex items-center gap-1"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Select {filteredLeads.length} Visible
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleDeselectAllVisible}
              className="hover:underline cursor-pointer flex items-center gap-1"
            >
              <Square className="w-3.5 h-3.5" /> Deselect {filteredLeads.length} Visible
            </button>
          </div>

          {/* Table Container list */}
          <div className="border border-slate-100 rounded-xl overflow-hidden overflow-y-auto max-h-[460px] bg-slate-50/20 shadow-2xs">
            {loading ? (
              <div className="py-20 text-center text-xs text-slate-400 font-medium">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading Student Directory...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400 italic">
                No matching student lead records found in CRM. Modify filters above.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold select-none sticky top-0">
                    <th className="p-3 w-10 text-center">Select</th>
                    <th className="p-3">Candidate name</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Course Intent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredLeads.map((lead) => {
                    const isSelected = selectedLeadIds.includes(lead.id);
                    return (
                      <tr
                        key={lead.id}
                        className={`hover:bg-indigo-50/20 transition-all cursor-pointer ${
                          isSelected ? "bg-indigo-50/25" : ""
                        }`}
                        onClick={() => handleToggleLeadSelection(lead.id)}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleToggleLeadSelection(lead.id)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors inline-block"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 font-bold" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">{lead.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{lead.email || "No Email"}</div>
                        </td>
                        <td className="p-3 font-mono text-slate-650 font-medium">{lead.phone}</td>
                        <td className="p-3">
                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                            {lead.status}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-600">{lead.targetCourse || "Unspecified"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Content Composer & Previews */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {/* Section 2: Composer Content */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              Step 2: Load Template & Write SMS
            </h2>

            {/* Template select picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1 justify-between">
                <span>Saved SMS Template selector</span>
                <span className="text-[10px] text-indigo-500 font-semibold lowercase">SMS category presets</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
              >
                <option value="">-- No pre-built template. Write scratch content --</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} [Subject: {tpl.subject || "No Subject"}]
                  </option>
                ))}
              </select>
            </div>

            {/* Configurable Zoom meeting details editor if template has zoom parameters */}
            {(smsMessage.includes("{{classtopic}}") ||
              smsMessage.includes("{{classdate}}") ||
              smsMessage.includes("{{classtime}}") ||
              smsMessage.includes("{{zoomurl}}") ||
              smsMessage.includes("{{zoomid}}") ||
              smsMessage.includes("{{zoompasscode}}")) && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-1.5 text-indigo-950 w-full">
                  <div className="flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-indigo-600" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Configure Zoom Class Parameters</span>
                  </div>
                  <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 uppercase tracking-widest text-[8px] scale-95 origin-right">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    Saved Automatically
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Class Topic</label>
                    <input
                      type="text"
                      value={classTopic}
                      onChange={(e) => setClassTopic(e.target.value)}
                      placeholder="e.g. Speaking Band 8+ Masterclass"
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Class Date</label>
                    <input
                      type="text"
                      value={classDate}
                      onChange={(e) => setClassDate(e.target.value)}
                      placeholder="e.g. Today (Monday)"
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Class Time</label>
                    <input
                      type="text"
                      value={classTime}
                      onChange={(e) => setClassTime(e.target.value)}
                      placeholder="e.g. 06:00 PM GMT"
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Zoom URL</label>
                    <input
                      type="text"
                      value={zoomUrl}
                      onChange={(e) => setZoomUrl(e.target.value)}
                      placeholder="https://zoom.us/j/..."
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Meeting ID</label>
                    <input
                      type="text"
                      value={zoomId}
                      onChange={(e) => setZoomId(e.target.value)}
                      placeholder="951 847 3022"
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-indigo-850 uppercase tracking-wider block">Passcode</label>
                    <input
                      type="text"
                      value={zoomPasscode}
                      onChange={(e) => setZoomPasscode(e.target.value)}
                      placeholder="IELTS88"
                      className="w-full text-xs bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-850 font-medium"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Textarea text message */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-slate-600 uppercase tracking-wide">
                  SMS Message Body Context
                </label>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    smsMessage.length > 160
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {smsMessage.length} chars ({Math.ceil(smsMessage.length / 160)} Part(s))
                </span>
              </div>
              <textarea
                ref={textareaRef}
                rows={5}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                placeholder="Compose notification alert, payment reminders, Zoom Class passwords, credentials here..."
                className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500/80 outline-none leading-relaxed font-sans placeholder-slate-400 bg-white"
              />
            </div>

            {/* Click to insert Dynamic Placeholder attributes keys */}
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  Personalized Student Attributes:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { token: "{{name}}", label: "Student Name" },
                    { token: "{{phone}}", label: "Student Phone" },
                    { token: "{{email}}", label: "Email" },
                    { token: "{{targetcourse}}", label: "IELTS Course" },
                    { token: "{{targetband}}", label: "Band" },
                    { token: "{{destination}}", label: "Destination" },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.token}
                      onClick={() => insertPlaceholder(item.token)}
                      className="text-[10px] font-bold bg-slate-50 text-slate-600 hover:text-indigo-650 hover:bg-indigo-50 hover:border-indigo-200 border border-slate-200 px-2 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider flex items-center gap-1">
                  <Video className="w-3.5 h-3.5 text-indigo-500" />
                  Interactive Zoom Meeting Parameters:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { token: "{{classtopic}}", label: "Class Topic" },
                    { token: "{{classdate}}", label: "Class Date" },
                    { token: "{{classtime}}", label: "Class Time" },
                    { token: "{{zoomurl}}", label: "Zoom Link" },
                    { token: "{{zoomid}}", label: "Meeting ID" },
                    { token: "{{zoompasscode}}", label: "Passcode" },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.token}
                      onClick={() => insertPlaceholder(item.token)}
                      className="text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100/70 border border-indigo-100 hover:border-indigo-200 px-2 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5 text-indigo-500" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Personalization Preview card based on selected leads */}
            {previewLead && smsMessage.trim().length > 0 && (
              <div className="bg-indigo-50/40 border border-indigo-100/50 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] font-extrabold uppercase text-indigo-700 tracking-widest flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-500 animate-pulse" />
                  Live Dynamic Personalization Preview ({previewLead.name})
                </span>
                <p className="text-xs text-slate-700 bg-white border border-slate-100 rounded-lg p-3 leading-relaxed whitespace-pre-wrap select-none font-sans">
                  {replacePlaceholders(smsMessage, previewLead)}
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Dispatch Mass Messenger action */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
              <Send className="w-4 h-4 text-emerald-500" />
              Step 3: Trigger & Bulk Run
            </h2>

            <div className="space-y-3.5">
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs text-slate-505 space-y-1">
                <span className="font-bold text-slate-700 block">Mass Messenger Parameters summary:</span>
                <div className="space-y-1 mt-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>Recipients Targets count:</span>
                    <strong className="text-slate-800">{selectedLeadIds.length} leads</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Template configured:</span>
                    <strong className="text-slate-800">
                      {selectedTemplateId ? "Yes (Active)" : "No (Raw Text Composition)"}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExecuteBroadcast}
                disabled={isSending || selectedLeadIds.length === 0 || !smsMessage.trim()}
                className={`w-full py-3.5 rounded-xl text-center text-xs font-bold font-display shadow-sm flex items-center justify-center gap-1.5 transition-all text-white ${
                  isSending || selectedLeadIds.length === 0 || !smsMessage.trim()
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-[#23085a] hover:bg-[#34117f] hover:translate-y-[-1px] active:translate-y-[0.5px] cursor-pointer"
                }`}
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    Broadcasting SMS Campaign...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    Activate SMS Broadcaster for {selectedLeadIds.length} Student{selectedLeadIds.length === 1 ? "" : "s"}
                  </>
                )}
              </button>
            </div>

            {/* Run results console log */}
            {dispatchLogs && (
              <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 shadow-md border border-slate-800 animate-in fade-in duration-200">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 font-mono">
                    Real-time Telemetry logs
                  </span>
                  <span className="text-[10px] font-bold font-mono text-slate-400 bg-white/5 py-0.5 px-2 rounded">
                    Success: {dispatchLogs.successCount} | Failed: {dispatchLogs.failedCount}
                  </span>
                </div>
                <div className="text-[10px] font-mono h-32 overflow-y-auto space-y-1 text-slate-300 divide-y divide-white/5 pr-1.5 scrollbar-thin scrollbar-thumb-white/10">
                  {dispatchLogs.results.map((log, idx) => (
                    <div
                      key={idx}
                      className={`py-1 ${
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

        </div>

      </div>
    </div>
  );
}
