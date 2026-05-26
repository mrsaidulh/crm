import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { FileText, Plus, Trash2, Edit2, X, MessageSquare, Mail } from 'lucide-react';
import type { Template } from '../types';

export default function TemplatesView() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'Email' as 'Email' | 'SMS',
    subject: '',
    body: ''
  });

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/templates?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.templates) {
          setTemplates(data.templates);
        }
      })
      .catch(error => console.error('Error fetching templates:', error))
      .finally(() => setLoading(false));
  }, [userId]);

  const openAddModal = () => {
    setEditingTemplateId(null);
    setFormData({ name: '', type: 'Email', subject: '', body: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (template: Template) => {
    setEditingTemplateId(template.id);
    setFormData({ 
      name: template.name, 
      type: template.type, 
      subject: template.subject || '', 
      body: template.body 
    });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const templateData = {
      name: formData.name,
      type: formData.type,
      subject: formData.type === 'Email' ? formData.subject : null,
      body: formData.body,
    };

    try {
      if (editingTemplateId) {
        const response = await fetch(`/api/templates/${editingTemplateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
        if (response.ok) {
          const resData = await response.json();
          setTemplates(prev => prev.map(t => t.id === editingTemplateId ? resData.template : t));
        }
      } else {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...templateData,
            userId: userId
          })
        });
        if (response.ok) {
          const resData = await response.json();
          setTemplates(prev => [resData.template, ...prev]);
        }
      }
      closeModal();
    } catch (err) {
      console.error('Error saving template:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading templates...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Message Templates</h1>
          <p className="text-slate-500 text-sm mt-1">Create reusable email and SMS templates for your broadcast campaigns.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border-2 border-dashed border-slate-200">
            You haven't created any templates yet.
          </div>
        ) : (
          templates.map(template => (
            <div key={template.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${template.type === 'Email' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {template.type === 'Email' ? <Mail className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{template.name}</h3>
                    <p className="text-xs text-slate-500 uppercase font-medium">{template.type} Template</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditModal(template)} className="text-slate-400 hover:text-indigo-600"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(template.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="flex-1 bg-slate-50 p-3 rounded-xl text-sm text-slate-600 border border-slate-100">
                {template.type === 'Email' && (
                  <div className="font-medium text-slate-800 mb-2 border-b border-slate-200 pb-2">
                    <span className="text-slate-400 font-normal mr-2">Subject:</span>
                    {template.subject}
                  </div>
                )}
                <div className="line-clamp-4 whitespace-pre-wrap">{template.body}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingTemplateId ? 'Edit Template' : 'Add New Template'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Template Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Welcome Discount"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Email' | 'SMS' })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Email">Email</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>
              </div>

              {formData.type === 'Email' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject Line</label>
                  <input 
                    type="text" 
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Welcome to IELTS Revolution"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message Body</label>
                <textarea 
                  required
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  rows={6}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm font-mono"
                  placeholder="Hi {{name}},&#10;Thanks for your interest..."
                ></textarea>
                <p className="text-xs text-slate-500 mt-2">
                  Tip: You can use variables like {'{{name}}'} to personalize your messages when sending campaigns.
                </p>
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
                  {editingTemplateId ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
