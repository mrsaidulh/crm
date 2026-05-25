import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Phone, Mail, KanbanSquare, ArrowRight, ArrowLeft } from 'lucide-react';
import type { Lead, LeadStatus } from '../types';

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Consultation Booked', 'Demo Class', 'Payment Pending', 'Enrolled'];

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
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-display font-semibold text-slate-900">Pipeline Funnel</h1>
        <p className="text-slate-500 text-sm mt-1">Visualize your marketing funnel and shift leads across stages.</p>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 -mx-6 px-6 md:-mx-8 md:px-8">
        <div className="flex gap-6 min-w-max h-[calc(100vh-14rem)] items-start">
          {STATUSES.map(status => {
            const columnLeads = leads
              .filter(l => l.status === status)
              .sort((a, b) => b.createdAt - a.createdAt);

            return (
              <div 
                key={status} 
                className="w-[320px] bg-slate-100/60 rounded-2xl flex flex-col max-h-full border border-slate-200/80 shadow-sm"
              >
                <div className="p-4 border-b border-slate-200/60 flex items-center justify-between bg-slate-100/90 rounded-t-2xl shrink-0">
                  <h3 className="font-semibold text-slate-800 text-sm tracking-wide">{status}</h3>
                  <span className="bg-white text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">
                    {columnLeads.length}
                  </span>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto space-y-3">
                  {columnLeads.map(lead => (
                    <div 
                      key={lead.id} 
                      className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-200 transition-all group relative cursor-default"
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
                        
                        <select
                          value={lead.status}
                          onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                          className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border-none rounded-md py-1.5 px-2 cursor-pointer transition-colors focus:ring-0"
                          title="Move Lead"
                        >
                          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  
                  {columnLeads.length === 0 && (
                    <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <span className="text-xs font-medium text-slate-400">Drop leads here</span>
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
