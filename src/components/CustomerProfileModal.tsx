import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Calendar, Clock, Edit2, MessageSquare, Plus, Save, CheckSquare, Briefcase, Circle, Award, Sparkles, RefreshCw, Copy, Check } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { format, isBefore, startOfDay } from 'date-fns';
import type { Lead, Communication, Preferences, Task } from '../types';
import { calculateLeadScore } from '../utils/scoring';

interface Props {
  customer: Lead;
  onClose: () => void;
}

export default function CustomerProfileModal({ customer, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'communications' | 'preferences' | 'tasks' | 'claude_ai'>('overview');
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preferencesForm, setPreferencesForm] = useState<Preferences>(
    customer.preferences || { preferredContactMethod: 'Phone', studyMode: 'Hybrid', timeline: 'Unknown' }
  );
  
  const [showAddComm, setShowAddComm] = useState(false);
  const [commForm, setCommForm] = useState({ type: 'Note', summary: '' });

  // Claude AI and Meta dispatch states
  const [claudeSettings, setClaudeSettings] = useState<any>(null);
  const [analyzingLead, setAnalyzingLead] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  const [selectedMetaEvent, setSelectedMetaEvent] = useState('Lead');
  const [selectedMetaValue, setSelectedMetaValue] = useState<number>(customer.expectedValue || 150);
  const [dispatchingMeta, setDispatchingMeta] = useState(false);
  const [metaStatus, setMetaStatus] = useState<{ success: boolean; message: string } | null>(null);

  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState('generate_lead');
  const [selectedGoogleValue, setSelectedGoogleValue] = useState<number>(customer.expectedValue || 150);
  const [dispatchingGoogle, setDispatchingGoogle] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{ success: boolean; message: string } | null>(null);

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

  useEffect(() => {
    fetch(`/api/settings?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.settings) {
          setClaudeSettings(data.settings);
          // Set default Meta Pixel and Google Event based on current lead status
          const currentStatus = customer.status;
          if (currentStatus === 'New') {
            setSelectedMetaEvent('Lead');
            setSelectedGoogleEvent('generate_lead');
          } else if (currentStatus === 'Enrolled') {
            setSelectedMetaEvent('Purchase');
            setSelectedGoogleEvent('purchase');
          } else if (currentStatus === 'Contacted' || currentStatus === 'Follow-up') {
            setSelectedMetaEvent('Contact');
            setSelectedGoogleEvent('contact');
          } else {
            setSelectedMetaEvent('Schedule');
            setSelectedGoogleEvent('schedule');
          }
        }
      })
      .catch(err => console.error('[Settings Fetch in Profile Modal] error:', err));
  }, [userId, customer.status]);

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
        <div className="flex border-b border-slate-200 px-6 mt-2 overflow-x-auto gap-1">
          {([
            { id: 'overview', label: 'Overview', isAi: false },
            { id: 'communications', label: 'Communications', isAi: false },
            { id: 'tasks', label: 'Tasks', isAi: false },
            { id: 'preferences', label: 'Preferences', isAi: false },
            { id: 'claude_ai', label: 'Claude AI Companion', isAi: true }
          ] as const).map((tab) => (
            <button
              key={tab.id}
              className={`px-3.5 py-3 text-sm font-semibold capitalize border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === tab.id 
                  ? tab.isAi 
                    ? 'border-amber-500 text-amber-600 font-bold' 
                    : 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.isAi && <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'claude_ai' ? 'text-amber-500 animate-pulse' : 'text-slate-400'}`} />}
              {tab.label}
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

          {/* TAB: Claude AI Companion */}
          {activeTab === 'claude_ai' && (
            <div className="space-y-6 animate-in fade-in duration-350">
              <div className="flex items-center justify-between border-b border-amber-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                    Claude AI Intelligence Portal
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Empower your counseling team with instant score analysis & customized marketing messages.
                  </p>
                </div>
                
                {claudeSettings?.claudeEnabled && claudeSettings?.claudeApiKey ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase uppercase-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    LIVE ENGINE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase uppercase-wider">
                    SANDBOX DEMO
                  </span>
                )}
              </div>

              {/* Status Banner */}
              {(!claudeSettings?.claudeEnabled || !claudeSettings?.claudeApiKey) && (
                <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-4 text-xs text-amber-800 space-y-1">
                  <span className="font-bold flex items-center gap-1">
                    ⚠️ Demo Sandbox Emulation Active
                  </span>
                  <p className="text-amber-700 leading-relaxed font-normal">
                    Claude AI key is missing or is set to offline in settings. A dynamic, high-fidelity counseling simulator will model the perfect responses for candidate student **{customer.name}** so you can preview the active CRM automation immediately!
                  </p>
                </div>
              )}

              {/* Action trigger button */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={analyzingLead}
                  onClick={async () => {
                    setAnalyzingLead(true);
                    setAiReport(null);
                    setMetaStatus(null);
                    try {
                      const response = await fetch('/api/claude/analyze-lead', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, leadId: customer.id })
                      });
                      const r = await response.json();
                      if (response.ok && r.success) {
                        setAiReport(r.analysis);
                      } else {
                        alert(r.error || 'Failed to complete AI profiling analysis.');
                      }
                    } catch (err: any) {
                      alert(`Error establishing connection path: ${err.message}`);
                    } finally {
                      setAnalyzingLead(false);
                    }
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl text-xs font-bold transition-all duration-250 flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-75"
                >
                  {analyzingLead ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      Claude is profiling target IELTS candidate...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Run Claude Student Profile Analysis & CAPI Recommender
                    </>
                  )}
                </button>
              </div>

              {/* Report Display */}
              {aiReport && (
                <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        IELTS Advisor Analysis Report
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(aiReport);
                          setCopiedText(true);
                          setTimeout(() => setCopiedText(false), 2000);
                        }}
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 border border-slate-205 rounded-lg px-2.5 py-1.5 flex items-center gap-1 hover:bg-slate-50 transition"
                      >
                        {copiedText ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Analysis
                          </>
                        )}
                      </button>
                    </div>

                    {/* Report Text Content Parser */}
                    <div className="text-slate-700 text-xs leading-relaxed space-y-4 font-normal">
                      {aiReport.split('\n\n').map((paragraph, index) => {
                        const cleanP = paragraph.trim();
                        if (cleanP.startsWith('###')) {
                          return (
                            <h4 key={index} className="text-sm font-bold text-slate-900 border-l-2 border-amber-500 pl-2.5 mt-5">
                              {cleanP.replace('###', '').trim()}
                            </h4>
                          );
                        }
                        if (cleanP.startsWith('*') || cleanP.startsWith('-')) {
                          return (
                            <ul key={index} className="space-y-1.5 pl-1.5">
                              {cleanP.split('\n').map((li, i) => {
                                const cleanLi = li.replace(/^[\s*\-]+/, '').trim();
                                return (
                                  <li key={i} className="flex items-start gap-1.5">
                                    <span className="text-amber-500 font-bold shrink-0 mt-0.5">•</span>
                                    <span>{cleanLi}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          );
                        }
                        if (cleanP.startsWith('"') && cleanP.endsWith('"')) {
                          return (
                            <blockquote key={index} className="bg-slate-50 border-l-4 border-indigo-500 p-3 rounded-r-xl font-mono text-[11px] text-slate-600 italic whitespace-pre-wrap">
                              {cleanP}
                            </blockquote>
                          );
                        }
                        return <p key={index} className="whitespace-pre-wrap">{cleanP}</p>;
                      })}
                    </div>
                  </div>

                  {/* Claude integrated dynamic Meta Conversions Dispatch Block */}
                  <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-50/20 border border-indigo-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-indigo-105-0.1">
                      <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] uppercase">
                        fb
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-semibold text-slate-900 text-xs">
                          AI-Informed Meta Conversions CAPI Hook
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Claude determined optimal target event attributes. Dispatch payload straight to Ads manager.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pixel Event Type</label>
                        <select
                          value={selectedMetaEvent}
                          onChange={(e) => setSelectedMetaEvent(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none"
                        >
                          <option value="Lead">Standard Event: Lead</option>
                          <option value="Contact">Standard Event: Contact</option>
                          <option value="Schedule">Standard Event: Schedule</option>
                          <option value="SubmitApplication">SubmitApplication</option>
                          <option value="InitiateCheckout">InitiateCheckout</option>
                          <option value="Purchase">Standard Event: Purchase</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Valuation Signal (USD)</label>
                        <input
                          type="number"
                          value={selectedMetaValue}
                          onChange={(e) => setSelectedMetaValue(Number(e.target.value))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={dispatchingMeta}
                      onClick={async () => {
                        setDispatchingMeta(true);
                        setMetaStatus(null);
                        try {
                          const r = await fetch('/api/claude/trigger-meta-recommendation', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              userId,
                              leadId: customer.id,
                              approvedEvent: selectedMetaEvent,
                              approvedValue: selectedMetaValue
                            })
                          });
                          const res = await r.json();
                          if (r.ok && res.success) {
                            setMetaStatus({
                              success: true,
                              message: `Transmitted successfully! Mapped standard event "${res.sentEvent}" ($${res.sentValue} USD) dispatches directly to Facebook Pixel ID ${res.pixelId} with offline AI classification markers. Communication history successfully saved.`
                            });
                          } else {
                            setMetaStatus({
                              success: false,
                              message: res.error || 'Failed to dispatch Meta payload.'
                            });
                          }
                        } catch (err: any) {
                          setMetaStatus({
                            success: false,
                            message: `Endpoint execution failed: ${err.message}`
                          });
                        } finally {
                          setDispatchingMeta(false);
                        }
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-75"
                    >
                      {dispatchingMeta ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Transmitting parameter signals directly to Facebook Graph...
                        </>
                      ) : (
                        <>
                          <span>Approve & Dispatch Signal to Meta CAPI</span>
                        </>
                      )}
                    </button>

                    {metaStatus && (
                      <div className={`p-3 rounded-xl border text-[11px] leading-relaxed font-medium ${
                        metaStatus.success 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}>
                        <p>{metaStatus.message}</p>
                      </div>
                    )}
                  </div>

                  {/* Claude integrated dynamic Google Offline Conversions Dispatch Block */}
                  {claudeSettings?.googleEnabled && (
                    <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-50/20 border border-indigo-100 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-indigo-105-0.1">
                        <div className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-[10px] uppercase">
                          g
                        </div>
                        <div className="space-y-0.5">
                          <h4 className="font-semibold text-slate-900 text-xs">
                            AI-Informed Google Ads & GA4 Offline Dispatch Hook
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Transmit smart CRM optimized actions to Google's bidding engine based on Claude's analysis.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Google Action Target</label>
                          <select
                            value={selectedGoogleEvent}
                            onChange={(e) => setSelectedGoogleEvent(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none cursor-pointer"
                          >
                            <option value="generate_lead">Standard GA4: generate_lead</option>
                            <option value="contact">Standard GA4: contact</option>
                            <option value="schedule">Standard GA4: schedule</option>
                            <option value="submit_application">Standard GA4: submit_application</option>
                            <option value="begin_checkout">Standard GA4: begin_checkout</option>
                            <option value="purchase">Standard GA4: purchase</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Conversion Valuation (USD)</label>
                          <input
                            type="number"
                            value={selectedGoogleValue}
                            onChange={(e) => setSelectedGoogleValue(Number(e.target.value))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={dispatchingGoogle}
                        onClick={async () => {
                          setDispatchingGoogle(true);
                          setGoogleStatus(null);
                          try {
                            const r = await fetch('/api/claude/trigger-google-recommendation', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                userId,
                                leadId: customer.id,
                                approvedEvent: selectedGoogleEvent,
                                approvedValue: selectedGoogleValue
                              })
                            });
                            const res = await r.json();
                            if (r.ok && res.success) {
                              setGoogleStatus({
                                success: true,
                                message: `Transmitted successfully! Mapped standard event "${res.sentEvent}" ($${res.sentValue} USD) dispatches to Google identifiers cleanly with automated client keys. Communication history saved.`
                              });
                            } else {
                              setGoogleStatus({
                                success: false,
                                message: res.error || 'Failed to dispatch Google conversion payload.'
                              });
                            }
                          } catch (err: any) {
                            setGoogleStatus({
                              success: false,
                              message: `Endpoint execution failed: ${err.message}`
                            });
                          } finally {
                            setDispatchingGoogle(false);
                          }
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-850 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-75"
                      >
                        {dispatchingGoogle ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Transmitting signals directly to Google servers...
                          </>
                        ) : (
                          <>
                            <span>Approve & Dispatch Signal to Google Hub</span>
                          </>
                        )}
                      </button>

                      {googleStatus && (
                        <div className={`p-3 rounded-xl border text-[11px] leading-relaxed font-medium ${
                          googleStatus.success 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          <p>{googleStatus.message}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
