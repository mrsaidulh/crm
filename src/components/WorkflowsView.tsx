import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Power, Zap } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { WorkflowRule, LeadStatus, Template } from '../types';

export default function WorkflowsView() {
  const [workflows, setWorkflows] = useState<WorkflowRule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    triggerEvent: 'Lead Created' | 'Lead Status Changed';
    triggerCondition: string;
    actionType: 'Send SMS' | 'Send Email' | 'Create Task' | 'Trigger n8n Webhook';
    actionTemplateId: string;
    taskTitle: string;
    n8nWebhookUrl: string;
  }>({
    name: '',
    triggerEvent: 'Lead Created',
    triggerCondition: '',
    actionType: 'Send Email',
    actionTemplateId: '',
    taskTitle: '',
    n8nWebhookUrl: ''
  });

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    setLoading(true);
    const fetchWorkflowsAndTemplates = async () => {
      try {
        const workflowsRes = await fetch(`/api/workflows?userId=${encodeURIComponent(userId)}`);
        if (workflowsRes.ok) {
          const wData = await workflowsRes.json();
          if (wData.workflows) setWorkflows(wData.workflows);
        }
        
        const templatesRes = await fetch(`/api/templates?userId=${encodeURIComponent(userId)}`);
        if (templatesRes.ok) {
          const tData = await templatesRes.json();
          if (tData.templates) setTemplates(tData.templates);
        }
      } catch (err) {
        console.error('Error fetching automated workflow configs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkflowsAndTemplates();
  }, [userId]);

  const openAddModal = () => {
    setEditingWorkflowId(null);
    setFormData({
      name: '',
      triggerEvent: 'Lead Created',
      triggerCondition: '',
      actionType: 'Send Email',
      actionTemplateId: '',
      taskTitle: '',
      n8nWebhookUrl: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (workflow: WorkflowRule) => {
    setEditingWorkflowId(workflow.id);
    setFormData({
      name: workflow.name,
      triggerEvent: workflow.triggerEvent,
      triggerCondition: workflow.triggerCondition || '',
      actionType: workflow.actionType,
      actionTemplateId: workflow.actionTemplateId || '',
      taskTitle: workflow.taskTitle || '',
      n8nWebhookUrl: workflow.n8nWebhookUrl || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const dataToSave = {
        name: formData.name,
        triggerEvent: formData.triggerEvent,
        actionType: formData.actionType,
        isActive: true,
        ...(formData.triggerEvent === 'Lead Status Changed' ? { triggerCondition: formData.triggerCondition || 'New' } : {}),
        ...(formData.actionType === 'Create Task' ? { taskTitle: formData.taskTitle } : {}),
        ...(formData.actionType === 'Trigger n8n Webhook' ? { n8nWebhookUrl: formData.n8nWebhookUrl } : {}),
        ...((formData.actionType === 'Send SMS' || formData.actionType === 'Send Email') ? { actionTemplateId: formData.actionTemplateId } : {}),
      };

      if (editingWorkflowId) {
        const response = await fetch(`/api/workflows/${editingWorkflowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave)
        });
        if (response.ok) {
          const resData = await response.json();
          setWorkflows(prev => prev.map(w => w.id === editingWorkflowId ? resData.workflow : w));
        }
      } else {
        const response = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...dataToSave,
            userId: userId
          })
        });
        if (response.ok) {
          const resData = await response.json();
          setWorkflows(prev => [resData.workflow, ...prev]);
        }
      }
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      const response = await fetch(`/api/workflows/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setWorkflows(prev => prev.filter(w => w.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (workflow: WorkflowRule) => {
    const nextActiveState = !workflow.isActive;
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActiveState })
      });
      if (response.ok) {
        setWorkflows(prev => prev.map(w => w.id === workflow.id ? { ...w, isActive: nextActiveState } : w));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const statusOptions: LeadStatus[] = ['New', 'Contacted', 'Follow-up', 'Consultation Booked', 'Counseling Done', 'Demo Class', 'Payment Pending', 'Enrolled', 'Discarded'];

  if (loading) return <div className="p-8 text-center text-slate-500">Loading workflows...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900">Workflow Automation</h2>
          <p className="text-slate-500 mt-1">Automate routine tasks like sending emails and SMS.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Workflow
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map(workflow => (
          <div key={workflow.id} className={`bg-white p-6 rounded-2xl shadow-sm border ${workflow.isActive ? 'border-indigo-100' : 'border-slate-200'} relative`}>
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 p-2.5 rounded-xl">
                <Zap className={`w-5 h-5 ${workflow.isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              </div>
              <button 
                onClick={() => toggleStatus(workflow)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${workflow.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
              >
                <Power className="w-3 h-3" />
                {workflow.isActive ? 'Active' : 'Paused'}
              </button>
            </div>
            
            <h3 className="font-semibold text-slate-900 mb-1">{workflow.name}</h3>
            
            <div className="space-y-3 mt-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">When</span>
                <span className="font-medium text-slate-900">
                  {workflow.triggerEvent}
                  {workflow.triggerEvent === 'Lead Status Changed' && (
                    <span className="text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded text-xs ml-2 border border-indigo-100">
                      is {workflow.triggerCondition}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Then</span>
                <span className="font-medium text-slate-900 flex flex-wrap gap-2 items-center">
                  {workflow.actionType}
                  {workflow.actionType === 'Create Task' ? (
                    <span className="text-slate-600 text-xs italic">"{workflow.taskTitle}"</span>
                  ) : workflow.actionType === 'Trigger n8n Webhook' ? (
                    <span className="text-emerald-700 text-xs font-mono max-w-[200px] truncate bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg" title={workflow.n8nWebhookUrl}>
                      {workflow.n8nWebhookUrl}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-xs italic">
                      "{templates.find(t => t.id === workflow.actionTemplateId)?.name || 'Unknown Template'}"
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button onClick={() => openEditModal(workflow)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(workflow.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {workflows.length === 0 && (
          <div className="col-span-full border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
            <Zap className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No active workflows</h3>
            <p className="text-slate-500 max-w-sm mx-auto mb-6">Create automated rules to send emails, SMS, or create tasks when leads take action.</p>
            <button onClick={openAddModal} className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create First Rule
            </button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-600" />
                {editingWorkflowId ? 'Edit Workflow' : 'Create Workflow'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Rule Name</label>
                <input 
                  type="text" 
                  required 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" 
                  placeholder="e.g. Welcome new lead" 
                />
              </div>
              
              <div className="p-4 bg-slate-50 rounded-xl space-y-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded uppercase">When</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">This event happens</label>
                  <select 
                    value={formData.triggerEvent} 
                    onChange={e => setFormData({...formData, triggerEvent: e.target.value as any})} 
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    <option value="Lead Created">A New Lead is Created</option>
                    <option value="Lead Status Changed">Lead Status Changes</option>
                  </select>
                </div>
                {formData.triggerEvent === 'Lead Status Changed' && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">To this status</label>
                    <select 
                      required 
                      value={formData.triggerCondition} 
                      onChange={e => setFormData({...formData, triggerCondition: e.target.value})} 
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                    >
                      <option value="">Select status...</option>
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl space-y-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded uppercase">Then</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Do this action</label>
                  <select 
                    value={formData.actionType} 
                    onChange={e => setFormData({...formData, actionType: e.target.value as any})} 
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                  >
                    <option value="Send Email">Send Email</option>
                    <option value="Send SMS">Send SMS</option>
                    <option value="Create Task">Create Follow-up Task</option>
                    <option value="Trigger n8n Webhook">Trigger n8n Webhook</option>
                  </select>
                </div>
                
                <div className="animate-in fade-in slide-in-from-top-2">
                  {formData.actionType === 'Create Task' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Task Title</label>
                      <input 
                        type="text" 
                        required 
                        value={formData.taskTitle} 
                        onChange={e => setFormData({...formData, taskTitle: e.target.value})} 
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" 
                        placeholder="e.g. Call this lead ASAP" 
                      />
                    </div>
                  ) : formData.actionType === 'Trigger n8n Webhook' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">n8n Webhook URL</label>
                      <input 
                        type="url" 
                        required 
                        value={formData.n8nWebhookUrl} 
                        onChange={e => setFormData({...formData, n8nWebhookUrl: e.target.value})} 
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" 
                        placeholder="https://n8n.yourdomain.com/webhook/..." 
                      />
                      <p className="text-xs text-indigo-600 mt-1.5 font-medium">👉 This URL gets triggered with complete lead context when the event fires.</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Select Template</label>
                      <select 
                        required 
                        value={formData.actionTemplateId} 
                        onChange={e => setFormData({...formData, actionTemplateId: e.target.value})} 
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                      >
                        <option value="">Choose a template...</option>
                        {templates.filter(t => t.type === (formData.actionType === 'Send SMS' ? 'SMS' : 'Email')).map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {templates.filter(t => t.type === (formData.actionType === 'Send SMS' ? 'SMS' : 'Email')).length === 0 && (
                        <p className="text-xs text-red-500 mt-2">You need to create a {formData.actionType === 'Send SMS' ? 'SMS' : 'Email'} template first.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-white hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl border border-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl shadow-sm transition-colors">
                  {editingWorkflowId ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
