import React, { useState, useEffect } from 'react';
import { Send, Smartphone, Mail, AlertCircle, CheckCircle2, History, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import type { Campaign, Lead } from '../types';
import { logAuditEvent } from '../utils/auditLogger';

export default function SmsEmailCampaignsView() {
  const [activeTab, setActiveTab] = useState<'SMS' | 'Email'>('SMS');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  
  // Form State
  const [audience, setAudience] = useState('All Contacts');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    // Fetch Campaigns
    fetch(`/api/campaigns?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.campaigns) {
          const activeCamps = data.campaigns.filter((c: Campaign) => c.type === activeTab);
          activeCamps.sort((a: any, b: any) => b.sentAt - a.sentAt);
          setCampaigns(activeCamps);
        }
      })
      .catch(err => console.error(err));
      
    // Fetch Leads for Audience Listing
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.leads) {
          setLeads(data.leads);
        }
      })
      .catch(err => console.error(err));
  }, [userId, activeTab]);

  const getTargetedLeads = () => {
    return leads.filter(lead => {
      const status = lead.status as string;
      if (audience === 'All Contacts') return true;
      if (audience === 'New Leads') return status === 'New Lead' || status === 'New';
      if (audience === 'Contacted Leads') return status === 'Contact' || status === 'Contacted';
      if (audience === 'Follow-up Required') return status === 'Follow-up Required' || status === 'Follow-up';
      if (audience === 'Consultation Booked') return status === 'Consultation Booked';
      if (audience === 'Demo Class Booked') return status === 'Demo Class Booked' || status === 'Demo Class';
      if (audience === 'Payment Pending') return status === 'Payment Pending';
      if (audience === 'Re-engagement Offer') return status === 'Re-engagement Offer';
      if (audience === 'Enrolled Students') return status === 'Enrolled';
      if (audience === 'Discarded Leads') return status === 'Discarded';
      return false;
    });
  };

  const targetedLeads = getTargetedLeads();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSuccessMsg('');
    
    const endpoint = activeTab === 'SMS' ? '/api/campaigns/sms' : '/api/campaigns/email';
    const payload = activeTab === 'SMS' 
      ? { audience, message, userId }
      : { audience, subject, body: message, userId };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        const sentCamp = data.campaign;
        setCampaigns(prev => [sentCamp, ...prev]);

        // Publish log event
        logAuditEvent({
          action: 'Campaign Dispatched',
          entityType: 'campaign',
          entityId: sentCamp.id,
          details: activeTab === 'SMS' 
            ? `Dispatched broadcast SMS to audience "${audience}": "${message.slice(0, 50)}${message.length > 50 ? '...' : ''}"`
            : `Dispatched Email Newsletter "${subject}" to audience "${audience}".`
        });

        setSuccessMsg(`${activeTab} sent successfully!`);
        setMessage('');
        setSubject('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Campaigns</h1>
          <p className="text-slate-500 text-sm mt-1">Engage your leads via SMS Gateway and Email Newsletters.</p>
        </div>
      </div>

      <div className="flex bg-slate-200/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('SMS')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'SMS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Smartphone className="w-4 h-4" /> SMS Gateway
        </button>
        <button
          onClick={() => setActiveTab('Email')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          <Mail className="w-4 h-4" /> Email Marketing
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            Compose {activeTab}
          </h2>
          
          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-emerald-800 font-medium text-sm">Success</h4>
                <p className="text-emerald-600 text-xs mt-0.5">{successMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center justify-between">
                Target Audience Category
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {targetedLeads.length} Recipients
                </span>
              </label>
              <select 
                required
                value={audience}
                onChange={e => setAudience(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white mb-2"
              >
                <option value="All Contacts">All Contacts</option>
                <option value="New Leads">New Leads</option>
                <option value="Contacted Leads">Contact/Contacted Leads</option>
                <option value="Follow-up Required">Follow-up Required</option>
                <option value="Consultation Booked">Consultation Booked</option>
                <option value="Demo Class Booked">Demo Class Booked</option>
                <option value="Payment Pending">Payment Pending</option>
                <option value="Re-engagement Offer">Re-engagement Offer list</option>
                <option value="Enrolled Students">Enrolled Students</option>
                <option value="Discarded Leads">Discarded Leads</option>
              </select>
              
              {/* Audience Preview */}
              {targetedLeads.length > 0 && (
                <div className="border border-slate-100 bg-slate-50 rounded-xl p-3 max-h-32 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {targetedLeads.map(l => (
                      <span key={l.id} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm">
                        <Users className="w-3 h-3 text-slate-400" />
                        {l.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {targetedLeads.length === 0 && (
                <div className="text-xs text-amber-600 font-medium py-1">
                  No contacts found in this category. Messages will not be sent.
                </div>
              )}
            </div>

            {activeTab === 'Email' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject Line</label>
                <input 
                  type="text" 
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Special Offer for premium IELTS course..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Message / Body</label>
              <textarea 
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={activeTab === 'SMS' ? 4 : 8}
                placeholder={activeTab === 'SMS' ? "Write your SMS here... Max 160 chars for one segment." : "Write your email content..."}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              ></textarea>
              {activeTab === 'SMS' && (
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${message.length > 160 ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
                    {message.length} chars {message.length > 160 ? '(Multiple segments)' : ''}
                  </span>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={sending || message.trim() === '' || targetedLeads.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {sending ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send {activeTab}
                </>
              )}
            </button>
          </form>
          
          {activeTab === 'SMS' && (
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3">
              <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                SMS messages are routed through <strong>BulkSMSBD integration</strong>. Please ensure your balance is sufficient before broadcasting to large audiences.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Recent {activeTab} History</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto max-h-[500px]">
             {campaigns.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No previous {activeTab} campaigns found.
                </div>
             ) : (
                <div className="divide-y divide-slate-100">
                  {campaigns.map(camp => (
                    <div key={camp.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-semibold text-slate-900">
                          {activeTab === 'Email' ? camp.subject : 'SMS Broadcast'}
                        </span>
                        <span className="text-xs text-slate-500">{format(new Date(camp.sentAt), 'MMM d, h:mm a')}</span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="inline-flex px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-medium tracking-wide uppercase">
                          Audience: {camp.audience}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Sent
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
