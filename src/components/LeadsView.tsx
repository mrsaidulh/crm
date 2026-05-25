import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Search, Plus, Filter, Mail, Phone, Edit2, Trash2, X, Download, ArrowUpDown, Tag, Globe, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { Lead, LeadStatus, LeadSource } from '../types';
import { calculateLeadScore } from '../utils/scoring';
import { triggerGlobalWebhook, triggerWorkflowAutomations } from '../utils/automation';
import { logAuditEvent } from '../utils/auditLogger';


export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [countryFilter, setCountryFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('createdAt-desc');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    source: 'Direct' as LeadSource, 
    notes: '', 
    expectedValue: '' as string | number, 
    targetCourse: 'IELTS Academic', 
    targetBand: '', 
    destination: 'United Kingdom',
    tags: ''
  });

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
      .catch(error => {
        console.error('API Error:', error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  const handleStatusChange = async (id: string, newStatus: LeadStatus) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    try {
      const response = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus } : l));
        const updatedLead = { ...lead, status: newStatus };
        // Trigger global webhooks or active custom automation rules
        triggerGlobalWebhook(userId, 'Lead Status Changed', updatedLead);
        triggerWorkflowAutomations(userId, 'Lead Status Changed', newStatus, updatedLead);
        
        // Publish log event
        logAuditEvent({
          action: 'Lead Status Transition',
          entityType: 'lead',
          entityId: id,
          details: `Lead "${lead.name}" status transitioned from "${lead.status}" to "${newStatus}".`
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBulkStatusChange = async (newStatus: LeadStatus) => {
    if (selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const promises = selectedLeadIds.map(async (id) => {
        await fetch(`/api/leads/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
      });
      await Promise.all(promises);
      
      setLeads(prev => prev.map(l => selectedLeadIds.includes(l.id) ? { ...l, status: newStatus } : l));

      // Trigger integration events for every affected lead
      selectedLeadIds.forEach(id => {
        const lead = leads.find(l => l.id === id);
        if (lead) {
          const updatedLead = { ...lead, status: newStatus };
          triggerGlobalWebhook(userId, 'Lead Status Changed', updatedLead);
          triggerWorkflowAutomations(userId, 'Lead Status Changed', newStatus, updatedLead);
        }
      });

      // Publish log event
      logAuditEvent({
        action: 'Lead Bulk Status Update',
        entityType: 'lead',
        details: `Updated the status of ${selectedLeadIds.length} lead(s) collectively to "${newStatus}".`
      });

      setSelectedLeadIds([]);
    } catch (e) {
      console.error('Error updating bulk status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedLeadIds.length} selected lead(s)?`)) return;
    try {
      setLoading(true);
      const promises = selectedLeadIds.map(id => 
        fetch(`/api/leads/${id}`, { method: 'DELETE' })
      );
      await Promise.all(promises);
      
      setLeads(prev => prev.filter(l => !selectedLeadIds.includes(l.id)));

      logAuditEvent({
        action: 'Lead Bulk Deletion',
        entityType: 'lead',
        details: `Deleted ${selectedLeadIds.length} lead(s) permanently from the directory.`
      });

      setSelectedLeadIds([]);
    } catch (e) {
      console.error('Error deleting bulk leads:', e);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLeadId(null);
    setFormData({ 
      name: '', 
      email: '', 
      phone: '', 
      source: 'Direct', 
      notes: '', 
      expectedValue: '', 
      targetCourse: 'IELTS Academic', 
      targetBand: '', 
      destination: 'United Kingdom',
      tags: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (lead: Lead) => {
    setEditingLeadId(lead.id);
    setFormData({ 
      name: lead.name, 
      email: lead.email, 
      phone: lead.phone, 
      source: lead.source, 
      notes: lead.notes || '', 
      expectedValue: lead.expectedValue || '', 
      targetCourse: lead.targetCourse || 'IELTS Academic', 
      targetBand: lead.targetBand || '', 
      destination: lead.destination || 'United Kingdom',
      tags: lead.tags ? lead.tags.join(', ') : ''
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedTags = formData.tags 
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean) 
        : [];

      const baseData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        source: formData.source,
        notes: formData.notes,
        targetCourse: formData.targetCourse,
        targetBand: formData.targetBand,
        destination: formData.destination,
        tags: parsedTags,
      };
      
      const dataToSave: any = { ...baseData };
      if (formData.expectedValue) {
        dataToSave.expectedValue = Number(formData.expectedValue);
      }

      if (editingLeadId) {
        const response = await fetch(`/api/leads/${editingLeadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        if (response.ok) {
          const resData = await response.json();
          const savedLead = resData.lead;
          setLeads(prev => prev.map(l => l.id === editingLeadId ? savedLead : l));
          
          // If status changed in the edit, trigger status changed events
          const lead = leads.find(l => l.id === editingLeadId);
          if (lead && dataToSave.status && lead.status !== dataToSave.status) {
            const updatedLead = { ...lead, ...dataToSave };
            triggerGlobalWebhook(userId, 'Lead Status Changed', updatedLead);
            triggerWorkflowAutomations(userId, 'Lead Status Changed', dataToSave.status, updatedLead);
          }

          // Publish log event
          logAuditEvent({
            action: 'Lead Profile Updated',
            entityType: 'lead',
            entityId: editingLeadId,
            details: `Lead "${dataToSave.name || lead?.name || 'Unknown'}" details updated by admin.`
          });
        }
      } else {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...dataToSave,
            userId: userId
          })
        });
        if (response.ok) {
          const resData = await response.json();
          const createdLead = resData.lead;
          setLeads(prev => [createdLead, ...prev]);
          
          // Dispatch automation trigger on lead creation
          triggerGlobalWebhook(userId, 'Lead Created', createdLead);
          triggerWorkflowAutomations(userId, 'Lead Created', 'New', createdLead);

          // Publish log event
          logAuditEvent({
            action: 'Lead Acquired',
            entityType: 'lead',
            entityId: createdLead.id,
            details: `Registered new student lead: "${createdLead.name}" via "${createdLead.source}".`
          });
        }
      }
      closeModal();
    } catch (err) {
      console.error('Error saving lead', err);
    }
  };

  const handleExportCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Name', 'Email', 'Phone', 'Source', 'Status', 'Lead Score', 'Tags', 'Expected Value', 'Target Course', 'Target Band', 'Destination', 'Created At'];
    
    const rows = leads.map(lead => [
      lead.name,
      lead.email,
      lead.phone,
      lead.source,
      lead.status,
      calculateLeadScore(lead).score,
      lead.tags ? lead.tags.join('; ') : '',
      lead.expectedValue || '',
      lead.targetCourse || '',
      lead.targetBand || '',
      lead.destination || '',
      format(new Date(lead.createdAt), 'yyyy-MM-dd HH:mm:ss')
    ]);

    const csvContent = [
      headers.join(','), 
      ...rows.map(e => e.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `crm_leads_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      const resp = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(search.toLowerCase()) || 
                          lead.email.toLowerCase().includes(search.toLowerCase()) ||
                          lead.phone.includes(search) ||
                          (lead.tags && lead.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'All' || lead.source === sourceFilter;
    const matchesCountry = countryFilter === 'All' || lead.destination === countryFilter;
    return matchesSearch && matchesStatus && matchesSource && matchesCountry;
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === 'createdAt-desc') {
      return b.createdAt - a.createdAt;
    }
    if (sortBy === 'createdAt-asc') {
      return a.createdAt - b.createdAt;
    }
    if (sortBy === 'score-desc') {
      return calculateLeadScore(b).score - calculateLeadScore(a).score;
    }
    if (sortBy === 'expectedValue-desc') {
      return (b.expectedValue || 0) - (a.expectedValue || 0);
    }
    return 0;
  });

  const statusColors: Record<LeadStatus, string> = {
    'New': 'bg-blue-100 text-blue-700',
    'Contacted': 'bg-amber-100 text-amber-700',
    'Follow-up': 'bg-purple-100 text-purple-700',
    'Consultation Booked': 'bg-indigo-100 text-indigo-700',
    'Counseling Done': 'bg-teal-100 text-teal-700',
    'Demo Class': 'bg-pink-100 text-pink-700',
    'Payment Pending': 'bg-orange-100 text-orange-700',
    'Enrolled': 'bg-emerald-100 text-emerald-700',
    'Discarded': 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Leads Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage inquiries from all ad sources and forms.</p>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button 
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            title="Export leads to a CSV file"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Leads
          </button>
          <button 
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search leads by name, email, phone or tags..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            {/* Status Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs">
              <Filter className="w-4 h-4 text-slate-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Enrolled">Enrolled</option>
                <option value="Discarded">Discarded</option>
              </select>
            </div>

            {/* Lead Source Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs">
              <Tag className="w-4 h-4 text-slate-400" />
              <select 
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700"
              >
                <option value="All">All Sources</option>
                <option value="Facebook Ads">Facebook Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Youtube Ads">Youtube Ads</option>
                <option value="Website Form">Website Form</option>
                <option value="Direct">Direct</option>
                <option value="Referral">Referral</option>
                <option value="Others">Others</option>
              </select>
            </div>

            {/* Target Country Filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs">
              <Globe className="w-4 h-4 text-slate-400" />
              <select 
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700"
              >
                <option value="All">All Countries</option>
                <option value="Australia">Australia</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="USA">USA</option>
                <option value="Canada">Canada</option>
                <option value="Others">Others</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-xs">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs font-semibold focus:outline-none bg-transparent border-none cursor-pointer p-0 text-slate-700"
              >
                <option value="createdAt-desc">Newest First</option>
                <option value="createdAt-asc">Oldest First</option>
                <option value="score-desc">Highest Lead Score</option>
                <option value="expectedValue-desc">Highest Pipeline</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Bulk Actions Bar */}
        {selectedLeadIds.length > 0 && (
          <div className="bg-indigo-50/80 border-b border-indigo-100 px-6 py-3 flex flex-col sm:flex-row gap-3 justify-between items-center animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-900 bg-indigo-100 px-2.5 py-1 rounded-full">
                {selectedLeadIds.length} select{selectedLeadIds.length === 1 ? 'ed' : 's'}
              </span>
              <span className="text-sm font-medium text-indigo-700">Leads selected for bulk operations</span>
            </div>
            
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-xl px-3 py-1.5 shadow-xs">
                <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Change Status:</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value as LeadStatus);
                      e.target.value = ''; // Reset select
                    }
                  }}
                  defaultValue=""
                  className="text-xs font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 cursor-pointer"
                >
                  <option value="" disabled>Select Status...</option>
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Consultation Booked">Consultation Booked</option>
                  <option value="Counseling Done">Counseling Done</option>
                  <option value="Demo Class">Demo Class</option>
                  <option value="Payment Pending">Payment Pending</option>
                  <option value="Enrolled">Enrolled</option>
                  <option value="Discarded">Discarded</option>
                </select>
              </div>

              <button
                onClick={handleBulkDelete}
                className="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>

              <button
                onClick={() => setSelectedLeadIds([])}
                className="text-slate-500 hover:text-slate-800 px-2.5 py-1.5 text-xs font-semibold"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
              <tr>
                <th className="pl-6 pr-2 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={sortedLeads.length > 0 && sortedLeads.every(l => selectedLeadIds.includes(l.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLeadIds(prev => {
                          const newSelection = [...prev];
                          sortedLeads.forEach(l => {
                            if (!newSelection.includes(l.id)) {
                              newSelection.push(l.id);
                            }
                          });
                          return newSelection;
                        });
                      } else {
                        setSelectedLeadIds(prev => prev.filter(id => !sortedLeads.some(l => l.id === id)));
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                  />
                </th>
                <th className="px-6 py-4">Lead Name</th>
                <th className="px-6 py-4">Contact Info</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Lead Score</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400 animate-pulse">Loading leads...</td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">No leads found matching your criteria.</td>
                </tr>
              ) : (
                sortedLeads.map((lead) => {
                  const scoreDetails = calculateLeadScore(lead);
                  const isSelected = selectedLeadIds.includes(lead.id);
                  return (
                    <tr key={lead.id} className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                      <td className="pl-6 pr-2 py-4 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedLeadIds(prev => 
                              prev.includes(lead.id) ? prev.filter(id => id !== lead.id) : [...prev, lead.id]
                            );
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          {lead.name}
                        </div>
                        
                        {/* Tags Pill Container */}
                        {lead.tags && lead.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lead.tags.map((tag, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700/80 border border-indigo-100/50"
                              >
                                <Tag className="w-2 h-2 text-indigo-400" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {lead.notes && (
                          <div className="text-[11px] text-slate-400 font-medium truncate max-w-[150px] mt-1" title={lead.notes}>
                            📝 {lead.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Phone className="w-3.5 h-3.5" /> {lead.phone}
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                            <Mail className="w-3.5 h-3.5" /> {lead.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 border border-slate-200">
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 cursor-pointer ${statusColors[lead.status]}`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Follow-up">Follow-up</option>
                          <option value="Enrolled">Enrolled</option>
                          <option value="Discarded">Discarded</option>
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${scoreDetails.color}`}>
                            {scoreDetails.score}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreDetails.badgeBg} ${scoreDetails.badgeText}`}>
                            {scoreDetails.level}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                        {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                      </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(lead)}
                          className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                          title="Edit Lead"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(lead.id)}
                          className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500 text-center sm:text-left flex justify-between items-center">
          Showing {sortedLeads.length} of {leads.length} total leads
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingLeadId ? 'Edit Lead' : 'Add New Lead'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="John Doe"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input 
                    type="tel" 
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0171..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Lead Source</label>
                <select 
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value as LeadSource })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="Facebook Ads">Facebook Ads</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="Youtube Ads">Youtube Ads</option>
                  <option value="Website Form">Website Form</option>
                  <option value="Direct">Direct</option>
                  <option value="Referral">Referral</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tags <span className="text-[11px] text-slate-400 font-normal">(comma-separated labels)</span>
                </label>
                <input 
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g. Study Abroad, High Intent, Referral"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Activity Notes</label>
                <textarea 
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm placeholder:text-slate-400"
                  placeholder="Record call summaries, applicant history, or follow-up notes here..."
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Course</label>
                  <select 
                    value={formData.targetCourse}
                    onChange={(e) => setFormData({ ...formData, targetCourse: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="IELTS Academic">IELTS Academic</option>
                    <option value="IELTS General">IELTS General</option>
                    <option value="Spoken English">Spoken English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Band</label>
                  <input 
                    type="number"
                    step="0.5" 
                    value={formData.targetBand}
                    onChange={(e) => setFormData({ ...formData, targetBand: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 7.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Country</label>
                  <select
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Australia">Australia</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="USA">USA</option>
                    <option value="Canada">Canada</option>
                    <option value="Others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Expected Pipeline Value ($)</label>
                  <input 
                    type="number" 
                    value={formData.expectedValue}
                    onChange={(e) => setFormData({ ...formData, expectedValue: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 500"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2 rounded-xl transition-colors border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl transition-colors shadow-sm"
                >
                  {editingLeadId ? 'Save Changes' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
