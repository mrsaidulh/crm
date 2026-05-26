import React, { useEffect, useState, useMemo } from 'react';
import { format, subDays, isSameDay } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { Users, UserPlus, CheckCircle, TrendingUp, Phone, Mail, FileText, Smartphone, Calendar } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { Lead, Stats } from '../types';
import { Server, WifiOff, AlertTriangle, RefreshCw, Key, HelpCircle } from 'lucide-react';

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; config?: any; error?: string } | null>(null);
  const [checkingDb, setCheckingDb] = useState(false);

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

  const loadDashboardData = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.text();
          let parsed;
          try { parsed = JSON.parse(body); } catch (_) {}
          throw new Error(parsed?.error || parsed?.message || body || `Server error ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data && data.leads) {
          setLeads(data.leads);
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
    const newLeads = filteredLeads.filter((l: Lead) => l.status === 'New').length;
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


      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Leads" value={stats.totalLeads} icon={<Users className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-100" />
        <StatCard title="Pipeline Value" value={`$${stats.estimatedPipelineValue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5" />} color="text-amber-600" bg="bg-amber-100" />
        <StatCard title="Conversion Val." value={`$${stats.conversionValue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5" />} color="text-emerald-600" bg="bg-emerald-100" />
        <StatCard title="New Leads" value={stats.newLeads} icon={<UserPlus className="w-5 h-5" />} color="text-indigo-600" bg="bg-indigo-100" />
        <StatCard title="Enrolled" value={stats.enrolled} icon={<CheckCircle className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-100" />
        <StatCard title="Conversion %" value={`${stats.conversionRate}%`} icon={<TrendingUp className="w-5 h-5" />} color="text-purple-600" bg="bg-purple-100" />
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

function StatCard({ title, value, icon, color, bg }: { title: string, value: string | number, icon: React.ReactNode, color: string, bg: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-3xl font-display font-semibold text-slate-900 mt-1">{value}</p>
      </div>
      <div className={`${bg} ${color} w-12 h-12 rounded-full flex items-center justify-center`}>
        {icon}
      </div>
    </div>
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
