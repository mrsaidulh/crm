import React, { useState, useEffect } from 'react';
import { format, isBefore, startOfDay, addDays } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import { CheckSquare, Circle, MoreHorizontal, Calendar, Search, Plus, Trash2, Edit2, AlertCircle, Phone, MessageSquare, Briefcase, User, Bell, Send, X } from 'lucide-react';
import type { Task, Lead, TeamMember } from '../types';
import { triggerGlobalWebhook } from '../utils/automation';
import { logAuditEvent } from '../utils/auditLogger';


export default function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (selectedTaskForDetails) {
      const updatedTask = tasks.find(t => t.id === selectedTaskForDetails.id);
      if (updatedTask) {
        setSelectedTaskForDetails(updatedTask);
      }
    }
  }, [tasks, selectedTaskForDetails]);
  
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    leadId: string;
    dueDate: string;
    taskType: 'General' | 'Call' | 'Email' | 'Meeting';
    assignee: string;
    reminderDate: string;
  }>({
    title: '',
    description: '',
    leadId: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    taskType: 'General',
    assignee: '',
    reminderDate: ''
  });

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  const fetchAllData = async () => {
    try {
      const leadsRes = await fetch(`/api/leads?userId=${encodeURIComponent(userId)}`);
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        if (data.leads) setLeads(data.leads);
      }
      
      const teamRes = await fetch(`/api/team-members?userId=${encodeURIComponent(userId)}`);
      if (teamRes.ok) {
        const data = await teamRes.json();
        if (data.teamMembers) setTeamMembers(data.teamMembers);
      }
      
      const tasksRes = await fetch(`/api/tasks?userId=${encodeURIComponent(userId)}`);
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        if (data.tasks) {
          const fbTasks = data.tasks;
          fbTasks.sort((a: any, b: any) => a.dueDate - b.dueDate);
          setTasks(fbTasks);
        }
      }
    } catch (err) {
      console.error('[fetchAllData] failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [userId]);

  const handleStatusChange = async (task: Task) => {
    const newStatus = task.status === 'Pending' ? 'Completed' : 'Pending';
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
        logAuditEvent({
          action: newStatus === 'Completed' ? 'Task Completed' : 'Task Reopened',
          entityType: 'task',
          entityId: task.id,
          details: `Task "${task.title}" associated with lead "${task.leadName || 'Unknown'}" was marked as ${newStatus.toLowerCase()}.`
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDetails || !newCommentText.trim()) return;

    setSubmittingComment(true);
    try {
      const authorName = user?.email || 'CRM User';
      const newComment = {
        id: Math.random().toString(36).substring(7),
        text: newCommentText.trim(),
        createdAt: Date.now(),
        authorName
      };

      const updatedComments = [...(selectedTaskForDetails.comments || []), newComment];

      const response = await fetch(`/api/tasks/${selectedTaskForDetails.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments: updatedComments })
      });

      if (response.ok) {
        setTasks(prev => prev.map(t => t.id === selectedTaskForDetails.id ? { ...t, comments: updatedComments } : t));
        setSelectedTaskForDetails(prev => prev ? { ...prev, comments: updatedComments } : null);
        setNewCommentText('');
      }
    } catch (err) {
      console.error('Error adding comment to task:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const openAddModal = () => {
    setEditingTaskId(null);
    setFormData({ title: '', description: '', leadId: '', dueDate: format(new Date(), 'yyyy-MM-dd'), taskType: 'General', assignee: '', reminderDate: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTaskId(task.id);
    setFormData({ 
      title: task.title, 
      description: task.description || '',
      leadId: task.leadId, 
      dueDate: format(new Date(task.dueDate), 'yyyy-MM-dd'),
      taskType: task.taskType || 'General',
      assignee: task.assignee || '',
      reminderDate: task.reminderDate ? format(new Date(task.reminderDate), 'yyyy-MM-dd') : ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const leadName = leads.find(l => l.id === formData.leadId)?.name || 'Unknown Lead';
    
    // Convert yyyy-mm-dd string to midnight timestamp
    const dateObj = new Date(formData.dueDate);
    const timeMs = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);

    const parsedReminderMs = formData.reminderDate 
      ? new Date(formData.reminderDate).getTime() + (new Date(formData.reminderDate).getTimezoneOffset() * 60000)
      : null;

    try {
      const taskData: any = {
        title: formData.title,
        description: formData.description,
        leadId: formData.leadId,
        leadName,
        dueDate: timeMs,
        taskType: formData.taskType,
        assignee: formData.assignee,
        comments: editingTaskId ? (tasks.find(t => t.id === editingTaskId)?.comments || []) : []
      };

      if (parsedReminderMs) {
        taskData.reminderDate = parsedReminderMs;
      } else {
        taskData.reminderDate = null;
      }

      if (editingTaskId) {
        const response = await fetch(`/api/tasks/${editingTaskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(taskData)
        });
        if (response.ok) {
          const resData = await response.json();
          const savedTask = resData.task;
          setTasks(prev => prev.map(t => t.id === editingTaskId ? savedTask : t));
          
          if (taskData.reminderDate) {
            triggerGlobalWebhook(userId, 'Task Reminder', savedTask);
          }

          // Publish log event
          logAuditEvent({
            action: 'Task Updated',
            entityType: 'task',
            entityId: editingTaskId,
            details: `Updated details for task "${taskData.title}" (assigned: ${taskData.assignee || 'None'}).`
          });
        }
      } else {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...taskData,
            userId: userId
          })
        });
        if (response.ok) {
          const resData = await response.json();
          const createdTask = resData.task;
          setTasks(prev => [createdTask, ...prev].sort((a, b) => a.dueDate - b.dueDate));
          
          if (taskData.reminderDate) {
            triggerGlobalWebhook(userId, 'Task Reminder', createdTask);
          }

          // Publish log event
          logAuditEvent({
            action: 'Task Created',
            entityType: 'task',
            entityId: createdTask.id,
            details: `Created task "${createdTask.title}" for lead "${createdTask.leadName}" (${createdTask.taskType}).`
          });
        }
      }
      setIsModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const task = tasks.find(t => t.id === id);
      const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
        // Publish log event
        logAuditEvent({
          action: 'Task Deleted',
          entityType: 'task',
          entityId: id,
          details: `Deleted task "${task?.title || 'Unknown'}" permanently.`
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'Pending');
  const completedTasks = tasks.filter(t => t.status === 'Completed');

  const today = startOfDay(new Date());

  const reminderAlerts = pendingTasks.filter(task => {
    if (!task.reminderDate) return false;
    const reminderDay = startOfDay(new Date(task.reminderDate));
    return isBefore(reminderDay, addDays(today, 1)); // today or past
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Tasks & Follow-ups</h1>
          <p className="text-slate-500 text-sm mt-1">Manage calls, emails, and meetings for the sales team.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {/* Daily Reminders Action Center */}
      {reminderAlerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-4 shadow-sm animate-in slide-in-from-top duration-300">
          <div className="bg-amber-100 text-amber-800 p-2.5 rounded-xl self-start">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-900">Task Reminders Triggered Today ({reminderAlerts.length})</h3>
            <p className="text-xs text-amber-700 mt-0.5">Please take action on these high priority leads follow-ups immediately:</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {reminderAlerts.map(alert => (
                <div key={alert.id} className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-amber-100 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900">{alert.title}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">Lead: {alert.leadName || 'N/A'}</span>
                  </div>
                  <span className="text-[9px] font-extrabold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md uppercase">
                    Due {format(new Date(alert.dueDate), 'MMM d')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Upcoming & Overdue</h2>
          {loading ? (
             <div className="text-slate-500 p-4 border border-slate-200 rounded-xl bg-white shadow-sm animate-pulse">Loading tasks...</div>
          ) : pendingTasks.length === 0 ? (
             <div className="text-slate-400 p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-sm bg-slate-50/50">
               No pending tasks. You're all caught up!
             </div>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map(task => {
                const isOverdue = isBefore(new Date(task.dueDate), today);
                const isToday = task.dueDate === today.getTime();
                let dateColor = 'text-slate-500';
                if (isOverdue) dateColor = 'text-red-500 font-semibold';
                else if (isToday) dateColor = 'text-amber-600 font-semibold';
                
                const TypeIcon = task.taskType === 'Meeting' ? Briefcase : task.taskType === 'Call' ? Phone : task.taskType === 'Email' ? MessageSquare : CheckSquare;

                return (
                  <div 
                    key={task.id} 
                    onClick={() => {
                      setSelectedTaskForDetails(task);
                      setIsDetailsModalOpen(true);
                    }}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start gap-4 hover:border-indigo-200 transition-colors group cursor-pointer"
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(task);
                      }}
                      className="mt-0.5 text-slate-300 hover:text-emerald-500 transition-colors shrink-0"
                      title="Mark as completed"
                    >
                      <Circle className="w-6 h-6" />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                           <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg">
                             <TypeIcon className="w-4 h-4" />
                           </div>
                           <h3 className="font-semibold text-slate-900 text-sm">{task.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(task);
                            }} 
                            className="text-slate-400 hover:text-indigo-600"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(task.id);
                            }} 
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      {task.description && <p className="mt-1 text-slate-600 text-xs line-clamp-2 pr-8">{task.description}</p>}
                      
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium">
                        <span className={`flex items-center gap-1.5 ${dateColor}`}>
                           {isOverdue && <AlertCircle className="w-3.5 h-3.5" />}
                           {!isOverdue && <Calendar className="w-3.5 h-3.5" />}
                           {isToday ? 'Today' : isOverdue ? 'Overdue: ' + format(task.dueDate, 'MMM d') : format(task.dueDate, 'MMM d, yyyy')}
                        </span>

                        {task.reminderDate && (
                          <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md">
                            <Bell className="w-3 h-3 text-amber-500" />
                            Reminder set: {format(new Date(task.reminderDate), 'MMM d')}
                          </span>
                        )}
                        
                        {task.leadName && (
                          <span className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Lead: {task.leadName}
                          </span>
                        )}

                        {task.assignee && (
                          <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            <User className="w-3 h-3" /> Assigned to: {teamMembers.find(t => t.id === task.assignee)?.name || 'Unknown'}
                          </span>
                        )}

                        {task.comments && task.comments.length > 0 && (
                          <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 font-semibold shadow-2xs">
                            <MessageSquare className="w-3 h-3 text-emerald-500" />
                            {task.comments.length} note{task.comments.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Completed</h2>
          <div className="space-y-3">
             {completedTasks.length === 0 ? (
               <p className="text-xs text-slate-400">No completed tasks yet.</p>
             ) : (
                completedTasks.map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => {
                      setSelectedTaskForDetails(task);
                      setIsDetailsModalOpen(true);
                    }}
                    className="flex items-start gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(task);
                      }} 
                      className="text-emerald-500 mt-0.5 shrink-0" 
                      title="Reopen task"
                    >
                      <CheckSquare className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-500 line-through truncate group-hover:text-slate-950 transition-colors flex items-center justify-between gap-2">
                        <span>{task.title}</span>
                        {task.comments && task.comments.length > 0 && (
                          <span className="flex items-center gap-1 text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold shrink-0">
                            <MessageSquare className="w-2.5 h-2.5 text-emerald-500" /> {task.comments.length}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">For {task.leadName}</p>
                    </div>
                  </div>
                ))
             )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingTaskId ? 'Edit Task' : 'Add New Task'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Task Title</label>
                <input 
                  type="text" 
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Discuss course syllabus"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
                <div className="flex gap-2">
                  {['General', 'Call', 'Meeting', 'Email'].map((type) => (
                    <label key={type} className="flex-1 cursor-pointer">
                      <input 
                        type="radio" 
                        name="taskType" 
                        value={type} 
                        checked={formData.taskType === type}
                        onChange={(e) => setFormData({ ...formData, taskType: e.target.value as any })}
                        className="sr-only"
                      />
                      <div className={`text-center py-2 px-3 border rounded-xl text-xs font-medium transition-colors ${formData.taskType === type ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {type}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description (Optional)</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                  placeholder="Details about this task..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Related Lead</label>
                  <select 
                    required
                    value={formData.leadId}
                    onChange={(e) => setFormData({ ...formData, leadId: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="" disabled>Select a lead</option>
                    {leads.map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Assignee (Optional)</label>
                  <select 
                    value={formData.assignee}
                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Due Date</label>
                  <input 
                    type="date" 
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Reminder Date (Optional)</label>
                  <input 
                    type="date" 
                    value={formData.reminderDate}
                    onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2 rounded-xl transition-colors border border-slate-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl transition-colors shadow-sm"
                >
                  {editingTaskId ? 'Save' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isDetailsModalOpen && selectedTaskForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" 
            onClick={() => {
              setIsDetailsModalOpen(false);
              setSelectedTaskForDetails(null);
            }}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col md:flex-row max-h-[90vh]">
            
            {/* Left Info Panel */}
            <div className="flex-1 p-6 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto max-h-[40vh] md:max-h-full">
              <div className="flex items-start justify-between gap-4 mb-4 animate-in fade-in">
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold leading-none ${
                    selectedTaskForDetails.status === 'Completed' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                      : 'bg-amber-50 text-amber-700 border border-amber-100'
                  }`}>
                    {selectedTaskForDetails.status}
                  </span>
                  
                  <span className="ml-2 inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                    {selectedTaskForDetails.taskType || 'General'}
                  </span>
                </div>
                
                {/* Close for mobile, but visible always */}
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    setSelectedTaskForDetails(null);
                  }}
                  className="md:hidden text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h2 className="text-xl font-display font-bold text-slate-900 leading-tight">
                {selectedTaskForDetails.title}
              </h2>

              {selectedTaskForDetails.description ? (
                <div className="mt-4 bg-slate-50/70 rounded-xl p-3 border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 tracking-wide mb-1 uppercase text-slate-400">Description</h4>
                  <p className="text-slate-700 text-sm whitespace-pre-line leading-relaxed">
                    {selectedTaskForDetails.description}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-slate-400 text-xs italic">No description provided for this task.</p>
              )}

              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-bold text-slate-400 tracking-wide border-b border-slate-100 pb-1 mb-2 uppercase text-slate-400">Metadata Details</h4>
                
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-500 font-medium">Due Date:</span>
                  <span className={`font-semibold ${
                    isBefore(new Date(selectedTaskForDetails.dueDate), startOfDay(new Date())) && selectedTaskForDetails.status === 'Pending'
                      ? 'text-red-600 font-bold'
                      : 'text-slate-800'
                  }`}>
                    {format(new Date(selectedTaskForDetails.dueDate), 'MMMM d, yyyy')}
                  </span>
                </div>

                {selectedTaskForDetails.reminderDate && (
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-500 font-medium">Reminder Scheduled:</span>
                    <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100 flex items-center gap-1 text-xs">
                      <Bell className="w-3.5 h-3.5 text-amber-500" />
                      {format(new Date(selectedTaskForDetails.reminderDate), 'MMMM d, yyyy')}
                    </span>
                  </div>
                )}

                {selectedTaskForDetails.leadName && (
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-500 font-medium">Related Lead:</span>
                    <span className="text-slate-850 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md text-xs">
                      {selectedTaskForDetails.leadName}
                    </span>
                  </div>
                )}

                {selectedTaskForDetails.assignee && (
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-500 font-medium">Assignee:</span>
                    <span className="text-indigo-700 font-semibold bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 text-xs flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-500 hover:scale-105 transition-transform" />
                      {teamMembers.find(t => t.id === selectedTaskForDetails.assignee)?.name || 'Unknown Team Member'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Comments Panel */}
            <div className="w-full md:w-[380px] bg-slate-50/50 p-6 flex flex-col justify-between max-h-[50vh] md:max-h-full overflow-hidden">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-150 shrink-0">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Comments & Notes</h3>
                  <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold">
                    {(selectedTaskForDetails.comments || []).length}
                  </span>
                </div>
                
                {/* Close modal for master desktop layout */}
                <button 
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    setSelectedTaskForDetails(null);
                  }}
                  className="hidden md:block text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Comments Timeline Flow */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 min-h-[150px] max-h-[280px]">
                {(!selectedTaskForDetails.comments || selectedTaskForDetails.comments.length === 0) ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <div className="bg-white border border-slate-200 p-3 rounded-full text-slate-400 mb-2 shadow-xs">
                      <MessageSquare className="w-5 h-5 text-indigo-400" />
                    </div>
                    <p className="text-xs font-semibold text-slate-600">No notes yet</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-normal">
                      Log task updates, call notes, or follow-up feedback below with status safety.
                    </p>
                  </div>
                ) : (
                  [...selectedTaskForDetails.comments]
                    .sort((a, b) => b.createdAt - a.createdAt) // Latest first inside feed
                    .map((comment) => {
                      const initial = comment.authorName ? comment.authorName.charAt(0).toUpperCase() : 'U';
                      return (
                        <div key={comment.id} className="bg-white border border-slate-150 rounded-xl p-3 shadow-2xs hover:border-slate-350 transition-colors">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="bg-slate-200 text-slate-700 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border border-slate-300">
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-705 truncate" title={comment.authorName}>
                                {comment.authorName}
                              </p>
                              <p className="text-[9px] text-slate-400">
                                {format(new Date(comment.createdAt), 'MMM d, h:mm a')}
                              </p>
                            </div>
                          </div>
                          <p className="text-slate-600 text-xs whitespace-pre-wrap leading-relaxed pl-1 pt-0.5">
                            {comment.text}
                          </p>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleAddComment} className="mt-auto shrink-0 pt-2 border-t border-slate-150">
                <div className="relative">
                  <textarea
                    rows={2}
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Add feedback, call notes, updates..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 pr-10 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-white placeholder-slate-400 text-slate-850"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newCommentText.trim()}
                    className="absolute right-2 bottom-3 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-55 shadow-sm"
                    title="Press Enter to post"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[9px] text-slate-450 mt-1 pl-1 text-right italic font-mono">
                  Press Enter to post, Shift+Enter for newline
                </div>
              </form>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
