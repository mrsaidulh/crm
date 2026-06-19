import React, { useEffect, useState, useMemo } from 'react';
import { format, subDays, isSameDay } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { Users, UserPlus, CheckCircle, TrendingUp, Phone, Mail, FileText, Smartphone, Calendar, Square, CheckSquare, ClipboardList, Clock, ArrowRight, Sparkles, Tag, Activity, Search, Filter, MessageSquare, Plus, Send, UserCheck, Inbox, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import type { Lead, Stats, Task, AuditLog, LeadStatus, Campaign } from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import { calculateLeadScore } from '../utils/scoring';
import { Server, WifiOff, AlertTriangle, RefreshCw, Key, HelpCircle, AlertCircle, X, Sliders } from 'lucide-react';

function formatDuration(ms: number): string {
  if (ms <= 0 || isNaN(ms)) return '0m';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function getRelativeTime(timestamp: number | string | Date): string {
  if (!timestamp) return 'Unknown';
  const timeMs = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(timeMs)) return 'Unknown';
  const diffMs = Date.now() - timeMs;
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(new Date(timeMs), 'MMM d, h:mm a');
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [failedSmsThreshold, setFailedSmsThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('crm_failed_sms_thresh');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [showFailedSmsAlert, setShowFailedSmsAlert] = useState<boolean>(true);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; config?: any; error?: string } | null>(null);
  const [checkingDb, setCheckingDb] = useState(false);

  // Activity Feed States
  const [activitySearch, setActivitySearch] = useState('');
  const [activityCategory, setActivityCategory] = useState<'all' | 'lead' | 'task' | 'campaign' | 'system'>('all');
  const [broadcastText, setBroadcastText] = useState('');
  const [isPostingBroadcast, setIsPostingBroadcast] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState('');

  // Due Soon Follow-up States
  const [sendingFollowUpId, setSendingFollowUpId] = useState<string | null>(null);
  const [followUpSuccess, setFollowUpSuccess] = useState<Record<string, string>>({});

  // Date Range Picker States
  const [dateRangeOption, setDateRangeOption] = useState<string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  const checkDbStatus = () => {
    setCheckingDb(true);
    fetch('/api/db-status')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        return res.json();
      })
      .then(data => {
        setDbStatus({
          connected: data.connected,
          config: data.config,
          error: data.config?.error || null
        });
      })
      .catch(err => {
        console.error('Failed to fetch db status:', err);
        setDbStatus({ connected: false, error: err.message || String(err) });
      })
      .finally(() => {
        setCheckingDb(false);
      });
  };

  const handlePostBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setIsPostingBroadcast(true);
    setBroadcastSuccess('');

    try {
      await logAuditEvent({
        action: 'Team Announcement',
        entityType: 'system',
        details: `${user?.displayName || 'Team Member'} (${user?.role || 'Staff'}): "${broadcastText.trim()}"`
      });
      setBroadcastText('');
      setBroadcastSuccess('Announcement successfully broadcasted!');
      loadDashboardData();
      setTimeout(() => setBroadcastSuccess(''), 3000);
    } catch (e) {
      console.error('[Dashboard] Error posting broadcast announcement:', e);
    } finally {
      setIsPostingBroadcast(false);
    }
  };

  const loadDashboardData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/leads?userId=${encodeURIComponent(userId)}`),
      fetch(`/api/tasks?userId=${encodeURIComponent(userId)}`),
      fetch(`/api/audit-logs?userId=${encodeURIComponent(userId)}`),
      fetch(`/api/campaigns?userId=${encodeURIComponent(userId)}`)
    ])
      .then(async ([leadsRes, tasksRes, logsRes, campaignsRes]) => {
        if (!leadsRes.ok) {
          const body = await leadsRes.text();
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) {}
          throw new Error(parsed?.error || parsed?.message || body || `Leads API error ${leadsRes.status}`);
        }
        if (!tasksRes.ok) {
          const body = await tasksRes.text();
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) {}
          throw new Error(parsed?.error || parsed?.message || body || `Tasks API error ${tasksRes.status}`);
        }
        if (!logsRes.ok) {
          const body = await logsRes.text();
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) {}
          throw new Error(parsed?.error || parsed?.message || body || `Audit Logs API error ${logsRes.status}`);
        }
        if (!campaignsRes.ok) {
          const body = await campaignsRes.text();
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) {}
          throw new Error(parsed?.error || parsed?.message || body || `Campaigns API error ${campaignsRes.status}`);
        }
        return Promise.all([leadsRes.json(), tasksRes.json(), logsRes.json(), campaignsRes.json()]);
      })
      .then(([leadsData, tasksData, logsData, campaignsData]) => {
        if (leadsData && leadsData.leads) {
          setLeads(leadsData.leads);
        }
        if (tasksData && tasksData.tasks) {
          setTasks(tasksData.tasks);
        }
        if (logsData && logsData.logs) {
          setAuditLogs(logsData.logs);
        } else if (logsData && Array.isArray(logsData)) {
          setAuditLogs(logsData);
        }
        if (campaignsData && campaignsData.campaigns) {
          setCampaigns(campaignsData.campaigns);
        }
      })
      .catch(err => {
        console.error(err);
        setError(err.message || String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDashboardData();
    checkDbStatus();
  }, [userId]);

  // Filter leads dynamically based on selected date range option
  const filteredLeads = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (dateRangeOption === '7days') {
      start = subDays(now, 7);
      start.setHours(0, 0, 0, 0);
    } else if (dateRangeOption === '30days') {
      start = subDays(now, 30);
      start.setHours(0, 0, 0, 0);
    } else if (dateRangeOption === '90days') {
      start = subDays(now, 90);
      start.setHours(0, 0, 0, 0);
    } else if (dateRangeOption === 'custom') {
      if (customStartDate) {
        start = new Date(customStartDate);
        start.setHours(0, 0, 0, 0);
      }
      if (customEndDate) {
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    return leads.filter(lead => {
      if (!lead.createdAt) return false;
      const leadDate = new Date(lead.createdAt);
      if (start && leadDate < start) return false;
      if (end && leadDate > end) return false;
      return true;
    });
  }, [leads, dateRangeOption, customStartDate, customEndDate]);

  // Compute Funnel Stage Velocity from audit logs
  const velocityData = useMemo(() => {
    // Group transition logs by entityId
    const transitionLogs = auditLogs.filter(
      log => log.action === 'Lead Status Transition' && log.entityId
    );
    
    const logsByLead: Record<string, AuditLog[]> = {};
    transitionLogs.forEach(log => {
      const eId = log.entityId!;
      if (!logsByLead[eId]) logsByLead[eId] = [];
      logsByLead[eId].push(log);
    });

    // Track stay duration per status
    const stateDurations: Record<string, number[]> = {
      'New Lead': [],
      'Contact': [],
      'Consultation Booked': [],
      'Demo Class Booked': [],
      'Payment Pending': [],
      'Re-engagement Offer': []
    };

    leads.forEach(lead => {
      const leadLogs = logsByLead[lead.id];
      if (!leadLogs || leadLogs.length === 0) return;

      // Sort chronologically
      const sorted = [...leadLogs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Identify initial status
      let initialStatus = 'New Lead';
      const firstMatch = sorted[0].details.match(/transitioned from "([^"]+)" to "([^"]+)"/);
      if (firstMatch) {
        initialStatus = firstMatch[1];
      }

      let lastTime = new Date(lead.createdAt).getTime();

      sorted.forEach(log => {
        const match = log.details.match(/transitioned from "([^"]+)" to "([^"]+)"/);
        if (match) {
          const fromStatus = match[1];
          const logTime = new Date(log.createdAt).getTime();
          const diff = logTime - lastTime;
          if (diff > 0) {
            if (stateDurations[fromStatus] !== undefined) {
              stateDurations[fromStatus].push(diff);
            }
          }
          lastTime = logTime;
        }
      });
    });

    // Default industry reference values in MS (used as fallback or for comparison)
    const benchmarkMs: Record<string, number> = {
      'New Lead': 2 * 60 * 60 * 1000,                  // 2 hours
      'Contact': 1.5 * 24 * 60 * 60 * 1000,       // 1.5 days
      'Consultation Booked': 3.0 * 24 * 60 * 60 * 1000, // 3 days
      'Demo Class Booked': 2.0 * 24 * 60 * 60 * 1000,       // 2 days
      'Payment Pending': 4.0 * 24 * 60 * 60 * 1000,    // 4 days
      'Re-engagement Offer': 5.0 * 24 * 60 * 60 * 1000   // 5 days
    };

    // Calculate final metrics
    const order = ['New Lead', 'Contact', 'Consultation Booked', 'Demo Class Booked', 'Payment Pending', 'Re-engagement Offer'];
    
    let hasRealData = false;
    const items = order.map(status => {
      const durations = stateDurations[status] || [];
      const count = durations.length;
      let avgMs = 0;
      if (count > 0) {
        avgMs = durations.reduce((sum, d) => sum + d, 0) / count;
        hasRealData = true;
      }

      return {
        status,
        avgMs: avgMs || benchmarkMs[status] || 0,
        isBenchmark: count === 0,
        count
      };
    });

    return {
      items,
      hasRealData
    };
  }, [leads, auditLogs]);

  // Sorted and Filtered Audit Logs for Activity Feed
  const sortedAndFilteredLogs = useMemo(() => {
    let list = [...auditLogs];

    list.sort((a, b) => {
      const timeA = typeof a.createdAt === 'number' ? a.createdAt : Number(a.createdAt) || 0;
      const timeB = typeof b.createdAt === 'number' ? b.createdAt : Number(b.createdAt) || 0;
      return timeB - timeA;
    });

    if (activityCategory !== 'all') {
      list = list.filter(log => log.entityType === activityCategory);
    }

    if (activitySearch.trim()) {
      const query = activitySearch.toLowerCase();
      list = list.filter(log => 
        (log.action && log.action.toLowerCase().includes(query)) ||
        (log.details && log.details.toLowerCase().includes(query)) ||
        (log.entityType && log.entityType.toLowerCase().includes(query)) ||
        (log.entityId && log.entityId.toLowerCase().includes(query))
      );
    }

    return list;
  }, [auditLogs, activityCategory, activitySearch]);

  // Compute analytics dynamically from active filtered leads
  const stats = useMemo(() => {
    if (!filteredLeads) {
      return {
        totalLeads: 0,
        newLeads: 0,
        enrolled: 0,
        conversionRate: 0,
        bySource: {} as Record<string, number>,
        estimatedPipelineValue: 0,
        conversionValue: 0
      };
    }

    const totalLeads = filteredLeads.length;
    const newLeads = filteredLeads.filter((l: Lead) => (l.status as string) === 'New Lead' || (l.status as string) === 'New').length;
    const enrolled = filteredLeads.filter((l: Lead) => l.status === 'Enrolled').length;

    let estimatedPipelineValue = 0;
    let conversionValue = 0;
    filteredLeads.forEach((l: Lead) => {
      if (l.status !== 'Discarded' && l.expectedValue) {
        estimatedPipelineValue += Number(l.expectedValue);
      }
      if (l.status === 'Enrolled' && l.expectedValue) {
        conversionValue += Number(l.expectedValue);
      }
    });

    const bySource = filteredLeads.reduce((acc: any, lead: Lead) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalLeads,
      newLeads,
      enrolled,
      conversionRate: totalLeads > 0 ? parseFloat(((enrolled / totalLeads) * 100).toFixed(1)) : 0,
      bySource,
      estimatedPipelineValue,
      conversionValue
    };
  }, [filteredLeads]);

  const stageDistributionData = useMemo(() => {
    const statuses: LeadStatus[] = [
      'New Lead',
      'Contact',
      'Follow-up Required',
      'Consultation Booked',
      'Counseling Done',
      'Demo Class Booked',
      'Payment Pending',
      'Re-engagement Offer',
      'Enrolled',
      'Discarded'
    ];

    return statuses.map(status => {
      const count = filteredLeads.filter(lead => lead.status === status).length;
      return {
        stage: status,
        count
      };
    });
  }, [filteredLeads]);

  const tagDistributionData = useMemo(() => {
    const tagCounts: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      if (lead.tags && Array.isArray(lead.tags)) {
        lead.tags.forEach(tag => {
          if (tag && tag.trim()) {
            const normalized = tag.trim();
            tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
          }
        });
      }
    });

    const entries = Object.entries(tagCounts).map(([name, count]) => ({
      tag: name,
      count
    }));

    // Sort descending by count, then alphabetically
    entries.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    // Limit to top 10 tags to prevent design clutter
    return entries.slice(0, 10);
  }, [filteredLeads]);

  const tasksDueToday = useMemo(() => {
    return tasks.filter(task => isSameDay(new Date(task.dueDate), new Date()));
  }, [tasks]);

  const todayTasksStats = useMemo(() => {
    const total = tasksDueToday.length;
    const completed = tasksDueToday.filter(t => t.status === 'Completed').length;
    const pending = tasksDueToday.filter(t => t.status === 'Pending').length;
    return { total, completed, pending };
  }, [tasksDueToday]);

  const failedSmsInLast24Hours = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return campaigns.filter(camp => 
      camp.type === 'SMS' && 
      camp.status === 'Failed' && 
      camp.sentAt >= oneDayAgo
    );
  }, [campaigns]);

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'Pending' ? 'Completed' : 'Pending';
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
        logAuditEvent({
          action: newStatus === 'Completed' ? 'Task Completed' : 'Task Reopened',
          entityType: 'task',
          entityId: task.id,
          details: `Task "${task.title}" associated with lead "${task.leadName || 'Unknown'}" was updated via Daily Digest on Dashboard.`
        });
      }
    } catch (e) {
      console.error('Failed to toggle task status:', e);
    }
  };

  const dueSoonHighPriorityTasks = useMemo(() => {
    const pendingTasks = tasks.filter(t => t.status === 'Pending');
    
    const mapped = pendingTasks.map(task => {
      const lead = leads.find(l => l.id === task.leadId);
      const leadScoreD = lead ? calculateLeadScore(lead) : null;
      const isHighPriority = !!(lead && (
        leadScoreD?.level === 'Hot' ||
        lead.tags?.some(tag => ['high-priority', 'hot', 'priority', 'premium'].includes(tag.toLowerCase())) ||
        lead.status === 'Follow-up Required'
      ));
      return { task, lead, isHighPriority, scoreDetails: leadScoreD };
    }).filter(item => item.isHighPriority);

    // Sort by task dueDate ascending (nearest due dates first)
    mapped.sort((a, b) => a.task.dueDate - b.task.dueDate);

    return mapped;
  }, [tasks, leads]);

  const handleSendFollowUp = async (task: Task, lead: Lead) => {
    if (!lead) return;
    setSendingFollowUpId(task.id);
    
    const messageText = `Hi ${lead.name}, this is IELTS Revolution CRM team. We have scheduled a follow-up check-in regarding '${task.title}'. How can we assist you today?`;
    
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: lead.phone,
          message: messageText,
          userId,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        await fetch(`/api/leads/${lead.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: `${lead.notes || ""}\n\n[One-click Follow-up SMS sent on ${format(new Date(), "PP p")}]: "${messageText}"`.trim(),
          }),
        }).catch(err => console.warn(`Lead notes link sync error for ${lead.name}`, err));

        await logAuditEvent({
          action: 'Sent Message',
          entityType: 'campaign',
          entityId: lead.id,
          details: `One-click follow-up dispatch for high-priority candidate "${lead.name}" (${lead.phone}) regarding Task: "${task.title}".`
        });

        setFollowUpSuccess(prev => ({ ...prev, [task.id]: 'Success! SMS Follow-up Sent.' }));
        setTimeout(() => {
          setFollowUpSuccess(prev => {
            const copy = { ...prev };
            delete copy[task.id];
            return copy;
          });
        }, 5000);

        loadDashboardData();
      } else {
        alert(resData.error || "SMS provider rejected follow-up dispatch instruction.");
      }
    } catch (err: any) {
      console.error('[Dashboard] One-click follow-up error:', err);
      alert(err.message || "Failed to establish follow-up communication request.");
    } finally {
      setSendingFollowUpId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <div className="text-slate-500 font-medium">Fetching leads and syncing configuration statistics...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex flex-col md:flex-row gap-5 items-start">
          <div className="bg-rose-100 p-3 rounded-full text-rose-600">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2 flex-grow">
            <h1 className="text-xl font-semibold text-rose-950">CRM System Sync Failure</h1>
            <p className="text-slate-700 text-sm">
              The dashboard leads loader could not reach the server API. This usually happens if the server backend is restarting or there is a database failure.
            </p>
            {error && (
              <div className="bg-white border border-rose-100 rounded-lg p-3 text-xs font-mono text-rose-700 max-h-40 overflow-auto whitespace-pre-wrap">
                {error}
              </div>
            )}
            <button 
              onClick={loadDashboardData} 
              className="mt-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs px-4 py-2 rounded-lg inline-flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try Connecting Again
            </button>
          </div>
        </div>

        {/* Realtime Connection Diagnostics Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="w-5 h-5 text-slate-700" />
              <h2 className="text-md font-semibold text-slate-900">cPanel MySQL Bridge Diagnostics</h2>
            </div>
            <button 
              onClick={checkDbStatus}
              disabled={checkingDb}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingDb ? 'animate-spin' : ''}`} /> Test Live DB Handshake
            </button>
          </div>

          {dbStatus ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Connection Settings (Loaded)</div>
                  <div className="space-y-1 text-slate-700 font-mono text-xs">
                    <div><span className="text-slate-400 font-sans">MySQL Host:</span> {dbStatus.config?.host || 'Unknown'}</div>
                    <div><span className="text-slate-400 font-sans">MySQL Port:</span> {dbStatus.config?.port || '3306'}</div>
                    <div><span className="text-slate-400 font-sans">MySQL User:</span> {dbStatus.config?.user || 'Unknown'}</div>
                    <div><span className="text-slate-400 font-sans">Database Name:</span> {dbStatus.config?.database || 'Unknown'}</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="text-slate-500 text-xs font-medium uppercase tracking-wider">Handshake Handled Mode</div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full inline-block ${dbStatus.connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      <span className="font-semibold text-slate-900 text-sm">
                        {dbStatus.connected ? 'MySQL Active Database Connection' : 'In-Memory Fallback Mode'}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                      {dbStatus.connected 
                        ? 'Your Node.js app is perfectly connected to your MySQL instance in cPanel! All actions update real persistent tables.' 
                        : 'Your MySQL database is unreachable or rejected connections. The Node.js server starts in localized In-Memory mode to prevent system crash.'}
                    </p>
                  </div>
                </div>
              </div>

              {dbStatus.error && (
                <div className="bg-slate-950 text-amber-200 border border-amber-500/30 rounded-xl p-4 mt-2 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-xs text-yellow-500 uppercase">
                    <AlertTriangle className="w-4 h-4" /> MySQL Probe Rejection Log:
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">{dbStatus.error}</pre>
                  
                  <div className="text-xs text-slate-400 leading-normal border-t border-slate-800/60 pt-2.5 mt-2 space-y-1.5 font-sans">
                    <p className="font-medium text-slate-300">💡 Common cPanel MySQL Solutions:</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li><strong>Username Prefix:</strong> In cPanel, usernames and databases are prefixed. E.g., instead of <code className="text-slate-200 bg-slate-800/80 px-1 rounded">crmuser</code>, use <code className="text-slate-200 bg-slate-800/80 px-1 rounded">mockhub_crmuser</code>.</li>
                      <li><strong>Remote MySQL / Access Hosts:</strong> If testing outside cPanel, authorize your external IP in the <code className="text-indigo-400">Remote MySQL</code> icon inside cPanel.</li>
                      <li><strong>Database Privileges:</strong> Verify you bound the User to the Database inside <code className="text-indigo-400">MySQL Databases</code> in cPanel with all permissions.</li>
                      <li><strong>Password Capitalization:</strong> Verify the password is exact (including casing: E.g., <code className="text-slate-200 bg-slate-800/80 px-1 rounded">Crmuser1$%</code> vs <code className="text-slate-200 bg-slate-800/80 px-1 rounded">crmuser1$%</code>).</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500 text-xs p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Handshake diagnostics not yet run. Click the probe button above to start diagnostics.
            </div>
          )}
        </div>
      </div>
    );
  }

  const sourceData = Object.keys(stats.bySource).map(key => ({
    name: key.replace(' Ads', ''),
    value: stats.bySource[key]
  }));

  // Calculate dynamic trend data adapted to selected range
  const trendData = (() => {
    let daysToRender = 7;
    const today = new Date();
    let startDate = subDays(today, 6);

    if (dateRangeOption === '30days') {
      daysToRender = 30;
      startDate = subDays(today, 29);
    } else if (dateRangeOption === '90days') {
      daysToRender = 90;
      startDate = subDays(today, 89);
    } else if (dateRangeOption === 'custom' && customStartDate && customEndDate) {
      const s = new Date(customStartDate);
      const e = new Date(customEndDate);
      const diffTime = Math.abs(e.getTime() - s.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      // Cap at 120 days to ensure performance stays premium
      daysToRender = Math.min(diffDays, 120);
      startDate = s;
    } else if (dateRangeOption === 'all') {
      if (leads.length > 0) {
        const oldestLead = [...leads].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
        const oldestDate = oldestLead.createdAt ? new Date(oldestLead.createdAt) : subDays(today, 29);
        const diffTime = Math.abs(today.getTime() - oldestDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        daysToRender = Math.min(diffDays, 120);
        startDate = oldestDate;
      } else {
        daysToRender = 30;
        startDate = subDays(today, 29);
      }
    }

    return Array.from({ length: daysToRender }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dayLabel = format(d, daysToRender > 31 ? 'd/M' : 'EEE d/M');

      const count = leads.filter(lead => {
        if (!lead.createdAt) return false;
        const leadDate = new Date(lead.createdAt);
        return isSameDay(leadDate, d);
      }).length;

      return {
        name: dayLabel,
        leads: count
      };
    });
  })();

  const handleRetryCampaign = async (campId: string) => {
    setRetryId(campId);
    setRetryMsg(null);
    try {
      const res = await fetch('/api/campaigns/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campId, userId })
      });
      const data = await res.json();
      if (res.ok) {
        setCampaigns(prev => prev.map(c => c.id === campId ? { ...c, status: 'Sent' } : c));
        setRetryMsg('SMS has been resent successfully!');
        logAuditEvent({
          action: 'Campaign Resent from Dashboard Alert',
          entityType: 'campaign',
          entityId: campId,
          details: `Dashboard quick retry executed for failed SMS broadcast ID: ${campId}`
        });
        setTimeout(() => setRetryMsg(null), 4000);
      } else {
        alert(data.error || 'Failed to retry dispatching campaign.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error trying to retry campaign.');
    } finally {
      setRetryId(null);
    }
  };

  const stageColorMap: Record<string, { hex: string, bgClass: string, textClass: string }> = {
    'New Lead': { hex: '#6366f1', bgClass: 'bg-indigo-500', textClass: 'text-indigo-600' },
    'Contact': { hex: '#3b82f6', bgClass: 'bg-blue-500', textClass: 'text-blue-600' },
    'Follow-up Required': { hex: '#f59e0b', bgClass: 'bg-amber-500', textClass: 'text-amber-600' },
    'Consultation Booked': { hex: '#8b5cf6', bgClass: 'bg-purple-500', textClass: 'text-purple-600' },
    'Counseling Done': { hex: '#06b6d4', bgClass: 'bg-cyan-500', textClass: 'text-cyan-600' },
    'Demo Class Booked': { hex: '#ec4899', bgClass: 'bg-pink-500', textClass: 'text-pink-600' },
    'Payment Pending': { hex: '#f43f5e', bgClass: 'bg-rose-500', textClass: 'text-rose-600' },
    'Re-engagement Offer': { hex: '#7c3aed', bgClass: 'bg-violet-600', textClass: 'text-violet-600' },
    'Enrolled': { hex: '#10b981', bgClass: 'bg-emerald-500', textClass: 'text-emerald-600' },
    'Discarded': { hex: '#94a3b8', bgClass: 'bg-slate-400', textClass: 'text-slate-500' }
  };

  const COLORS = ['#11347a', '#10b981', '#f59e0b', '#e31837', '#8b5cf6', '#0ea5e9', '#64748b'];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of your IELTS Revolution CRM</p>
        </div>

        {/* Date Range Picker Component */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-400 mr-2" />
            <select
              value={dateRangeOption}
              onChange={(e) => setDateRangeOption(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer p-0 border-none"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateRangeOption === 'custom' && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs text-xs font-semibold text-slate-600 animate-in slide-in-from-right-2 duration-200">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="focus:outline-none bg-transparent hover:text-indigo-600 cursor-pointer text-[11px]"
              />
              <span className="text-slate-300 mx-1">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="focus:outline-none bg-transparent hover:text-indigo-600 cursor-pointer text-[11px]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Failed SMS Threshold Alert Banner */}
      {showFailedSmsAlert && failedSmsInLast24Hours.length >= failedSmsThreshold && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-200/80 rounded-2xl p-5 shadow-sm space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="bg-rose-100 text-rose-600 p-2.5 rounded-xl shrink-0 h-11 w-11 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950 font-display flex items-center gap-2">
                  System Delivery Alert: Failed SMS Threshold Exceeded
                  <span className="px-2 py-0.5 bg-rose-600 text-white rounded-full font-sans font-black text-[10px] tracking-wide animate-pulse">
                    CRITICAL
                  </span>
                </h3>
                <p className="text-xs text-rose-700/90 mt-1 font-sans">
                  The dashboard detected that <span className="font-bold">{failedSmsInLast24Hours.length} SMS messages</span> failed to dispatch in the last 24 hours, exceeding your alert threshold of <span className="font-bold">{failedSmsThreshold}</span>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Threshold Adjust controller */}
              <div className="hidden sm:flex items-center gap-1.5 bg-white/85 border border-rose-200 rounded-lg px-2 py-1 text-xs">
                <Sliders className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-[11px] font-semibold text-rose-900">SMS Alert Threshold:</span>
                <select
                  value={failedSmsThreshold}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setFailedSmsThreshold(val);
                    localStorage.setItem('crm_failed_sms_thresh', String(val));
                  }}
                  className="bg-transparent text-rose-900 font-bold focus:outline-none cursor-pointer border-none p-0"
                >
                  <option value="1">1 Failure</option>
                  <option value="2">2 Failures</option>
                  <option value="3">3 Failures</option>
                  <option value="5">5 Failures</option>
                  <option value="10">10 Failures</option>
                </select>
              </div>

              {/* Dismiss button */}
              <button
                onClick={() => setShowFailedSmsAlert(false)}
                className="text-rose-500 hover:text-rose-800 p-1 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                title="Dismiss Alert"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Resend / Inspection List inside Alert */}
          <div className="bg-white/80 border border-rose-200/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-rose-800 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                Unsent SMS Queue ({failedSmsInLast24Hours.length} items from past 24 hrs)
              </span>
              {retryMsg && (
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 animate-pulse">
                  {retryMsg}
                </span>
              )}
            </div>

            <div className="divide-y divide-rose-100/60 max-h-48 overflow-y-auto">
              {failedSmsInLast24Hours.map(camp => (
                <div key={camp.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">Segment: {camp.audience}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ID: {camp.id} • {format(new Date(camp.sentAt), "h:mm a")}
                      </span>
                    </div>
                    <p className="text-slate-600 truncate max-w-xl italic">
                      "{camp.message || camp.body}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {retryId === camp.id ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 rounded text-slate-500 font-semibold animate-pulse text-[11px]">
                        <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                        Resending...
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRetryCampaign(camp.id)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs py-1 px-2.5 rounded-lg transition-all shadow-xs hover:scale-105"
                      >
                        Resend Trigger
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex sm:hidden items-center justify-between gap-1.5 border-t border-rose-100 pt-3 text-xs">
            <span className="text-[10px] font-semibold text-rose-900">SMS Alert Threshold:</span>
            <select
              value={failedSmsThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setFailedSmsThreshold(val);
                localStorage.setItem('crm_failed_sms_thresh', String(val));
              }}
              className="bg-white border border-rose-200 rounded-md text-rose-900 font-bold focus:outline-none cursor-pointer p-1"
            >
              <option value="1">1 Failure</option>
              <option value="2">2 Failures</option>
              <option value="3">3 Failures</option>
              <option value="5">5 Failures</option>
              <option value="10">10 Failures</option>
            </select>
          </div>
        </motion.div>
      )}



      <div className="grid grid-cols-2 lg:grid-cols-6 md:grid-cols-3 gap-3 md:gap-4">
        <StatCard index={0} title="Total Leads" value={stats.totalLeads} icon={<Users className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-100" />
        <StatCard index={1} title="Pipeline Value" value={`$${stats.estimatedPipelineValue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5" />} color="text-amber-600" bg="bg-amber-100" />
        <StatCard index={2} title="Conversion Val." value={`$${stats.conversionValue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5" />} color="text-emerald-600" bg="bg-emerald-100" />
        <StatCard index={3} title="New Leads" value={stats.newLeads} icon={<UserPlus className="w-5 h-5" />} color="text-indigo-600" bg="bg-indigo-100" />
        <StatCard index={4} title="Enrolled" value={stats.enrolled} icon={<CheckCircle className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-100" />
        <StatCard index={5} title="Conversion %" value={`${stats.conversionRate}%`} icon={<TrendingUp className="w-5 h-5" />} color="text-purple-600" bg="bg-purple-100" />
      </div>

      {/* Dynamic Pipeline Distribution Horizontal Bar Indicator */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
              Pipeline Stage Distribution Overview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live metrics of active audience segments across default stages ({filteredLeads.length} leads matched)
            </p>
          </div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">
            Period: <span className="text-indigo-600">{dateRangeOption === 'all' ? 'All Time' : dateRangeOption === 'custom' ? 'Custom' : `Last ${dateRangeOption.replace('days', ' Days')}`}</span>
          </div>
        </div>

        {filteredLeads.length > 0 ? (
          <div className="space-y-5">
            {/* Horizontal Bar with percentages */}
            <div className="h-5 w-full rounded-full overflow-hidden flex bg-slate-100/70 shadow-inner border border-slate-100">
              {stageDistributionData
                .filter(item => item.count > 0)
                .map((item) => {
                  const pct = (item.count / filteredLeads.length) * 100;
                  const config = stageColorMap[item.stage] || { hex: '#94a3b8', bgClass: 'bg-slate-400' };
                  return (
                    <div
                      key={item.stage}
                      className={`${config.bgClass} h-full transition-all duration-500 relative group cursor-pointer first:rounded-l-full last:rounded-r-full`}
                      style={{ width: `${pct}%` }}
                    >
                      {pct > 5 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white tracking-tight select-none">
                          {item.count}
                        </span>
                      )}
                      
                      {/* Rich custom hover tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-950 text-white text-[11px] py-2 px-3 rounded-xl shadow-lg z-50 whitespace-nowrap border border-slate-800 animate-in fade-in slide-in-from-bottom-1 duration-150">
                        <div className="font-bold flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${config.bgClass}`}></span>
                          {item.stage}
                        </div>
                        <div className="text-slate-300 mt-1">
                          Count: <span className="font-extrabold text-white">{item.count}</span> <span className="text-slate-600">•</span> {pct.toFixed(1)}%
                        </div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-x-4 border-x-transparent border-t-4 border-t-slate-950"></div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Polished Grid Legend of Stages */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {stageDistributionData.map(item => {
                const count = item.count;
                const pct = filteredLeads.length > 0 ? (count / filteredLeads.length) * 100 : 0;
                const config = stageColorMap[item.stage] || { hex: '#94a3b8', bgClass: 'bg-slate-400', textClass: 'text-slate-600' };

                return (
                  <div
                    key={item.stage}
                    className={`flex items-center justify-between p-2.5 rounded-xl border border-slate-100/80 transition-all ${
                      count > 0 ? 'bg-slate-50/50 hover:bg-white hover:shadow-xs hover:border-slate-200' : 'opacity-40 bg-slate-50/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${config.bgClass} shrink-0`}></span>
                      <span className="text-[11px] font-semibold text-slate-700 truncate" title={item.stage}>
                        {item.stage}
                      </span>
                    </div>
                    <div className="text-right shrink-0 pl-1">
                      <span className="text-xs font-bold text-slate-900">{count}</span>
                      <span className="text-[9px] text-slate-400 font-bold block leading-none mt-0.5">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 text-xs">
            No leads fall within the selected filter range.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-medium text-slate-900 mb-4">Lead Generation Trend</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#11347a" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#11347a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="leads" stroke="#11347a" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-medium text-slate-900 mb-4">Leads by Source</h3>
          <div className="h-72 w-full flex items-center justify-center">
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-400 text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Visual Analytics Row: Pipeline and Tags distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Distribution by stage bar chart */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 font-display">Lead Distribution by Pipeline Stage</h3>
            <p className="text-xs text-slate-500 mt-1">
              Visual representations of absolute lead counts grouped across default and active application statuses.
            </p>
          </div>
          <div className="h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stageDistributionData}
                margin={{ top: 10, right: 20, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="stage" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl text-xs shadow-md border border-slate-800 space-y-1">
                          <p className="font-bold">{data.stage}</p>
                          <p className="text-slate-300">Total Leads: <span className="font-semibold text-indigo-300">{data.count}</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
                  {stageDistributionData.map((entry, index) => {
                    const colors = [
                      '#6366f1', // Indigo
                      '#4f46e5', // Deep Indigo
                      '#3b82f6', // Blue
                      '#2563eb', // Deep Blue
                      '#06b6d4', // Cyan
                      '#0d9488', // Teal
                      '#10b981', // Emerald
                      '#8b5cf6', // Purple
                      '#94a3b8'  // Slate
                    ];
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={colors[index % colors.length]} 
                        fillOpacity={0.85}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Tags Distribution bar chart */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="p-1 bg-amber-50 text-amber-600 rounded">
                <Tag className="w-3.5 h-3.5" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900 font-display">Popular Lead Tags Distribution</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Top 10 active audience segments, interest cohorts, or sourcing labels.
            </p>
          </div>
          <div className="h-80 w-full pt-2">
            {tagDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tagDistributionData}
                  margin={{ top: 10, right: 20, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="tag" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl text-xs shadow-md border border-slate-800 space-y-1">
                            <p className="font-bold flex items-center gap-1 text-amber-400">
                              <Tag className="w-3 h-3 text-amber-400" />
                              {data.tag}
                            </p>
                            <p className="text-slate-300">Total Leads: <span className="font-semibold text-amber-300">{data.count}</span></p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
                    {tagDistributionData.map((entry, index) => {
                      const colors = [
                        '#f59e0b', // Amber-500
                        '#d97706', // Amber-600
                        '#b45309', // Amber-700
                        '#eab308', // Yellow-500
                        '#ca8a04', // Yellow-600
                        '#a16207', // Yellow-700
                        '#f97316', // Orange-500
                        '#ea580c', // Orange-600
                        '#c2410c'  // Orange-700
                      ];
                      return (
                        <Cell 
                          key={`cell-tag-${index}`} 
                          fill={colors[index % colors.length]} 
                          fillOpacity={0.85}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-100 rounded-xl bg-slate-50/40">
                <Tag className="w-8 h-8 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-xs font-semibold text-slate-600">No Lead Tags Found</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Create or assign tags to candidates in the CRM Pipeline/Leads table to visualize the popular cohort distributions here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Funnel Velocity Insights UI Section */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Clock className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-slate-900 font-display">Funnel Velocity Analysis</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Average duration candidates spend in each stage before advancing, calculated from automated audit logs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {velocityData.hasRealData ? (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Real-Time Data Active
              </span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 hover:shadow-xs transition-shadow cursor-default" title="Move some leads between columns in the pipeline for real-time calculations.">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Showing Reference Benchmarks
              </span>
            )}
          </div>
        </div>

        {/* Stage Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {velocityData.items.map((item, idx) => (
            <div 
              key={item.status} 
              className={`p-4 border rounded-xl relative overflow-hidden transition-all duration-300 hover:shadow-xs group flex flex-col justify-between ${
                item.isBenchmark 
                  ? 'bg-slate-50/55 border-slate-150' 
                  : 'bg-indigo-50/15 border-indigo-100/50 hover:border-indigo-300'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Stage {idx + 1}
                </span>
                <h4 className="text-sm font-semibold text-slate-800 mt-1 truncate" title={item.status}>
                  {item.status}
                </h4>
              </div>
              
              <div className="mt-4">
                <div className="text-2xl font-bold text-indigo-950 font-display flex items-baseline gap-1">
                  <span>{formatDuration(item.avgMs)}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-medium">
                  <span>{item.isBenchmark ? 'Benchmark Speed' : `${item.count} updates`}</span>
                </div>
              </div>

              {/* Connecting arrow indicator for desktop */}
              {idx < 4 && (
                <div className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all">
                  <ArrowRight className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Recharts Bar Graph representing duration magnitude */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          <div className="lg:col-span-2 border border-slate-100 rounded-xl p-4 bg-slate-50/30">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Duration Comparison (Estimated Days)
            </h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={velocityData.items.map(item => ({
                    name: item.status,
                    days: parseFloat((item.avgMs / (1000 * 60 * 60 * 24)).toFixed(2)),
                    rawLabel: formatDuration(item.avgMs),
                    isBenchmark: item.isBenchmark
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 35, bottom: 5 }}
                >
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} unit="d" />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={90} />
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-slate-800 space-y-1">
                            <p className="font-bold">{data.name}</p>
                            <p className="text-slate-300">Average Stay: <span className="font-semibold text-indigo-300">{data.rawLabel}</span></p>
                            <p className="text-[10px] text-slate-400">
                              {data.isBenchmark ? 'Estimated Industry Benchmark' : 'Analyzed CRM records'}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="days" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {velocityData.items.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.isBenchmark ? '#94a3b8' : '#6366f1'} 
                        fillOpacity={entry.isBenchmark ? 0.6 : 0.95}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Business Actionable Insights Box */}
          <div className="border border-slate-100 rounded-xl p-5 bg-gradient-to-br from-indigo-50/50 to-white/70 space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              Dynamic Conversion Optimization
            </h4>
            
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                <strong>Ideal Conversion Sequence:</strong> In premium international training, high conversion correlates directly with follow-up speed. Contacting lead within 2 hours of creation doubles booking probability.
              </p>
              
              <div className="bg-white/80 border border-slate-100 rounded-lg p-3">
                <span className="font-semibold text-slate-800 block text-[11px] uppercase tracking-wider mb-1 text-indigo-600">
                  Critical Advice — Demo Class Booked Stage
                </span>
                <p className="text-[11px] text-slate-500">
                  Leads staying longer than 3 days in "Demo Class Booked" or "Payment Pending" stages run a 40% higher chance of turning cold. Proactively trigger SMS reminders or call follow-ups.
                </p>
              </div>

              <div className="text-[10px] text-slate-400 italic">
                Calculated from real audit trail intervals matching your specific candidates logs across sessions.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Due Soon & High Priority Follow-ups Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg shrink-0">
              <Clock className="w-5 h-5 animate-pulse" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 font-display">Due Soon & High Priority Follow-ups</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Immediate reminders and follow-up tasks associated with high-scoring or priority leads.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100 font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 uppercase tracking-wider">
            <Sparkles className="w-3 h-3 text-rose-500" />
            {dueSoonHighPriorityTasks.length} Reminders Outstanding
          </span>
        </div>

        {dueSoonHighPriorityTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dueSoonHighPriorityTasks.slice(0, 6).map(({ task, lead, scoreDetails }) => {
              const hasPhone = !!(lead && lead.phone);
              const isOverdue = task.dueDate < Date.now();
              const dateColorClass = isOverdue ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-slate-600 bg-slate-50 border-slate-100';
              const badgeBg = scoreDetails?.badgeBg || 'bg-amber-100';
              const badgeText = scoreDetails?.badgeText || 'text-amber-800';

              return (
                <div 
                  key={task.id} 
                  className="bg-slate-50/40 hover:bg-white border border-slate-150/70 hover:border-indigo-200/80 p-4.5 rounded-xl transition-all duration-300 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-sm"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${dateColorClass} border`}>
                          {isOverdue ? 'Overdue' : 'Due Soon'}: {format(new Date(task.dueDate), 'MMM dd, yyyy')}
                        </span>
                        <h4 className="text-sm font-bold text-slate-800 line-clamp-1 mt-1 font-display" title={task.title}>
                          {task.title}
                        </h4>
                      </div>

                      {scoreDetails && (
                        <div className="flex flex-col items-end shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${badgeBg} ${badgeText}`}>
                            {scoreDetails.level} Lead
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                            Score: {scoreDetails.score}/100
                          </span>
                        </div>
                      )}
                    </div>

                    {lead && (
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800">{lead.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium">({lead.status})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-500 font-medium">
                          {lead.phone && (
                            <div className="flex items-center gap-1">
                              <Smartphone className="w-3 h-3 text-slate-400" />
                              <span className="font-mono truncate">{lead.phone}</span>
                            </div>
                          )}
                          {lead.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span className="truncate">{lead.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {task.description && (
                      <p className="text-xs text-slate-600 italic line-clamp-2">
                        "{task.description}"
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={sendingFollowUpId === task.id || !hasPhone || !!followUpSuccess[task.id]}
                      onClick={() => lead && handleSendFollowUp(task, lead)}
                      className={`flex-1 min-w-[130px] shadow-xs active:scale-95 text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all text-white ${
                        followUpSuccess[task.id]
                          ? 'bg-emerald-605 bg-emerald-600 cursor-default'
                          : !hasPhone
                          ? 'bg-slate-350 cursor-not-allowed opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
                      }`}
                    >
                      {sendingFollowUpId === task.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Dispatching...</span>
                        </>
                      ) : followUpSuccess[task.id] ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 animate-bounce" />
                          <span>Follow-up Sent! ✓</span>
                        </>
                      ) : !hasPhone ? (
                        <>
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Phone Missing</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Follow-up</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task)}
                      className="bg-white hover:bg-slate-50 hover:text-emerald-700 text-slate-500 border border-slate-200 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                      title="Mark task as complete and remove from active list"
                    >
                      <CheckSquare className="w-3.5 h-3.5 text-slate-400 hover:text-emerald-500" />
                      <span className="hidden sm:inline">Complete Task</span>
                    </button>
                  </div>

                  {followUpSuccess[task.id] && (
                    <motion.p
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 p-1.5 rounded text-center animate-pulse"
                    >
                      {followUpSuccess[task.id]}
                    </motion.p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50/40 border border-dashed border-slate-200/60 rounded-xl p-8 flex flex-col items-center justify-center text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 stroke-[1.25] mb-2" />
            <p className="text-xs font-bold text-slate-700">No overdue or high priority tasks</p>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">
              All tasks for high-priority or Hot leads are complete! Create tasks for high priority candidates to show action items here.
            </p>
          </div>
        )}
      </div>

      {/* Activity Feed Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Activity className="w-5 h-5 animate-pulse" />
              </span>
              <h2 className="text-lg font-semibold text-slate-900 font-display">Recent Activity & Team Bulletin</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Real-time feed of user actions, new lead creations, pipeline status changes, sent messages, and team announcements.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] bg-indigo-100/60 text-indigo-800 font-bold px-2.5 py-1 rounded-full">
              {sortedAndFilteredLogs.length} Events Logged
            </span>
            <button
              type="button"
              onClick={loadDashboardData}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg border border-slate-200/60 transition-colors cursor-pointer"
              title="Refresh logs stream"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters and Inputs row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Categories selectors */}
          <div className="flex flex-wrap items-center gap-1.5 border border-slate-150 p-1 bg-slate-50/50 rounded-xl">
            {[
              { id: 'all', label: 'All Actions', icon: <Activity className="w-3.5 h-3.5" /> },
              { id: 'lead', label: 'Leads Only', icon: <Users className="w-3.5 h-3.5" /> },
              { id: 'task', label: 'Tasks', icon: <CheckSquare className="w-3.5 h-3.5" /> },
              { id: 'campaign', label: 'Campaigns', icon: <Mail className="w-3.5 h-3.5" /> },
              { id: 'system', label: 'System/Team', icon: <Sparkles className="w-3.5 h-3.5" /> }
            ].map(cat => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActivityCategory(cat.id as any)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  activityCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:shadow-xs'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-xs min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Query events log..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium placeholder-slate-400"
            />
            {activitySearch && (
              <button
                type="button"
                onClick={() => setActivitySearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-medium text-xs cursor-pointer p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Content split grid: Actions feed stream + Quick broadcast bulletin */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Stream of actions */}
          <div className="lg:col-span-8 space-y-3.5 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {sortedAndFilteredLogs.length > 0 ? (
              <div className="relative border-l-2 border-slate-100 pl-4 ml-3 space-y-4 py-2">
                {sortedAndFilteredLogs.slice(0, 30).map((log, index) => {
                  let badgeColor = 'bg-slate-50 text-slate-600 border-slate-200';
                  let bgHover = 'hover:bg-slate-50/50';
                  let icon = <Clock className="w-4 h-4" />;
                  
                  if (log.entityType === 'lead') {
                    badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                    icon = <Users className="w-4 h-4" />;
                  } else if (log.entityType === 'task') {
                    if (log.action.includes('Complete') || log.action.includes('Completed')) {
                      badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                      icon = <CheckCircle className="w-4 h-4" />;
                    } else {
                      badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                      icon = <CheckSquare className="w-4 h-4" />;
                    }
                  } else if (log.entityType === 'campaign') {
                    badgeColor = 'bg-amber-50 text-amber-700 border-amber-100';
                    icon = <Mail className="w-4 h-4" />;
                  } else if (log.entityType === 'system' || log.action === 'Team Announcement') {
                    badgeColor = 'bg-purple-50 text-purple-700 border-purple-100';
                    icon = <Sparkles className="w-4 h-4" />;
                  }

                  // Determine color-coded status badge for different event categories
                  let categoryBadge: { text: string; bg: string } | null = null;
                  const actLower = log.action.toLowerCase();
                  if (actLower.includes('acquired') || actLower.includes('lead acquired') || actLower.includes('new lead') || actLower.includes('lead created')) {
                    categoryBadge = { text: 'New Lead', bg: 'bg-emerald-100/80 text-emerald-800 border-emerald-200/50' };
                  } else if (actLower.includes('campaign') || actLower.includes('sms') || actLower.includes('message') || actLower.includes('sent') || actLower.includes('launch') || actLower.includes('broad')) {
                    categoryBadge = { text: 'Sent Message', bg: 'bg-blue-100/80 text-blue-800 border-blue-200/50' };
                  } else if (actLower.includes('status') || actLower.includes('transition') || actLower.includes('stage') || actLower.includes('pipeline')) {
                    categoryBadge = { text: 'Status Update', bg: 'bg-orange-100/80 text-orange-800 border-orange-200/50' };
                  } else if (log.entityType === 'task' || actLower.includes('task')) {
                    categoryBadge = { text: 'Task Update', bg: 'bg-indigo-100/80 text-indigo-800 border-indigo-200/50' };
                  } else {
                    categoryBadge = { text: 'System', bg: 'bg-slate-100 text-slate-700 border-slate-200/50' };
                  }

                  const formattedTime = getRelativeTime(log.createdAt);

                  return (
                    <motion.div
                      key={log.id || index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.4) }}
                      className={`relative flex items-start gap-3.5 p-3 rounded-xl border border-transparent ${bgHover} hover:border-slate-100 group transition-all`}
                    >
                      {/* Timeline dot */}
                      <span className="absolute -left-[23px] top-[18px] w-2 h-2 rounded-full border border-white bg-slate-300 group-hover:bg-indigo-500 group-hover:scale-120 transition-all z-10"></span>

                      {/* Icon Avatar badge */}
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${badgeColor}`}>
                        {icon}
                      </div>

                      {/* Detail Column */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5 flex-wrap">
                            {log.action}
                            {categoryBadge && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${categoryBadge.bg} transition-all`}>
                                {categoryBadge.text}
                              </span>
                            )}
                            {log.entityId && (
                              <span className="font-mono text-[9px] text-slate-400 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded leading-none">
                                ID: {log.entityId.slice(0, 8)}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            {formattedTime}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                          {log.details}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 px-4 border border-dashed border-slate-150 rounded-2xl bg-slate-50/20 flex flex-col items-center justify-center">
                <Inbox className="w-8 h-8 text-slate-300 stroke-[1.5] mb-2" />
                <p className="text-xs font-semibold text-slate-600">No matching activities found</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                  We couldn't find any recent actions for this filter. Try adjusting your query or categories selectors.
                </p>
              </div>
            )}
          </div>

          {/* Quick Announcement Broadcast bulletin */}
          <div className="lg:col-span-4 space-y-5 border border-slate-150 rounded-2xl p-5 bg-slate-50/50">
            <div>
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                Broadcast Team Announcement
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Pin a custom announcement or broadcast update instantly visible to the active team on their feed dashboard in real time.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="relative">
                <textarea
                  placeholder="Type an announcement to broadcast to your team, e.g., 'Payment classes audit starting at 4 PM'..."
                  rows={3}
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  className="w-full border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none p-3 rounded-xl text-xs text-slate-700 placeholder-slate-400 bg-white shadow-xs resize-none"
                />
              </div>

              {broadcastSuccess && (
                <div className="p-2.5 text-[11px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl animate-in fade-in">
                  {broadcastSuccess}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePostBroadcast}
                  disabled={isPostingBroadcast || !broadcastText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm shadow-indigo-100 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPostingBroadcast ? 'Broadcasting...' : 'Post Bulletin'}
                </button>
              </div>
            </div>

            {/* Micro Team Insights */}
            <div className="border-t border-slate-200/60 pt-4 space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Active System Transparency Indicators
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Leads Acquired Today
                  </span>
                  <span className="font-bold text-slate-900 font-mono">
                    {leads.filter(l => isSameDay(new Date(Number(l.createdAt) || 0), new Date())).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Completed Tasks Today
                  </span>
                  <span className="font-bold text-slate-900 font-mono">
                    {tasks.filter(t => t.status === 'Completed' && t.updatedAt && isSameDay(new Date(Number(t.updatedAt) || 0), new Date())).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Active Campaigns Broadly
                  </span>
                  <span className="font-bold text-slate-900 font-mono">{campaigns.length}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
        <QuickActionCard 
          icon={<Smartphone className="w-5 h-5 text-indigo-600" />} 
          title="Send Bulk SMS" 
          description="Send promotional offers to new leads via Bangladesh SMS Gateway."
          action="New Campaign"
        />
        <QuickActionCard 
          icon={<Mail className="w-5 h-5 text-indigo-600" />} 
          title="Email Campaign" 
          description="Dispatch course materials or newsletters to enrolled students."
          action="Compose Email"
        />
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, bg, index = 0 }: { title: string, value: string | number, icon: React.ReactNode, color: string, bg: string, index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: "easeOut" }}
      className="bg-white p-3.5 sm:p-5 md:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between gap-2 overflow-hidden"
    >
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs md:text-sm font-medium text-slate-500 truncate">{title}</p>
        <p className="text-lg sm:text-2xl md:text-3xl font-display font-semibold text-slate-900 mt-0.5 sm:mt-1 truncate">{value}</p>
      </div>
      <div className={`${bg} ${color} w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0`}>
        {icon}
      </div>
    </motion.div>
  );
}

function QuickActionCard({ icon, title, description, action }: { icon: React.ReactNode, title: string, description: string, action: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between group hover:border-indigo-300 transition-colors cursor-pointer">
      <div className="flex items-start gap-4 space-y-0.5">
        <div className="bg-indigo-50 p-3 rounded-xl mt-0.5">{icon}</div>
        <div>
          <h4 className="font-medium text-slate-900">{title}</h4>
          <p className="text-sm text-slate-500 mt-1 max-w-[250px]">{description}</p>
        </div>
      </div>
      <button className="mt-4 sm:mt-0 text-sm font-medium text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
        {action}
      </button>
    </div>
  );
}
