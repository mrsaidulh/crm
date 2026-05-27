import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Phone, Mail, KanbanSquare, ArrowRight, ArrowLeft } from 'lucide-react';
import type { Lead, LeadStatus } from '../types';

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Consultation Booked', 'Demo Class', 'Payment Pending', 'Enrolled'];

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; border: string; accent: string; dot: string }> = {
  'New': { bg: 'bg-indigo-50/80', text: 'text-indigo-700', border: 'border-indigo-100', accent: 'bg-indigo-600', dot: 'bg-indigo-500' },
  'Contacted': { bg: 'bg-blue-50/80', text: 'text-blue-700', border: 'border-blue-100', accent: 'bg-blue-600', dot: 'bg-blue-500' },
  'Follow-up': { bg: 'bg-amber-50/80', text: 'text-amber-700', border: 'border-amber-100', accent: 'bg-amber-600', dot: 'bg-amber-500' },
  'Consultation Booked': { bg: 'bg-orange-50/80', text: 'text-orange-700', border: 'border-orange-100', accent: 'bg-orange-600', dot: 'bg-orange-500' },
  'Counseling Done': { bg: 'bg-cyan-50/80', text: 'text-cyan-700', border: 'border-cyan-100', accent: 'bg-cyan-600', dot: 'bg-cyan-500' },
  'Demo Class': { bg: 'bg-purple-50/80', text: 'text-purple-700', border: 'border-purple-100', accent: 'bg-purple-600', dot: 'bg-purple-500' },
  'Payment Pending': { bg: 'bg-rose-50/80', text: 'text-rose-700', border: 'border-rose-100', accent: 'bg-rose-600', dot: 'bg-rose-500' },
  'Enrolled': { bg: 'bg-emerald-50/80', text: 'text-emerald-700', border: 'border-emerald-100', accent: 'bg-emerald-600', dot: 'bg-emerald-500' },
  'Discarded': { bg: 'bg-slate-50/80', text: 'text-slate-700', border: 'border-slate-100', accent: 'bg-slate-600', dot: 'bg-slate-500' }
};

export default function FunnelView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch(error => console.error('Error fetching pipeline leads:', error))
      .finally(() => setLoading(false));
  }, [userId]);

  const updateLeadStatus = async (id: string, newStatus: LeadStatus) => {
    try {
      const response = await fetch(`/api/leads/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
      }
    } catch (e) {
      console.error('Error updating status:', e);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading funnel...</div>;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -mt-2">
      <div className="mb-6 shrink-0 px-1">
        <h1 className="text-2xl font-display font-semibold text-slate-900">Pipeline Funnel</h1>
        <p className="text-slate-500 text-sm mt-1">Visualize your marketing funnel and shift leads across stages easily.</p>
      </div>

      <div className="flex-1 overflow-y-auto md:overflow-x-auto pb-6 -mx-4 px-4 md:-mx-8 md:px-8">
        <div className="flex flex-col md:flex-row gap-6 w-full md:min-w-max md:h-[calc(100vh-14rem)] items-stretch md:items-start">
          {STATUSES.map(status => {
            const columnLeads = leads
              .filter(l => l.status === status)
              .sort((a, b) => b.createdAt - a.createdAt);

            const colors = STATUS_COLORS[status];

            return (
              <div 
                key={status} 
                className="w-full md:w-[320px] bg-slate-100/60 rounded-2xl flex flex-col shrink-0 border border-slate-200/80 shadow-sm relative overflow-hidden"
              >
                {/* Visual accent bar */}
                <span className={`absolute left-0 top-0 bottom-0 md:bottom-auto md:right-0 md:h-[4px] w-[5px] md:w-full ${colors.accent}`} />
                
                <div className="p-4 pl-6 md:pl-4 border-b border-slate-200/60 flex items-center justify-between bg-slate-50/90 rounded-t-2xl shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                    <h3 className="font-semibold text-slate-800 text-sm tracking-wide">{status}</h3>
                  </div>
                  <span className={`${colors.bg} ${colors.text} text-xs font-bold px-2.5 py-1 rounded-full border ${colors.border} shadow-sm`}>
                    {columnLeads.length} {columnLeads.length === 1 ? 'lead' : 'leads'}
                  </span>
                </div>
                
                <div className="p-4 flex-1 space-y-3 md:overflow-y-auto min-h-[80px]">
                  {columnLeads.length > 0 ? (
                    columnLeads.map(lead => (
                      <div 
                        key={lead.id || `lead-${lead.name || ''}-${lead.createdAt}`} 
                        className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all duration-200 group relative cursor-default"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-slate-900 text-sm">{lead.name}</h4>
                        </div>
                        
                        <div className="space-y-1.5 focus:outline-none">
                          <p className="text-[11px] text-slate-500 flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {lead.phone}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-slate-400" /> {lead.email}
                          </p>
                          {lead.expectedValue && lead.expectedValue > 0 && (
                            <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-2 mt-1">
                              ${lead.expectedValue.toLocaleString()} Value
                            </p>
                          )}
                        </div>

                        {lead.notes && (
                          <div className="mt-3 p-2 bg-slate-50 rounded-lg text-[10px] text-slate-500 italic border border-slate-100">
                            "{lead.notes.length > 60 ? lead.notes.substring(0, 60) + '...' : lead.notes}"
                          </div>
                        )}
                        
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-1.5 rounded-md border border-slate-200/60">
                            {lead.source}
                          </span>
                          
                          <div className="flex items-center gap-1.5 relative">
                            <span className="text-[9px] text-slate-400 font-medium hidden xs:inline">Move:</span>
                            <select
                              value={lead.status}
                              onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                              className="text-[11px] font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md py-1 px-2 cursor-pointer transition-colors focus:ring-0 focus:outline-none focus:border-slate-300 active:scale-95 duration-100"
                              title="Move Lead Status"
                            >
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div key="empty-stage" className="p-4 text-center border-2 border-dashed border-slate-200/60 rounded-xl bg-slate-50/50">
                      <span className="text-xs font-medium text-slate-400">No leads in this stage</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
