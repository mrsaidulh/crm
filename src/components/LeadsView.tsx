import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Search, Plus, Filter, Mail, Phone, Edit2, Trash2, X, Download, ArrowUpDown, Tag, Globe, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { Lead, LeadStatus, LeadSource } from '../types';
import { calculateLeadScore } from '../utils/scoring';
import { triggerGlobalWebhook, triggerWorkflowAutomations, evaluateKeywordsTrigger } from '../utils/automation';
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
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Tag Manager States
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  
  // Bulk Tag Input States
  const [bulkTagToAdd, setBulkTagToAdd] = useState('');
  const [bulkTagToRemove, setBulkTagToRemove] = useState('');
  const [showBulkTagAdd, setShowBulkTagAdd] = useState(false);
  const [showBulkTagRemove, setShowBulkTagRemove] = useState(false);

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detectedCallingCode, setDetectedCallingCode] = useState('');
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

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    targetCourse: false,
    targetBand: false,
    destination: false
  });

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    phone: '',
    targetCourse: '',
    targetBand: '',
    destination: ''
  });

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'name': {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Full name is required";
        }
        if (trimmed.length < 3) {
          return "Name must be at least 3 characters";
        }
        if (trimmed.length > 50) {
          return "Name must be at most 50 characters";
        }
        if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
          return "Name can only contain letters, spaces, hyphens, and apostrophes";
        }
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2) {
          return "Please enter your full name (first and last)";
        }
        return "";
      }
      case 'email': {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Email address is required";
        }
        if (trimmed.length > 100) {
          return "Email address must be at most 100 characters";
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
          return "Please enter a valid email address (e.g., you@email.com)";
        }
        return "";
      }
      case 'phone': {
        const cleaned = value.replace(/[\s-]/g, '');
        if (!cleaned) {
          return "Phone number is required";
        }
        const numeric = cleaned.replace(/^\+/, '');
        if (numeric.startsWith('8801') && numeric.length === 13) {
          const withoutCc = numeric.slice(2);
          if (!/^01[3-9]\d{8}$/.test(withoutCc)) {
            return "Please enter a valid Bangladeshi mobile number";
          }
        } else if (numeric.startsWith('01') && numeric.length === 11) {
          if (!/^01[3-9]\d{8}$/.test(numeric)) {
            return "Please enter a valid Bangladeshi mobile number";
          }
        } else {
          return "Please enter an 11-digit or 13-digit Bangladeshi mobile number starting with 01 or 8801";
        }
        return "";
      }
      case 'targetCourse': {
        if (!value || value === "") {
          return "Please select a target course";
        }
        return "";
      }
      case 'targetBand': {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Target band is required";
        }
        const num = parseFloat(trimmed);
        if (isNaN(num) || num < 6.0 || num > 9.0) {
          return "Band score must be between 6.0 and 9.0";
        }
        if (!/^([6-8](\.[05])?|9(\.0)?)$/.test(trimmed)) {
          return "Band score must be in 0.5 increments (e.g., 6.0, 6.5, 7.0)";
        }
        return "";
      }
      case 'destination': {
        if (!value || value === "") {
          return "Please select a target country";
        }
        return "";
      }
      default:
        return "";
    }
  };

  useEffect(() => {
    setErrors({
      name: validateField('name', formData.name),
      email: validateField('email', formData.email),
      phone: validateField('phone', formData.phone),
      targetCourse: validateField('targetCourse', formData.targetCourse),
      targetBand: validateField('targetBand', formData.targetBand),
      destination: validateField('destination', formData.destination)
    });
  }, [formData]);

  const handleInputChange = (field: 'name' | 'email' | 'phone' | 'targetCourse' | 'targetBand' | 'destination', value: string) => {
    if (field === 'phone') {
      const formattedInput = value.replace(/[^0-9\s-]/g, '');
      setFormData(prev => ({ ...prev, phone: formattedInput }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleBlurField = (field: 'name' | 'email' | 'phone' | 'targetCourse' | 'targetBand' | 'destination') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    if (field === 'name' || field === 'email' || field === 'targetBand' || field === 'targetCourse' || field === 'destination') {
      setFormData(prev => ({ ...prev, [field]: prev[field].trim() }));
    } else if (field === 'phone') {
      let val = formData.phone.trim().replace(/[\s-]/g, '');
      if (val.startsWith('01') && val.length === 11) {
        setFormData(prev => ({ ...prev, phone: '88' + val }));
      } else if (val.startsWith('1') && val.length === 10) {
        setFormData(prev => ({ ...prev, phone: '880' + val }));
      }
    }
  };

  const getFieldStyles = (fieldName: 'name' | 'email' | 'phone' | 'targetCourse' | 'targetBand' | 'destination') => {
    const base = "w-full border rounded-xl px-4 py-2 text-sm focus:outline-none transition-all duration-200 text-slate-850";
    if (!touched[fieldName]) {
      return `${base} border-slate-200 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white`;
    }
    if (errors[fieldName]) {
      return `${base} border-red-400 bg-red-50/10 focus:ring-2 focus:ring-red-500/20 focus:border-red-500`;
    }
    return `${base} border-emerald-400 bg-emerald-50/10 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500`;
  };

  const isFormValid = 
    formData.name.trim() !== '' &&
    formData.email.trim() !== '' &&
    formData.phone.trim() !== '' &&
    formData.targetCourse.trim() !== '' &&
    formData.targetBand.trim() !== '' &&
    formData.destination.trim() !== '' &&
    !errors.name && 
    !errors.email && 
    !errors.phone && 
    !errors.targetCourse &&
    !errors.targetBand &&
    !errors.destination;

  const { user, isSuperAdmin } = useAuth();
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

  useEffect(() => {
    const detectCode = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          if (data.country_calling_code) {
            setDetectedCallingCode(data.country_calling_code);
            return;
          }
        }
      } catch (e) {
        console.warn('ipapi.co failed:', e);
      }
      try {
        const res = await fetch('https://ipinfo.io/json');
        if (res.ok) {
          const data = await res.json();
          const country = data.country;
          const map: Record<string, string> = {
            BD: '+880', US: '+1', CA: '+1', GB: '+44', AU: '+61', NZ: '+64', IE: '+353', IN: '+91'
          };
          if (country && map[country]) {
            setDetectedCallingCode(map[country]);
            return;
          }
        }
      } catch (e2) {
        console.warn('ipinfo.io failed:', e2);
      }
      setDetectedCallingCode('+880');
    };
    detectCode();
  }, []);

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
    if (!isSuperAdmin) {
      alert('Access Denied: Only a Super Admin is authorized to permanently delete leads.');
      return;
    }
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

  // Dynamic calculation of unique tags and counts
  const distinctTagsWithCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      if (l.tags && Array.isArray(l.tags)) {
        l.tags.forEach(t => {
          const trimmed = t.trim();
          if (trimmed) {
            counts[trimmed] = (counts[trimmed] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  const handleRenameTag = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew || trimmedNew === oldName) return;

    const leadsToUpdate = leads.filter(l => l.tags && l.tags.includes(oldName));
    if (leadsToUpdate.length === 0) return;

    setLoading(true);
    try {
      let updatedCount = 0;
      const updatedLeadsList = [...leads];

      for (const lead of leadsToUpdate) {
        const updatedTags = lead.tags!.map(t => t === oldName ? trimmedNew : t);
        const uniqueTags = Array.from(new Set(updatedTags));

        const response = await fetch(`/api/leads/${lead.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: uniqueTags })
        });

        if (response.ok) {
          const resJson = await response.json();
          const savedLead = resJson.lead;
          const idx = updatedLeadsList.findIndex(l => l.id === lead.id);
          if (idx !== -1) {
            updatedLeadsList[idx] = savedLead;
          }
          updatedCount++;
        }
      }

      setLeads(updatedLeadsList);
      logAuditEvent({
        action: 'Tag Renamed Globally',
        entityType: 'system',
        details: `Renamed tag "${oldName}" to "${trimmedNew}" across ${updatedCount} lead(s).`
      });
      alert(`Successfully renamed tag on ${updatedCount} lead(s).`);
    } catch (err) {
      console.error('Error renaming tag:', err);
      alert('Failed to rename tag completely.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    if (!confirm(`Are you sure you want to delete the tag "${tagName}" from all leads?`)) return;

    const leadsToUpdate = leads.filter(l => l.tags && l.tags.includes(tagName));
    if (leadsToUpdate.length === 0) {
      alert("No leads carried this tag.");
      return;
    }

    setLoading(true);
    try {
      let updatedCount = 0;
      const updatedLeadsList = [...leads];

      for (const lead of leadsToUpdate) {
        const updatedTags = lead.tags!.filter(t => t !== tagName);
        const response = await fetch(`/api/leads/${lead.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: updatedTags })
        });

        if (response.ok) {
          const resJson = await response.json();
          const savedLead = resJson.lead;
          const idx = updatedLeadsList.findIndex(l => l.id === lead.id);
          if (idx !== -1) {
            updatedLeadsList[idx] = savedLead;
          }
          updatedCount++;
        }
      }

      setLeads(updatedLeadsList);
      logAuditEvent({
        action: 'Tag Deleted Globally',
        entityType: 'system',
        details: `Deleted tag "${tagName}" from all ${updatedCount} lead(s).`
      });
      alert(`Successfully deleted tag from ${updatedCount} lead(s).`);
    } catch (err) {
      console.error('Error deleting tag:', err);
      alert('Failed to delete tag.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddTag = async (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed || selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const updatedLeadsList = [...leads];
      const promises = selectedLeadIds.map(async (id) => {
        const lead = leads.find(l => l.id === id);
        if (lead) {
          const currentTags = lead.tags || [];
          if (!currentTags.includes(trimmed)) {
            const newTags = [...currentTags, trimmed];
            const response = await fetch(`/api/leads/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: newTags })
            });
            if (response.ok) {
              const resJson = await response.json();
              const savedLead = resJson.lead;
              const idx = updatedLeadsList.findIndex(l => l.id === id);
              if (idx !== -1) {
                updatedLeadsList[idx] = savedLead;
              }
            }
          }
        }
      });
      await Promise.all(promises);
      setLeads(updatedLeadsList);

      logAuditEvent({
        action: 'Lead Bulk Tag Added',
        entityType: 'lead',
        details: `Added tag "${trimmed}" to ${selectedLeadIds.length} lead(s).`
      });

      setSelectedLeadIds([]);
      setBulkTagToAdd('');
      setShowBulkTagAdd(false);
      alert(`Tag "${trimmed}" successfully added to selected leads.`);
    } catch (e) {
      console.error('Error bulk adding tag:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRemoveTag = async (tagToRemove: string) => {
    const trimmed = tagToRemove.trim();
    if (!trimmed || selectedLeadIds.length === 0) return;
    try {
      setLoading(true);
      const updatedLeadsList = [...leads];
      const promises = selectedLeadIds.map(async (id) => {
        const lead = leads.find(l => l.id === id);
        if (lead) {
          const currentTags = lead.tags || [];
          if (currentTags.includes(trimmed)) {
            const newTags = currentTags.filter(t => t !== trimmed);
            const response = await fetch(`/api/leads/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tags: newTags })
            });
            if (response.ok) {
              const resJson = await response.json();
              const savedLead = resJson.lead;
              const idx = updatedLeadsList.findIndex(l => l.id === id);
              if (idx !== -1) {
                updatedLeadsList[idx] = savedLead;
              }
            }
          }
        }
      });
      await Promise.all(promises);
      setLeads(updatedLeadsList);

      logAuditEvent({
        action: 'Lead Bulk Tag Removed',
        entityType: 'lead',
        details: `Removed tag "${trimmed}" from ${selectedLeadIds.length} lead(s).`
      });

      setSelectedLeadIds([]);
      setBulkTagToRemove('');
      setShowBulkTagRemove(false);
      alert(`Tag "${trimmed}" successfully removed from selected leads.`);
    } catch (e) {
      console.error('Error bulk removing tag:', e);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingLeadId(null);
    setFormData({ 
      name: '', 
      email: '', 
      phone: detectedCallingCode || '+880', 
      source: 'Direct', 
      notes: '', 
      expectedValue: '', 
      targetCourse: 'IELTS Academic', 
      targetBand: '', 
      destination: 'United Kingdom',
      tags: ''
    });
    setTouched({
      name: false,
      email: false,
      phone: false,
      targetCourse: false,
      targetBand: false,
      destination: false
    });
    setErrors({
      name: '',
      email: '',
      phone: '',
      targetCourse: '',
      targetBand: '',
      destination: ''
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
    setTouched({
      name: false,
      email: false,
      phone: false,
      targetCourse: false,
      targetBand: false,
      destination: false
    });
    setErrors({
      name: '',
      email: '',
      phone: '',
      targetCourse: '',
      targetBand: '',
      destination: ''
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setTouched({
      name: true,
      email: true,
      phone: true,
      targetCourse: true,
      targetBand: true,
      destination: true
    });

    if (!isFormValid) {
      alert("Please resolve form validation parameters before submitting.");
      return;
    }

    setIsSubmitting(true);

    let finalPhone = formData.phone.trim().replace(/[\s-]/g, '');
    if (finalPhone.startsWith('01') && finalPhone.length === 11) {
      finalPhone = '88' + finalPhone;
    } else if (finalPhone.startsWith('1') && finalPhone.length === 10) {
      finalPhone = '880' + finalPhone;
    }

    try {
      const parsedTags = formData.tags 
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean) 
        : [];

      const baseData = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: finalPhone,
        source: formData.source,
        status: editingLeadId ? undefined : 'New', // Add status field 
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
           
           // Evaluate keywords trigger and update state accordingly
           const finalizedLead = await evaluateKeywordsTrigger(userId, savedLead);
           setLeads(prev => prev.map(l => l.id === editingLeadId ? finalizedLead : l));
           
           // If status changed in the edit, trigger status changed events
           const lead = leads.find(l => l.id === editingLeadId);
           if (lead && dataToSave.status && lead.status !== dataToSave.status) {
             const updatedLead = { ...lead, ...dataToSave, tags: finalizedLead.tags };
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
         } else {
           const errData = await response.json().catch(() => ({}));
           alert(`Error saving: ${errData.error || response.statusText}`);
           setIsSubmitting(false);
           return;
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
           
           // Evaluate keywords trigger and update state accordingly
           const finalizedLead = await evaluateKeywordsTrigger(userId, createdLead);
           setLeads(prev => [finalizedLead, ...prev]);
           
           // Dispatch automation trigger on lead creation
           triggerGlobalWebhook(userId, 'Lead Created', finalizedLead);
           triggerWorkflowAutomations(userId, 'Lead Created', 'New', finalizedLead);
  
           // Publish log event
           logAuditEvent({
             action: 'Lead Acquired',
             entityType: 'lead',
             entityId: finalizedLead.id,
             details: `Registered new student lead: "${finalizedLead.name}" via "${finalizedLead.source}".`
           });
        } else {
          const errData = await response.json().catch(() => ({}));
          alert(`Error creating: ${errData.error || response.statusText}`);
          setIsSubmitting(false);
          return;
        }
      }
      closeModal();
    } catch (err: any) {
      console.error('Error saving lead', err);
      alert(err.message || 'Error saving lead');
    } finally {
      setIsSubmitting(false);
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
    if (!isSuperAdmin) {
      alert('Access Denied: Only a Super Admin is authorized to permanently delete leads.');
      return;
    }
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

  // Find duplicates of Email
  const duplicateEmails = React.useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach(l => {
      const email = l.email?.trim().toLowerCase();
      if (email) {
        counts.set(email, (counts.get(email) || 0) + 1);
      }
    });
    return counts;
  }, [leads]);

  // Find duplicates of Phone
  const duplicatePhones = React.useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach(l => {
      const phone = l.phone?.trim().replace(/[\s-]/g, '');
      if (phone) {
        counts.set(phone, (counts.get(phone) || 0) + 1);
      }
    });
    return counts;
  }, [leads]);

  const isDuplicateEmail = (email?: string) => {
    if (!email) return false;
    const clean = email.trim().toLowerCase();
    return (duplicateEmails.get(clean) || 0) > 1;
  };

  const isDuplicatePhone = (phone?: string) => {
    if (!phone) return false;
    const clean = phone.trim().replace(/[\s-]/g, '');
    return (duplicatePhones.get(clean) || 0) > 1;
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(search.toLowerCase()) || 
                          lead.email.toLowerCase().includes(search.toLowerCase()) ||
                          lead.phone.includes(search) ||
                          (lead.tags && lead.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'All' || lead.source === sourceFilter;
    const matchesCountry = countryFilter === 'All' || lead.destination === countryFilter;
    
    if (showDuplicatesOnly) {
      const email = lead.email?.trim().toLowerCase();
      const phone = lead.phone?.trim().replace(/[\s-]/g, '');
      const hasDupEmail = email ? (duplicateEmails.get(email) || 0) > 1 : false;
      const hasDupPhone = phone ? (duplicatePhones.get(phone) || 0) > 1 : false;
      if (!hasDupEmail && !hasDupPhone) {
        return false;
      }
    }
    
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
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            title="Export leads to a CSV file"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Export Leads
          </button>
          <button 
            onClick={() => setIsTagManagerOpen(true)}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
            title="Open global CRM tag manager"
          >
            <Tag className="w-4 h-4 text-indigo-600 animate-pulse" />
            Tag Manager
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

            {/* Diagnostics / Duplicates Filter */}
            <button
              onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all duration-200 shadow-xs cursor-pointer ${
                showDuplicatesOnly 
                  ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
              title="Show only leads that have duplicate email or phone numbers"
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${showDuplicatesOnly ? 'text-white' : 'text-amber-500'}`} />
              {showDuplicatesOnly ? 'Duplicates Only' : 'Find Duplicates'}
            </button>
            
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

              {/* Bulk Tag addition */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBulkTagAdd(!showBulkTagAdd);
                    setShowBulkTagRemove(false);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <Tag className="w-3.5 h-3.5 text-indigo-500" />
                  + Add Tag
                </button>
                {showBulkTagAdd && (
                  <div className="absolute right-0 top-full mt-1.5 z-10 bg-white border border-slate-200 rounded-xl p-3 shadow-md w-56 flex flex-col gap-2">
                    <input
                      type="text"
                      className="border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 w-full"
                      placeholder="e.g. priority-lead"
                      value={bulkTagToAdd}
                      onChange={(e) => setBulkTagToAdd(e.target.value)}
                    />
                    <button
                      onClick={() => handleBulkAddTag(bulkTagToAdd)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1 text-[11px] font-bold"
                    >
                      Apply Tag
                    </button>
                  </div>
                )}
              </div>

              {/* Bulk Tag removal */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBulkTagRemove(!showBulkTagRemove);
                    setShowBulkTagAdd(false);
                  }}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <X className="w-3.5 h-3.5 text-red-500" />
                  - Remove Tag
                </button>
                {showBulkTagRemove && (
                  <div className="absolute right-0 top-full mt-1.5 z-10 bg-white border border-slate-200 rounded-xl p-3 shadow-md w-56 flex flex-col gap-2">
                    <input
                      type="text"
                      className="border border-slate-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 w-full"
                      placeholder="e.g. test-tag"
                      value={bulkTagToRemove}
                      onChange={(e) => setBulkTagToRemove(e.target.value)}
                    />
                    <button
                      onClick={() => handleBulkRemoveTag(bulkTagToRemove)}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-lg py-1 text-[11px] font-bold"
                    >
                      Remove Tag
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleBulkDelete}
                className="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>

              <button
                onClick={() => {
                  setSelectedLeadIds([]);
                  setShowBulkTagAdd(false);
                  setShowBulkTagRemove(false);
                }}
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
                sortedLeads.map((lead, idx) => {
                  const scoreDetails = calculateLeadScore(lead);
                  const isSelected = selectedLeadIds.includes(lead.id);
                  return (
                    <tr key={lead.id ? `${lead.id}-${idx}` : `lead-idx-${idx}`} className={`hover:bg-slate-50/50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
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
                                key={`${tag}-${idx}`} 
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
                            {lead.phoneVerified && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" title="Phone number verified via OTP" />
                            )}
                            {isDuplicatePhone(lead.phone) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Duplicate Phone Number detected">
                                Duplicate Phone
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-500 text-xs">
                            <Mail className="w-3.5 h-3.5" /> {lead.email}
                            {isDuplicateEmail(lead.email) && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Duplicate Email Address detected">
                                Duplicate Email
                              </span>
                            )}
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
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingLeadId ? 'Edit Lead' : 'Add New Lead'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  onBlur={() => handleBlurField('name')}
                  className={getFieldStyles('name')}
                  placeholder="John Doe"
                />
                {touched.name && errors.name && (
                  <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                    ⚠️ {errors.name}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input 
                    type="tel" 
                    required
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    onBlur={() => handleBlurField('phone')}
                    className={getFieldStyles('phone')}
                    placeholder="0171..."
                  />
                  {touched.phone && errors.phone && (
                    <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                      ⚠️ {errors.phone}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input 
                    type="email" 
                    required
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    onBlur={() => handleBlurField('email')}
                    className={getFieldStyles('email')}
                    placeholder="john@example.com"
                  />
                  {touched.email && errors.email && (
                    <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                      ⚠️ {errors.email}
                    </span>
                  )}
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
                    onChange={(e) => handleInputChange('targetCourse', e.target.value)}
                    onBlur={() => handleBlurField('targetCourse')}
                    className={getFieldStyles('targetCourse')}
                  >
                    <option value="">Select target course</option>
                    <option value="IELTS Academic">IELTS Academic</option>
                    <option value="IELTS General Training">IELTS General Training</option>
                    <option value="IELTS UKVI">IELTS UKVI</option>
                    <option value="IELTS Life Skills">IELTS Life Skills</option>
                  </select>
                  {touched.targetCourse && errors.targetCourse && (
                    <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                      ⚠️ {errors.targetCourse}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Band</label>
                  <input 
                    type="number"
                    step="0.5" 
                    min="6"
                    max="9"
                    value={formData.targetBand}
                    onChange={(e) => handleInputChange('targetBand', e.target.value)}
                    onBlur={() => handleBlurField('targetBand')}
                    className={getFieldStyles('targetBand')}
                    placeholder="e.g. 7.5"
                  />
                  {touched.targetBand && errors.targetBand && (
                    <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                      ⚠️ {errors.targetBand}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Country</label>
                  <select
                    value={formData.destination}
                    onChange={(e) => handleInputChange('destination', e.target.value)}
                    onBlur={() => handleBlurField('destination')}
                    className={getFieldStyles('destination')}
                  >
                    <option value="">Select target destination</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="USA">USA</option>
                    <option value="Canada">Canada</option>
                    <option value="Australia">Australia</option>
                    <option value="New Zealand">New Zealand</option>
                    <option value="Germany">Germany</option>
                    <option value="Ireland">Ireland</option>
                    <option value="Other">Other</option>
                  </select>
                  {touched.destination && errors.destination && (
                    <span role="alert" className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1">
                      ⚠️ {errors.destination}
                    </span>
                  )}
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
                  disabled={!isFormValid || isSubmitting}
                  className={`flex-1 font-medium py-2 rounded-xl transition-colors shadow-sm ${
                    isFormValid && !isSubmitting
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' 
                      : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? 'Saving...' : (editingLeadId ? 'Save Changes' : 'Create Lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Tag Manager Modal */}
      {isTagManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => {
            setIsTagManagerOpen(false);
            setEditingTag(null);
            setNewTagName('');
          }}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900 font-display">CRM Tag Manager</h2>
              </div>
              <button 
                onClick={() => {
                  setIsTagManagerOpen(false);
                  setEditingTag(null);
                  setNewTagName('');
                }} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-grow">
              <p className="text-slate-500 text-sm leading-relaxed">
                Globally manage CRM tags across all leads. You can rename tags to update all matching student profiles, filter leads, or delete tags permanently.
              </p>

              {distinctTagsWithCounts.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Tag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No tags found on active leads</p>
                  <p className="text-xs text-slate-400 mt-1">Tags can be entered comma-separated when editing or adding student leads.</p>
                </div>
              ) : (
                <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {distinctTagsWithCounts.map(({ name, count }, idx) => {
                    const isBeingEdited = editingTag === name;
                    return (
                      <div key={`${name || 'tag'}-${idx}`} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                        {isBeingEdited ? (
                          <div className="flex items-center gap-2 w-full animate-in fade-in duration-150">
                            <input
                              type="text"
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              className="flex-grow border border-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="New tag label..."
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                handleRenameTag(name, newTagName);
                                setEditingTag(null);
                                setNewTagName('');
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingTag(null);
                                setNewTagName('');
                              }}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5">
                              <span className="bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-lg text-xs border border-indigo-100/50">
                                {name}
                              </span>
                              <span className="text-xs text-slate-400 font-medium font-mono">
                                {count} lead{count === 1 ? '' : 's'}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setSearch(name);
                                  setIsTagManagerOpen(false);
                                }}
                                className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 text-slate-400 rounded-lg transition-colors"
                                title="Filter leads by this tag"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTag(name);
                                  setNewTagName(name);
                                }}
                                className="p-1.5 hover:bg-slate-100 hover:text-slate-700 text-slate-400 rounded-lg transition-colors"
                                title="Rename tag globally"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTag(name)}
                                className="p-1.5 hover:bg-red-50 hover:text-red-600 text-slate-400 rounded-lg transition-colors"
                                title="Delete tag globally from all leads"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 text-center flex-shrink-0 font-medium">
              💡 Tip: Click search icon to instantly filter the leads list by that tag category
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
