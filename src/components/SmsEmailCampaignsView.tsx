import React, { useState, useEffect } from 'react';
import { Send, Smartphone, Mail, AlertCircle, CheckCircle2, History, Users, Search, Filter, Eye, X, Clock, Tag, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import type { Campaign, Lead } from '../types';
import { logAuditEvent } from '../utils/auditLogger';

export default function SmsEmailCampaignsView() {
  const [activeTab, setActiveTab] = useState<'SMS' | 'Email'>('SMS');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allSmsCampaigns, setAllSmsCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  
  // Form State
  const [audience, setAudience] = useState('All Contacts');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Search & Filter State for Message History Table
  const [smsSearchQuery, setSmsSearchQuery] = useState('');
  const [smsSegmentFilter, setSmsSegmentFilter] = useState('All');
  const [smsTypeFilter, setSmsTypeFilter] = useState<'All' | 'SMS' | 'Email'>('All');
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selected Campaign Modal
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    // Fetch Campaigns
    fetch(`/api/campaigns?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.campaigns) {
          const sorted = [...data.campaigns].sort((a: any, b: any) => b.sentAt - a.sentAt);
          
          // Tab active filtered campaigns
          const activeCamps = sorted.filter((c: Campaign) => c.type === activeTab);
          setCampaigns(activeCamps);

          // Store all campaigns (both SMS and Email) in the list
          setAllSmsCampaigns(sorted);
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
        setAllSmsCampaigns(prev => [sentCamp, ...prev]);

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

  const handleRetryCampaign = async (camp: Campaign) => {
    if (retryLoadingId) return;
    setRetryLoadingId(camp.id);
    setSuccessMsg('');
    
    try {
      const res = await fetch('/api/campaigns/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: camp.id, userId })
      });
      const data = await res.json();
      
      if (res.ok) {
        const updatedCamp = data.campaign;
        
        // Update local React lists
        setAllSmsCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: 'Sent' } : c));
        setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: 'Sent' } : c));
        
        if (selectedCampaign?.id === camp.id) {
          setSelectedCampaign(prev => prev ? { ...prev, status: 'Sent' } : null);
        }

        setSuccessMsg(`Resend triggered successfully! Speficic ${camp.type} to audience "${camp.audience}" has been dispatched.`);
        
        logAuditEvent({
          action: 'Campaign Resent',
          entityType: 'campaign',
          entityId: camp.id,
          details: `Immediate retry executed for Failed status of ${camp.type} campaign to segment "${camp.audience}"`
        });
      } else {
        alert(data.error || 'Failed to retry dispatching campaign.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error trying to retry campaign resend.');
    } finally {
      setRetryLoadingId(null);
    }
  };

  const handleToggleMockStatus = async (camp: Campaign) => {
    const newStatus = camp.status === 'Failed' ? 'Sent' : 'Failed';
    try {
      const res = await fetch('/api/campaigns/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: camp.id, status: newStatus })
      });
      if (res.ok) {
        setAllSmsCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: newStatus } : c));
        setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, status: newStatus } : c));
        if (selectedCampaign?.id === camp.id) {
          setSelectedCampaign(prev => prev ? { ...prev, status: newStatus } : null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered Campaigns for Message History Table
  const filteredSmsCampaigns = allSmsCampaigns.filter(camp => {
    const textOfCamp = `${camp.message || ''} ${camp.subject || ''} ${camp.body || ''}`.toLowerCase();
    const textMatch = 
      (camp.id && camp.id.toLowerCase().includes(smsSearchQuery.toLowerCase())) ||
      textOfCamp.includes(smsSearchQuery.toLowerCase()) ||
      (camp.audience && camp.audience.toLowerCase().includes(smsSearchQuery.toLowerCase()));
      
    const segmentMatch = 
      smsSegmentFilter === 'All' || 
      camp.audience === smsSegmentFilter;

    const typeMatch =
      smsTypeFilter === 'All' ||
      camp.type === smsTypeFilter;

    return textMatch && segmentMatch && typeMatch;
  });

  // Pagination bounds calculation
  const totalItems = filteredSmsCampaigns.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedSmsCampaigns = filteredSmsCampaigns.slice(startIndex, endIndex);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [smsSearchQuery, smsSegmentFilter, smsTypeFilter]);

  // Helper to estimate SMS Parts or show word counts for email
  const getSmsParts = (msg: string) => {
    const chars = msg.length;
    if (chars === 0) return '0 Parts';
    if (chars <= 160) return `${chars} Chars (1 Part)`;
    const segments = Math.ceil(chars / 153);
    return `${chars} Chars (${segments} Parts)`;
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
          id="sms-tab"
        >
          <Smartphone className="w-4 h-4" /> SMS Gateway
        </button>
        <button
          onClick={() => setActiveTab('Email')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          id="email-tab"
        >
          <Mail className="w-4 h-4" /> Email Marketing
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6" id="composer-card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            Compose {activeTab}
          </h2>
          
          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-start gap-3" id="compose-success-banner">
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
                id="audience-select"
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
                <div className="border border-slate-100 bg-slate-50 rounded-xl p-3 max-h-32 overflow-y-auto" id="audience-preview-list">
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
                <div className="text-xs text-amber-600 font-medium py-1" id="empty-audience-note">
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
                  id="newsletter-subject"
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
                id="message-body-textarea"
              ></textarea>
              {activeTab === 'SMS' && (
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${message.length > 160 ? 'text-amber-600 font-medium' : 'text-slate-400'}`} id="char-counter">
                    {message.length} chars {message.length > 160 ? `(${Math.ceil(message.length / 153)} SMS Parts)` : '(1 SMS Part)'}
                  </span>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={sending || message.trim() === '' || targetedLeads.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              id="send-campaign-button"
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
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-100 flex gap-3" id="provider-details-callout">
              <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                SMS messages are routed through <strong>BulkSMSBD integration</strong>. Please ensure your balance is sufficient before broadcasting to large audiences.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col" id="recent-history-sidebar">
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
                        <span className="text-sm font-semibold text-slate-900 truncate max-w-[200px]">
                          {activeTab === 'Email' ? camp.subject : (camp.message ? camp.message.slice(0, 40) + '...' : 'SMS Broadcast')}
                        </span>
                        <span className="text-xs text-slate-500 shrink-0">{format(new Date(camp.sentAt), 'MMM d, h:mm a')}</span>
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

      {/* NEW SECTION: Message History Table for Audit Purposes */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mt-6" id="message-history-audit-section">
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Message History & Dispatch Audit Logs</h3>
              <p className="text-slate-500 text-xs mt-0.5 font-sans">Comprehensive history of dispatched SMS payloads and Email newsletters, delivery status, target segments, and recipient statistics.</p>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-3 self-start md:self-auto">
            <span className="text-slate-500 text-xs font-semibold uppercase bg-slate-100 px-2.5 py-1 rounded-lg">
              Total Logs: {allSmsCampaigns.length}
            </span>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text"
              placeholder="Search logs, campaign content, subject..."
              value={smsSearchQuery}
              onChange={e => setSmsSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="search-history-input"
            />
          </div>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter className="text-slate-400 w-4 h-4 shrink-0" />
            <select
              value={smsTypeFilter}
              onChange={e => setSmsTypeFilter(e.target.value as any)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="type-filter-select"
            >
              <option value="All">All Channels</option>
              <option value="SMS">SMS Gateway</option>
              <option value="Email">Email Marketing</option>
            </select>
          </div>

          {/* Segment Filter */}
          <div className="flex items-center gap-2">
            <Users className="text-slate-400 w-4 h-4 shrink-0" />
            <select
              value={smsSegmentFilter}
              onChange={e => setSmsSegmentFilter(e.target.value)}
              className="w-full text-[13px] border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="segment-filter-select"
            >
              <option value="All">All Segments</option>
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
          </div>
        </div>

        {/* Audit Table */}
        <div className="overflow-x-auto">
          {paginatedSmsCampaigns.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Smartphone className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium">No matching message logs found.</p>
              <p className="text-xs text-slate-400 mt-1">Adjust your filters or dispatch a new broadcast above.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse" id="audit-table-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3.5">ID</th>
                  <th className="px-6 py-3.5">Timestamp</th>
                  <th className="px-6 py-3.5">Channel</th>
                  <th className="px-6 py-3.5">Target Segment</th>
                  <th className="px-6 py-3.5">Message / Subject / Content Block</th>
                  <th className="px-6 py-3.5">Length / Size</th>
                  <th className="px-6 py-3.5">Delivery Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedSmsCampaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/50 transition-all text-xs">
                    {/* ID */}
                    <td className="px-6 py-4 font-mono text-slate-500 align-middle">
                      {camp.id ? camp.id.slice(0, 8).toUpperCase() : 'N/A'}
                    </td>
                    
                    {/* Timestamp */}
                    <td className="px-6 py-4 font-medium text-slate-800 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {format(new Date(camp.sentAt), 'yyyy-MM-dd HH:mm:ss')}
                      </div>
                    </td>

                    {/* Type Badge */}
                    <td className="px-6 py-4 align-middle whitespace-nowrap">
                      {camp.type === 'SMS' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 font-semibold rounded text-[10px] uppercase">
                          <Smartphone className="w-3 h-3 text-indigo-500" />
                          SMS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-800 font-semibold rounded text-[10px] uppercase">
                          <Mail className="w-3 h-3 text-indigo-600" />
                          Email
                        </span>
                      )}
                    </td>

                    {/* Segment */}
                    <td className="px-6 py-4 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50/50 text-indigo-700 font-semibold rounded-lg text-[10px]">
                        <Tag className="w-3 h-3 text-indigo-400" />
                        {camp.audience}
                      </span>
                    </td>

                    {/* Message Preview */}
                    <td className="px-6 py-4 max-w-[280px] break-words text-slate-600 align-middle">
                      <div className="truncate font-sans leading-relaxed text-slate-600 font-medium" title={camp.message || camp.body}>
                        {camp.type === 'Email' ? (
                          <>
                            <span className="font-semibold text-slate-900 block truncate">{camp.subject}</span>
                            <span className="text-slate-400 text-[10px] block truncate font-normal mt-0.5">{camp.body || camp.message}</span>
                          </>
                        ) : (
                          camp.message || 'No body content'
                        )}
                      </div>
                    </td>

                    {/* Characters & Segments count */}
                    <td className="px-6 py-4 align-middle font-semibold text-slate-500 whitespace-nowrap">
                      {camp.type === 'SMS' 
                        ? getSmsParts(camp.message || '') 
                        : `${(camp.body || camp.message || '').length} Chars`}
                    </td>

                    {/* Interactive Failed Status / Delivery Status Badge */}
                    <td className="px-6 py-4 align-middle whitespace-nowrap">
                      {retryLoadingId === camp.id ? (
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-ping" />
                          Resending...
                        </span>
                      ) : camp.status === 'Failed' ? (
                        <button
                          onClick={() => handleRetryCampaign(camp)}
                          className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider border border-rose-200 cursor-pointer transition hover:scale-105"
                          title="Click immediately to trigger resend / retry"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          Failed (Retry)
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-extrabold px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider border border-emerald-100">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {camp.status || 'Delivered'}
                        </span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="px-6 py-4 text-right align-middle whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2" id={`actions-${camp.id}`}>
                        {/* Status Mock Simulator Toggler */}
                        <button
                          onClick={() => handleToggleMockStatus(camp)}
                          className={`px-2 py-1 text-[10px] font-semibold border rounded-lg transition-all ${
                            camp.status === 'Failed' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title="Click to toggle status for testing the Retry click-trigger"
                        >
                          {camp.status === 'Failed' ? 'Mock Success' : 'Mock Fail'}
                        </button>

                        <button
                          onClick={() => setSelectedCampaign(camp)}
                          className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors shadow-sm"
                          id={`btn-view-${camp.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Payload</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600" id="audit-table-pagination">
            <div>
              Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to <span className="font-bold text-slate-800">{endIndex}</span> of <span className="font-bold text-slate-800">{totalItems}</span> entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 rounded-lg transition-colors font-medium shadow-sm"
              >
                Previous
              </button>
              <span className="font-semibold">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 rounded-lg transition-colors font-medium shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DETAILED BROADCAST INSPECTION MODAL */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" id="campaign-inspection-modal">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-slate-100/10">
              <div className="flex items-center gap-2.5">
                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                  {selectedCampaign.type === 'SMS' ? (
                    <Smartphone className="w-5 h-5 animate-pulse" />
                  ) : (
                    <Mail className="w-5 h-5 animate-pulse" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Campaign Payload Audit Inspection</h3>
                  <p className="text-slate-400 text-[10px] font-mono whitespace-nowrap">API ID: {selectedCampaign.id.toUpperCase()}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                id="close-modal-button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Target Segment</span>
                  <div className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    {selectedCampaign.audience}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Timestamp (UTC/Local)</span>
                  <div className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    {format(new Date(selectedCampaign.sentAt), 'yyyy-MM-dd HH:mm:ss')}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Campaign Channel</span>
                  <div className="text-xs font-bold text-slate-800 mt-1 capitalize">
                    {selectedCampaign.type === 'SMS' ? 'SMS Gateway' : 'Email Newsletter'}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Status Verification</span>
                  <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${
                    selectedCampaign.status === 'Failed' ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    {selectedCampaign.status === 'Failed' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        Failed (Click status in table to retry)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        {selectedCampaign.status || 'Delivered (Successful)'}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject if email */}
              {selectedCampaign.type === 'Email' && selectedCampaign.subject && (
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block mb-1">Subject Line</span>
                  <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 text-xs font-bold text-slate-800">
                    {selectedCampaign.subject}
                  </div>
                </div>
              )}

              {/* Message block */}
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block mb-1">Precise Message Body</span>
                <div className="bg-slate-900 text-slate-100 font-mono text-xs p-4 rounded-xl border border-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                  {selectedCampaign.message || selectedCampaign.body}
                </div>
              </div>

              {/* If Failed, add direct retry option inside modal */}
              {selectedCampaign.status === 'Failed' && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-rose-900">This broadcast failed to send</span>
                    <p className="text-[10px] text-rose-600">Route failures or API connection dropouts detected.</p>
                  </div>
                  <button
                    onClick={() => {
                      handleRetryCampaign(selectedCampaign);
                      setSelectedCampaign(null);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition shadow-sm"
                  >
                    Resend Immediately
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-5 py-2 rounded-xl text-xs transition shadow-sm"
                id="close-inspection-footer"
              >
                Close Audit Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

