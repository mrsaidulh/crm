import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Phone, Mail, GripVertical, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logAuditEvent } from '../utils/auditLogger';
import type { Lead, LeadStatus } from '../types';

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Consultation Booked', 'Demo Class', 'Payment Pending', 'Enrolled', 'Discarded'];

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; border: string; accent: string; dot: string; glow: string }> = {
  'New': { bg: 'bg-indigo-50/80', text: 'text-indigo-700', border: 'border-indigo-100', accent: 'bg-indigo-600', dot: 'bg-indigo-500', glow: 'shadow-indigo-100/50' },
  'Contacted': { bg: 'bg-blue-50/80', text: 'text-blue-700', border: 'border-blue-100', accent: 'bg-blue-600', dot: 'bg-blue-500', glow: 'shadow-blue-100/50' },
  'Follow-up': { bg: 'bg-amber-50/80', text: 'text-amber-700', border: 'border-amber-100', accent: 'bg-amber-600', dot: 'bg-amber-500', glow: 'shadow-amber-100/50' },
  'Consultation Booked': { bg: 'bg-orange-50/80', text: 'text-orange-700', border: 'border-orange-100', accent: 'bg-orange-600', dot: 'bg-orange-500', glow: 'shadow-orange-100/50' },
  'Counseling Done': { bg: 'bg-cyan-50/80', text: 'text-cyan-700', border: 'border-cyan-100', accent: 'bg-cyan-600', dot: 'bg-cyan-500', glow: 'shadow-cyan-100/50' },
  'Demo Class': { bg: 'bg-purple-50/80', text: 'text-purple-700', border: 'border-purple-100', accent: 'bg-purple-600', dot: 'bg-purple-500', glow: 'shadow-purple-100/50' },
  'Payment Pending': { bg: 'bg-rose-50/80', text: 'text-rose-700', border: 'border-rose-100', accent: 'bg-rose-600', dot: 'bg-rose-500', glow: 'shadow-rose-100/50' },
  'Enrolled': { bg: 'bg-emerald-50/80', text: 'text-emerald-700', border: 'border-emerald-100', accent: 'bg-emerald-600', dot: 'bg-emerald-500', glow: 'shadow-emerald-100/50' },
  'Discarded': { bg: 'bg-slate-50/80', text: 'text-slate-700', border: 'border-slate-100', accent: 'bg-slate-600', dot: 'bg-slate-500', glow: 'shadow-slate-100/50' }
};

