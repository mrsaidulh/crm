import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import { 
  Smartphone, 
  Search, 
  Filter, 
  Clock, 
  RefreshCw, 
  Download, 
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Fingerprint
} from 'lucide-react';
import type { SmsLog } from '../types';

export default function SmsLogsView() {
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [clearing, setClearing] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  const fetchSmsLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sms-logs?userId=${encodeURIComponent(userId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.logs) {
          const sorted = data.logs.sort((a: any, b: any) => b.sentAt - a.sentAt);
          setLogs(sorted);
        }
      }
    } catch (err) {
      console.error('Error fetching SMS logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSmsLogs();
  }, [userId]);

  const handleRefresh = () => {
    fetchSmsLogs();
  };

  const handleClearLogs = async () => {
    if (!confirm('Are you absolutely sure you want to clear the SMS delivery logs? This action is permanent and cannot be undone.')) {
      return;
    }

    setClearing(true);
    try {
      setLogs([]);
      // We trigger a database clear if our app supports it, or use fallback
      const response = await fetch(`/api/sms-logs?userId=${encodeURIComponent(userId)}`, {
        // Under MySQL or DB, let's add support to clear
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CLEAR' })
      });
      if (response.ok) {
        console.log('Cleared SMS logs successfully.');
      }
    } catch (err) {
      console.error('Error clearing SMS history:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Log ID', 'Phone Number', 'Message Content', 'Gateway Provider', 'Status', 'Diagnostic Details'];
    
    const rows = filteredLogs.map(log => [
      format(new Date(log.sentAt), 'yyyy-MM-dd HH:mm:ss'),
      log.id,
      log.phone,
      log.message,
      log.provider,
      log.status,
      log.errorDetails || 'N/A'
    ]);

    const csvContent = [
      headers.join(','), 
      ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `crm_sms_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get unique providers for drop-down filter
  const uniqueProviders = Array.from(new Set(logs.map(l => l.provider).filter(Boolean)));

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.id?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesProvider = providerFilter === 'All' || log.provider === providerFilter;
    const matchesStatus = statusFilter === 'All' || log.status === statusFilter;

    return matchesSearch && matchesProvider && matchesStatus;
  });

  // Calculate statistics
  const totalCount = logs.length;
  const sentCount = logs.filter(l => l.status === 'Sent').length;
  const failedCount = logs.filter(l => l.status === 'Failed').length;
  const successRate = totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 100;
  const simulationCount = logs.filter(l => l.provider === 'Simulation').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 pb-5">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-indigo-600">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-slate-900 tracking-tight">SMS Delivery Logs</h1>
            <p className="text-sm text-slate-500">Review SMS dispatch history, check delivery status, and diagnose connection errors.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          <button
            id="btn_refresh_sms_logs"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            id="btn_export_sms_csv"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            id="btn_clear_sms_history"
            onClick={handleClearLogs}
            disabled={logs.length === 0 || clearing}
            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Clear logs
          </button>
        </div>
      </div>

      {/* Stats Quick-Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl text-slate-600">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Attempts</p>
            <p className="text-2xl font-bold text-slate-950 mt-0.5">{totalCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Successfully Sent</p>
            <p className="text-2xl font-bold text-slate-950 mt-0.5">{sentCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className={`p-3 rounded-xl border ${failedCount > 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Failed / Errors</p>
            <p className={`text-2xl font-bold mt-0.5 ${failedCount > 0 ? 'text-red-600' : 'text-slate-950'}`}>{failedCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl text-indigo-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Sandbox Simulated</p>
            <p className="text-2xl font-bold text-indigo-950 mt-0.5">{simulationCount}</p>
          </div>
        </div>
      </div>

      {/* Control Filters Bar */}
      <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input_sms_search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by phone number or message content..."
            className="w-full bg-slate-50/50 hover:bg-slate-50 focus:bg-white text-slate-800 text-sm pl-10 pr-4 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-500 text-sm whitespace-nowrap">
            <Filter className="w-4 h-4" />
            <span>Filter Gateway:</span>
          </div>
          
          <select
            id="select_sms_provider"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="bg-white text-slate-700 text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium cursor-pointer"
          >
            <option value="All">All Providers</option>
            <option value="Simulation">Simulation Sandbox</option>
            {uniqueProviders.filter(p => p !== 'Simulation').map(prov => (
              <option key={prov} value={prov}>{prov}</option>
            ))}
          </select>

          <select
            id="select_sms_status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white text-slate-700 text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Sent">Sent</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="text-sm font-medium">Retrieving delivery logs...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <div className="inline-flex p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-400 mb-4">
              <HelpCircle className="w-8 h-8" />
            </div>
            <p className="font-semibold text-slate-800">No logs match criteria</p>
            <p className="text-sm text-slate-400 mt-1">Try broadening your queries or submit a test SMS.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-55/60 border-b border-slate-200 text-slate-500 font-semibold text-xs tracking-wider uppercase">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Gateway</th>
                  <th className="px-6 py-4">Message Body</th>
                  <th className="px-6 py-4">Delivery Status</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150">
                {filteredLogs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const formattedDate = format(new Date(log.sentAt), 'yyyy-MM-dd HH:mm:ss');
                  
                  return (
                    <React.Fragment key={log.id}>
                      <tr 
                        id={`row_sms_${log.id}`}
                        className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-indigo-50/10' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formattedDate}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 font-mono">
                          {log.phone}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                            log.provider === 'Simulation' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {log.provider}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 max-w-sm truncate" title={log.message}>
                          {log.message}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {log.status === 'Sent' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-55 animate-pulse" />
                              Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-55" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            id={`btn_toggle_details_${log.id}`}
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/60 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                          >
                            {isExpanded ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr id={`row_details_expanded_${log.id}`} className="bg-slate-50/50">
                          <td colSpan={6} className="px-6 py-4 border-b border-slate-200">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-inner space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                                    <Fingerprint className="w-3.5 h-3.5" /> Log Identification
                                  </h4>
                                  <div className="mt-1.5 text-sm text-slate-800 font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 break-all">
                                    {log.id}
                                  </div>
                                </div>
                                <div>
                                  <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5" /> Full Target Address
                                  </h4>
                                  <div className="mt-1.5 text-sm text-slate-850 font-mono bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    {log.phone}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400">Payload String Sent</h4>
                                <div className="mt-1.5 text-sm text-slate-850 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed font-sans">
                                  {log.message}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" /> Gateway Logs & Diagnostics
                                </h4>
                                <div className={`mt-1.5 text-sm p-3 rounded-lg border leading-tight font-mono ${
                                  log.status === 'Sent' 
                                    ? 'bg-emerald-50/30 border-emerald-100 text-slate-700' 
                                    : 'bg-red-50/10 border-red-100 text-red-700'
                                }`}>
                                  {log.status === 'Sent' ? (
                                    <span>
                                      Status OK. Remote provider received instruction payload.
                                      {log.errorDetails && <div className="mt-2 text-xs text-slate-500">Response Data: {log.errorDetails}</div>}
                                    </span>
                                  ) : (
                                    <span className="block">
                                      <div className="font-bold flex items-center gap-1.5 mb-1.5 text-red-650">
                                        <XCircle className="w-4 h-4 text-red-500" /> Dispatch Failure:
                                      </div>
                                      <span className="text-xs whitespace-pre-wrap">{log.errorDetails || 'Connection handshake timed out or returned no response body.'}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
