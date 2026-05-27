import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Calendar, Clock, Edit2, MessageSquare, Plus, Save, CheckSquare, Briefcase, Circle, Award } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { format, isBefore, startOfDay } from 'date-fns';
import type { Lead, Communication, Preferences, Task } from '../types';
import { calculateLeadScore } from '../utils/scoring';

interface Props {
  customer: Lead;
  onClose: () => void;
}

export default function CustomerProfileModal({ customer, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'communications' | 'preferences' | 'tasks'>('overview');
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preferencesForm, setPreferencesForm] = useState<Preferences>(
    customer.preferences || { preferredContactMethod: 'Phone', studyMode: 'Hybrid', timeline: 'Unknown' }
  );
  
  const [showAddComm, setShowAddComm] = useState(false);
  const [commForm, setCommForm] = useState({ type: 'Note', summary: '' });

  const { user } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  useEffect(() => {
    fetch(`/api/tasks?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.tasks) {
          const leadTasks = data.tasks.filter((t: any) => t.leadId === customer.id);
          leadTasks.sort((a: any, b: any) => a.dueDate - b.dueDate);
          setTasks(leadTasks);
        }
      })
      .catch(err => console.error('[Tasks Fetch] error:', err));
  }, [customer.id, userId]);

  const handleSavePreferences = async () => {
    try {
      await fetch(`/api/leads/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: preferencesForm
        })
      });
      setIsEditingPreferences(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddCommunication = async () => {
    if (!commForm.summary.trim()) return;
    try {
      const newComm: Communication = {
        id: Math.random().toString(36).substring(7),
        type: commForm.type as any,
        date: Date.now(),
        summary: commForm.summary
      };
      
      const updatedComms = [...(customer.communications || []), newComm].sort((a, b) => b.date - a.date);
      
      await fetch(`/api/leads/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communications: updatedComms
        })
      });
      
      setShowAddComm(false);
      setCommForm({ type: 'Note', summary: '' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-6 border-b border-slate-100 flex items-start justify-between bg-slate-50">
          <div className="flex gap-4 items-center">
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-bold">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
              <div className="flex gap-3 text-sm text-slate-500 mt-1">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {customer.email || 'No email'}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.phone || 'No phone'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 mt-2 overflow-x-auto">
          {['overview', 'communications', 'tasks', 'preferences'].map((tab) => (
            <button
              key={tab}
              className={`px-4 py-3 text-sm font-semibold capitalize border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => setActiveTab(tab as any)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* TAB: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" /> Key Details
                </h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Status</span>
                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-800 font-medium text-xs">
                      {customer.status}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Source</span>
                    <span className="font-medium text-slate-900">{customer.source}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Joined Date</span>
                    <span className="font-medium text-slate-900">{format(customer.createdAt, 'MMM d, yyyy')}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Expected Value</span>
                    <span className="font-medium text-emerald-600">${customer.expectedValue?.toLocaleString() || '0'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Target Course</span>
                    <span className="font-medium text-slate-900">{customer.targetCourse || 'Unspecified'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">Target Band</span>
                    <span className="font-medium text-slate-900">{customer.targetBand || 'TBD'}</span>
                  </div>
                </div>
              </div>

              {/* Lead Score Indicator & Breakdown */}
              {(() => {
                const scoreDetails = calculateLeadScore(customer);
                return (
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500" /> Automated Lead Engagement Score
                      </h3>
                      <span className={`text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${scoreDetails.badgeBg} ${scoreDetails.badgeText}`}>
                        {scoreDetails.level} Category
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 text-center">
                        <span className={`text-4xl font-extrabold font-mono tracking-tight ${scoreDetails.color}`}>
                          {scoreDetails.score}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Points</span>
                      </div>
                      
                      <div className="flex-1">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              scoreDetails.level === 'Hot' ? 'bg-rose-500' : 
                              scoreDetails.level === 'Warm' ? 'bg-amber-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min((scoreDetails.score / scoreDetails.maxScore) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-[11px] text-slate-500 mt-1.5 block">
                          Activity Index: {Math.round((scoreDetails.score / scoreDetails.maxScore) * 100)}% of target ({scoreDetails.score}/{scoreDetails.maxScore} pts)
                        </span>
                      </div>
                    </div>

                    {/* score details list */}
                    <div className="border-t border-slate-100 pt-3 space-y-2.5">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scorecard Breakdown</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {scoreDetails.details.map((detail, index) => (
                          <div key={index} className="flex items-start justify-between text-xs bg-slate-50/50 hover:bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div className="space-y-0.5 pr-4">
                              <div className="font-semibold text-slate-800">{detail.category}</div>
                              <div className="text-[11px] text-slate-500 leading-tight">{detail.description}</div>
                            </div>
                            <span className="font-mono font-bold text-slate-700 bg-white shadow-sm border border-slate-200/60 px-2 py-0.5 rounded self-start">
                              +{detail.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {customer.notes && (
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-5 text-sm">
                  <h3 className="font-semibold text-amber-900 mb-2">Internal Notes</h3>
                  <p className="text-amber-800 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: Communications */}
          {activeTab === 'communications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">History</h3>
                <button 
                  onClick={() => setShowAddComm(!showAddComm)}
                  className="text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Log
                </button>
              </div>

              {showAddComm && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex gap-3">
                    {['Note', 'Email', 'SMS', 'Call', 'Meeting'].map((type) => (
                      <label key={type} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input 
                          type="radio" 
                          name="commType" 
                          value={type} 
                          checked={commForm.type === type}
                          onChange={(e) => setCommForm({ ...commForm, type: e.target.value })}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        {type}
                      </label>
                    ))}
                  </div>
                  <textarea 
                    value={commForm.summary}
                    onChange={(e) => setCommForm({ ...commForm, summary: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                    placeholder="Write details..."
                  ></textarea>
                  <div className="flex justify-end">
                    <button 
                      onClick={handleAddCommunication}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                      Save Log
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {(!customer.communications || customer.communications.length === 0) ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No communication history. Add a log to get started.
                  </div>
                ) : (
                  customer.communications.map((comm, index) => (
                    <div key={comm.id || `comm-${index}`} className="flex gap-4">
                      <div className="mt-1 relative flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex flex-col items-center justify-center text-xs font-bold ${
                            comm.type === 'Call' ? 'bg-emerald-100 text-emerald-700' :
                          comm.type === 'Meeting' ? 'bg-indigo-100 text-indigo-700' :
                          comm.type === 'Email' ? 'bg-blue-100 text-blue-700' :
                          comm.type === 'SMS' ? 'bg-purple-100 text-purple-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {comm.type.charAt(0)}
                        </div>
                      </div>
                      <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2 text-xs">
                          <span className="font-bold text-slate-700">{comm.type}</span>
                          <span className="text-slate-400">{format(comm.date, 'MMM d, yyyy h:mm a')}</span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{comm.summary}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: Tasks */}
          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-900">Tasks & Reminders</h3>
              </div>
              <div className="space-y-3">
                 {tasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">No tasks assigned for this lead.</div>
                 ) : (
                    tasks.map((task, index) => {
                       const isOverdue = isBefore(new Date(task.dueDate), startOfDay(new Date())) && task.status !== 'Completed';
                       const TypeIcon = task.taskType === 'Meeting' ? Briefcase : task.taskType === 'Call' ? Phone : task.taskType === 'Email' ? MessageSquare : CheckSquare;
                       return (
                         <div key={task.id || `task-${index}`} className={`flex items-start gap-4 p-4 border rounded-xl ${task.status === 'Completed' ? 'bg-slate-50/50 border-slate-100' : 'bg-white border-slate-200 shadow-sm'} ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-2 mb-1">
                                  <TypeIcon className={`w-4 h-4 ${task.status === 'Completed' ? 'text-slate-400' : 'text-indigo-600'}`} />
                                  <h4 className={`text-sm font-medium ${task.status === 'Completed' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{task.title}</h4>
                               </div>
                               {task.description && <p className="text-xs text-slate-500 mb-2">{task.description}</p>}
                               <div className="flex items-center gap-3 text-xs">
                                  <span className={`flex items-center gap-1 font-medium ${task.status === 'Completed' ? 'text-slate-400' : isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                                     <Calendar className="w-3.5 h-3.5" />
                                     {format(task.dueDate, 'MMM d, yyyy')}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${task.status === 'Completed' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-700'}`}>
                                    {task.status}
                                  </span>
                               </div>
                            </div>
                         </div>
                       )
                    })
                 )}
              </div>
            </div>
          )}

          {/* TAB: Preferences */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-900">Personal Preferences</h3>
                {!isEditingPreferences && (
                  <button 
                    onClick={() => setIsEditingPreferences(true)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="bg-white border text-sm border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 shadow-sm w-full">
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Preferred Contact Method</span>
                  {isEditingPreferences ? (
                    <select 
                      value={preferencesForm.preferredContactMethod || 'Phone'}
                      onChange={e => setPreferencesForm({...preferencesForm, preferredContactMethod: e.target.value as any})}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Phone">Phone</option>
                      <option value="Email">Email</option>
                      <option value="WhatsApp">WhatsApp</option>
                    </select>
                  ) : (
                    <span className="font-semibold text-slate-900 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                      {customer.preferences?.preferredContactMethod || 'Not set'}
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Study Mode Preference</span>
                  {isEditingPreferences ? (
                    <select 
                      value={preferencesForm.studyMode || 'Hybrid'}
                      onChange={e => setPreferencesForm({...preferencesForm, studyMode: e.target.value as any})}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Online">Online</option>
                      <option value="Offline">Offline</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  ) : (
                    <span className="font-semibold text-slate-900 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                      {customer.preferences?.studyMode || 'Not set'}
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Expected Timeline</span>
                  {isEditingPreferences ? (
                    <select 
                      value={preferencesForm.timeline || 'Unknown'}
                      onChange={e => setPreferencesForm({...preferencesForm, timeline: e.target.value as any})}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="Immediately">Immediately</option>
                      <option value="Within 1-3 Months">Within 1-3 Months</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  ) : (
                    <span className="font-semibold text-slate-900 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                      {customer.preferences?.timeline || 'Not set'}
                    </span>
                  )}
                </div>
              </div>

              {isEditingPreferences && (
                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleSavePreferences}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition"
                  >
                    <Save className="w-4 h-4" /> Save Preferences
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