export default function FunnelView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LeadStatus | null>(null);
  
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
    // Optimistically update the UI status immediately
    const prevLeads = [...leads];
    const leadObj = leads.find(l => l.id === id);
    if (!leadObj) return;

    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));

    try {
      const response = await fetch(`/api/leads/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        throw new Error('Failed to update stage on the database backend');
      }

      // Successfully updated on database - log audit trail
      logAuditEvent({
        action: 'Lead Status Transition',
        entityType: 'lead',
        entityId: id,
        details: `Lead "${leadObj.name}" status transitioned from "${leadObj.status}" to "${newStatus}".`
      });
    } catch (e) {
      console.error('Error updating status:', e);
      // Revert in case of standard errors
      setLeads(prevLeads);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading funnel...</div>;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -mt-2">
      <div className="mb-6 shrink-0 px-1">
        <h1 className="text-2xl font-display font-semibold text-slate-900">Pipeline Funnel</h1>
        <p className="text-slate-500 text-sm mt-1">
          Drag and drop lead cards below to gracefully transfer candidates across milestones, or use fallback status dropdown selectors.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto md:overflow-x-auto pb-6 -mx-4 px-4 md:-mx-8 md:px-8">
        <div className="flex flex-col md:flex-row gap-5 w-full md:min-w-max md:h-[calc(100vh-14rem)] items-stretch md:items-start select-none">
          {STATUSES.map(status => {
            const columnLeads = leads
              .filter(l => l.status === status)
              .sort((a, b) => b.createdAt - a.createdAt);

            const colors = STATUS_COLORS[status];
            const isTargetColumn = dragOverStatus === status;
            const isAnyCardDragging = draggingLeadId !== null;

            return (
              <div 
                key={status} 
                className={`w-full md:w-[290px] rounded-2xl flex flex-col shrink-0 border transition-all duration-300 relative ${
                  isTargetColumn 
                    ? 'border-indigo-400 bg-indigo-50/60 ring-4 ring-indigo-500/10 shadow-md scale-[1.01]' 
                    : isAnyCardDragging
                      ? 'border-dashed border-slate-300 bg-slate-50/40 opacity-85'
                      : 'border-slate-200/90 bg-slate-50/90 shadow-xs'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== status) {
                    setDragOverStatus(status);
                  }
                }}
                onDragLeave={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX;
                  const y = e.clientY;
                  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
                    setDragOverStatus(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  const droppedLeadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
                  if (droppedLeadId) {
                    const leadToUpdate = leads.find(l => l.id === droppedLeadId);
                    if (leadToUpdate && leadToUpdate.status !== status) {
                      updateLeadStatus(droppedLeadId, status);
                    }
                  }
                }}
              >
                {/* Visual accent bar */}
                <span className={`absolute left-0 top-0 bottom-0 md:bottom-auto md:right-0 md:h-[4px] w-[5px] md:w-full transition-all duration-300 ${isTargetColumn ? 'bg-indigo-500 h-[6px]' : colors.accent}`} />
                
                <div className="p-4 pl-6 md:pl-4 border-b border-slate-200/60 flex items-center justify-between bg-slate-50/40 rounded-t-2xl shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${colors.dot} ${isTargetColumn ? 'animate-ping' : ''}`} />
                    <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">{status}</h3>
                  </div>
                  <span className={`${colors.bg} ${colors.text} text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.border}`}>
                    {columnLeads.length}
                  </span>
                </div>
                
                <div className="p-3 flex-1 space-y-3 md:overflow-y-auto max-h-[480px] md:max-h-none min-h-[140px] flex flex-col justify-start">
                  <AnimatePresence mode="popLayout">
                    {columnLeads.length > 0 ? (
                      columnLeads.map(lead => {
                        const isBeingDragged = draggingLeadId === lead.id;
                        return (
                          <motion.div 
                            key={lead.id || `lead-${lead.name || ''}`}
                            layout
                            draggable
                            onDragStart={(e) => {
                              setDraggingLeadId(lead.id);
                              e.dataTransfer.setData('text/plain', lead.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggingLeadId(null);
                            }}
                            initial={{ opacity: 0, scale: 0.95, y: 12 }}
                            animate={{ 
                              opacity: isBeingDragged ? 0.35 : 1, 
                              scale: isBeingDragged ? 0.95 : 1, 
                              y: 0 
                            }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            whileHover={{ 
                              y: -3, 
                              scale: 1.015, 
                              boxShadow: "0 10px 15px -3px rgba(99, 102, 241, 0.08), 0 4px 6px -2px rgba(99, 102, 241, 0.02)" 
                            }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ 
                              type: "spring", 
                              stiffness: 300, 
                              damping: 25,
                              layout: { type: "spring", stiffness: 350, damping: 28 }
                            }}
                            className={`bg-white p-3.5 rounded-xl border transition-colors relative group cursor-grab active:cursor-grabbing ${
                              isBeingDragged
                                ? 'border-dashed border-indigo-400 bg-indigo-50/10'
                                : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1 pb-1">
                              <h4 className="font-semibold text-slate-800 text-xs tracking-tight truncate flex-1 leading-snug">
                                {lead.name}
                              </h4>
                              <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing" />
                            </div>
                            
                            <div className="space-y-1 text-[11px] text-slate-500/95 mt-1">
                              <p className="flex items-center gap-1.5 min-w-0">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" /> 
                                <span className="truncate">{lead.phone}</span>
                              </p>
                              <p className="flex items-center gap-1.5 min-w-0">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" /> 
                                <span className="truncate">{lead.email}</span>
                              </p>
                              {lead.expectedValue && lead.expectedValue > 0 && (
                                <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 mt-1.5 bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10 w-fit">
                                  ${lead.expectedValue.toLocaleString()} value
                                </p>
                              )}
                            </div>

                            {lead.notes && (
                              <div className="mt-2.5 p-2 bg-slate-50 border border-slate-100/70 rounded-lg text-[10px] text-slate-500 italic truncate max-w-full">
                                "{lead.notes}"
                              </div>
                            )}
                            
                            <div className="mt-3.5 pt-2.5 border-t border-slate-100/70 flex items-center justify-between gap-1.5">
                              <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/50 truncate max-w-[100px]">
                                {lead.source}
                              </span>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <select
                                  value={lead.status}
                                  onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                                  className="text-[9px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/80 rounded py-0.5 px-1.5 cursor-pointer transition-colors focus:ring-0 focus:outline-none"
                                  title="Transfer Stage"
                                >
                                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center gap-1 h-full min-h-[110px]">
                        <CheckCircle className="w-4 h-4 text-slate-200" />
                        <span className="text-[10px] font-medium text-slate-400 select-none">No leads in stage</span>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

