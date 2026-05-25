import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Clock, 
  User, 
  Database, 
  Mail, 
  Smartphone, 
  CheckSquare, 
  RefreshCw, 
  Download, 
  Trash2,
  Calendar,
  Layers
} from 'lucide-react';
import type { AuditLog } from '../types';

export default function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [actionFilter, setActionFilter] = useState<string>('All');
  const [clearing, setClearing] = useState(false);

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/audit-logs?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.logs) {
          const fbLogs = data.logs;
          fbLogs.sort((a: any, b: any) => b.createdAt - a.createdAt);
          setLogs(fbLogs);
        }
      })
      .catch(err => console.error('Error loading audit logs:', err))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/audit-logs?userId=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Are you absolutely sure you want to clear the audit history? This action is permanent and cannot be undone.')) {
      return;
    }

    setClearing(true);
    try {
      setLogs([]);
      const response = await fetch(`/api/audit-logs?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        console.log('Cleared audit logs on MySQL.');
      }
    } catch (err) {
      console.error('Error clearing audit history:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Log ID', 'Action Executed', 'Category', 'Entity Reference ID', 'Event Details'];
    
    const rows = filteredLogs.map(log => [
      format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      log.id,
      log.action,
      log.entityType || 'system',
      log.entityId || 'N/A',
      log.details
    ]);

    const csvContent = [
      headers.join(','), 
      ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `crm_audit_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get unique actions for filter dropdown
  const uniqueActions = Array.from(new Set(logs.map(l => l.action).filter(Boolean)));

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.id?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'All' || log.entityType === typeFilter;
    const matchesAction = actionFilter === 'All' || log.action === actionFilter;

    return matchesSearch && matchesType && matchesAction;
  });

  // Styles helpers for categories
  const getCategoryStyles = (type?: string) => {
    switch (type) {
      case 'lead':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'task':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'campaign':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'template':
        return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'workflow':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'system':
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-550/10 text-indigo-600 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-display font-semibold text-slate-900">Audit Logs</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Chronological registry of administrative actions, data changes, and broadcast operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Logs (CSV)
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              disabled={clearing}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl transition-all border border-red-100 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Purge Logs
            </button>
          )}
        </div>
      </div>

      {/* Statistics Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-250/60 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-slate-50 text-slate-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Records</p>
            <h4 className="text-xl font-bold text-slate-800 mt-0.5">{logs.length}</h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-250/60 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Leads Mutations</p>
            <h4 className="text-xl font-bold text-slate-800 mt-0.5">
              {logs.filter(l => l.entityType === 'lead').length}
            </h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-250/60 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Task Adjustments</p>
            <h4 className="text-xl font-bold text-slate-800 mt-0.5">
              {logs.filter(l => l.entityType === 'task').length}
            </h4>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-250/60 shadow-sm flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Broadcast Outputs</p>
            <h4 className="text-xl font-bold text-slate-800 mt-0.5">
              {logs.filter(l => l.entityType === 'campaign').length}
            </h4>
          </div>
        </div>
      </div>

      {/* Control Filters Block */}
      <div className="bg-white p-4 rounded-2xl border border-slate-250/60 shadow-sm flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250/60 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
            placeholder="Search details, operation names, UUID codes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Entity Type Filter */}
        <div className="w-full md:w-52">
          <div className="relative">
            <input 
              type="hidden" 
              name="typeFilter" 
              value={typeFilter} 
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250/60 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="lead">📁 Student Leads</option>
              <option value="task">📝 Task Adjustments</option>
              <option value="campaign">📢 Broadcast Campaigns</option>
              <option value="template">📄 Message Templates</option>
              <option value="workflow">⚡ Automation Workflows</option>
              <option value="system">⚙️ System Events</option>
            </select>
          </div>
        </div>

        {/* Action filter */}
        <div className="w-full md:w-52">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-250/60 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="All">All Operations</option>
            {uniqueActions.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Timeline Trail Layout */}
      <div className="bg-white rounded-2xl border border-slate-250/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs font-medium text-slate-500">Retrieving security audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center select-none">
            <div className="bg-slate-50 p-4 rounded-full inline-flex text-slate-400 mb-3 border border-slate-100">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">No logs found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              We couldn't locate any security audit records matching your specific filters and search criteria.
            </p>
          </div>
        ) : (
          <div className="p-6">
            <div className="relative border-l-2 border-slate-100 pl-6 ml-4 space-y-8 py-2">
              {filteredLogs.map(log => {
                const isLeadType = log.entityType === 'lead';
                const isTaskType = log.entityType === 'task';
                const isCampaignType = log.entityType === 'campaign';
                
                return (
                  <div key={log.id} className="relative group animate-in slide-in-from-left-2 duration-200">
                    
                    {/* Visual Pulse circle on timeline keypoint */}
                    <span className="absolute -left-[31px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    </span>

                    <div className="bg-slate-50/50 hover:bg-indigo-50/15 p-4 rounded-xl border border-slate-150 group-hover:border-indigo-100 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        
                        <div className="space-y-1">
                          {/* Top Tagging & Actions */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 tracking-tight">
                              {log.action}
                            </span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md border ${getCategoryStyles(log.entityType)}`}>
                              {log.entityType || 'system'}
                            </span>
                          </div>
                          
                          {/* Inner detailed summary */}
                          <p className="text-xs text-slate-600 font-medium leading-relaxed pt-0.5">
                            {log.details}
                          </p>
                        </div>

                        {/* Relative operators metadata side */}
                        <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          {/* Time */}
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {format(new Date(log.createdAt), 'MMM dd, yyyy • hh:mm a')}
                          </div>
                          {/* User */}
                          <div className="flex items-center gap-1 text-[11px] text-indigo-600 font-mono bg-indigo-50/50 hover:bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/30">
                            <User className="w-3 h-3" />
                            <span>{log.userId === 'ielts_crm_main_user' ? 'master_administrator' : log.userId.slice(0, 12)}</span>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
