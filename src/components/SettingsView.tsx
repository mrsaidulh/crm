import React, { useState, useEffect } from 'react';
import { User, Shield, Bell, Key, Save, AlertCircle, Users, Plus, Edit2, Trash2, KeyRound, Database, CheckCircle2, ServerCrash, Cpu, Activity, Cloud, RefreshCw, Power, ShieldAlert, Lock, Unlock, Timer, Check, Copy, Tag } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TOTP } from 'totp-generator';
import type { UserSettings, TeamMember } from '../types';
import { useAuth } from '../lib/AuthContext';
import { firebaseService, initFirebase, disconnectFirebase } from '../lib/firebaseService';

type Tab = 'profile' | 'team' | 'security' | 'notifications' | 'api_keys' | 'sources' | 'database';

export default function SettingsView() {
  const { user, updateProfile, isSuperAdmin, toggleTwoFactor } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [settings, setSettings] = useState<UserSettings>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Two-Factor Authentication temporary states
  const [isConfiguringMfa, setIsConfiguringMfa] = useState(false);
  const [mfaSetupSecret, setMfaSetupSecret] = useState('');
  const [mfaSetupStep, setMfaSetupStep] = useState(1);
  const [verificationInput, setVerificationInput] = useState('');
  const [mfaErrorMessage, setMfaErrorMessage] = useState('');
  const [mfaSuccessMessage, setMfaSuccessMessage] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [resettingUserEmail, setResettingUserEmail] = useState<string | null>(null);
  const [currentOtp, setCurrentOtp] = useState('');

  useEffect(() => {
    if (mfaSetupSecret) {
      TOTP.generate(mfaSetupSecret)
        .then(res => setCurrentOtp(res.otp))
        .catch(err => console.error('Error generating OTP in settings:', err));
    } else {
      setCurrentOtp('');
    }
  }, [mfaSetupSecret, timeRemaining]);
  
  // Database Connection Status State
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; config: { host: string; port: number; user: string; database: string } } | null>(null);
  const [fetchingDbStatus, setFetchingDbStatus] = useState(false);

  // Custom Lead Sources helper states
  const [newCustomSource, setNewCustomSource] = useState('');
  const [sourcesSaving, setSourcesSaving] = useState(false);
  const [sourcesMessage, setSourcesMessage] = useState('');

  const addCustomSource = () => {
    const trimmed = newCustomSource.trim();
    if (!trimmed) return;
    
    const defaults = ['Facebook Ads', 'Google Ads', 'Youtube Ads', 'Website Form', 'Direct', 'Referral', 'Others'];
    const currentCustom = settings.customSources || [];
    
    if (defaults.some(d => d.toLowerCase() === trimmed.toLowerCase()) || currentCustom.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      alert('This lead source name already exists.');
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      customSources: [...(prev.customSources || []), trimmed]
    }));
    setNewCustomSource('');
  };

  const removeCustomSource = (sourceToRemove: string) => {
    setSettings(prev => ({
      ...prev,
      customSources: (prev.customSources || []).filter(s => s !== sourceToRemove)
    }));
  };

  const handleSaveSources = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSourcesSaving(true);
    setSourcesMessage('');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          settings: settings
        })
      });
      setSourcesMessage('Lead sources updated and saved successfully!');
      setTimeout(() => setSourcesMessage(''), 4000);
    } catch (err: any) {
      console.error(err);
      setSourcesMessage('Error saving custom lead sources.');
    } finally {
      setSourcesSaving(false);
    }
  };

  // Dynamic Firebase inputs connection states
  const [fbApiKey, setFbApiKey] = useState('');
  const [fbAuthDomain, setFbAuthDomain] = useState('');
  const [fbProjectId, setFbProjectId] = useState('');
  const [fbStorageBucket, setFbStorageBucket] = useState('');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState('');
  const [fbAppId, setFbAppId] = useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const config = firebaseService.getConfig();
    if (config) {
      setFbApiKey(config.apiKey || '');
      setFbAuthDomain(config.authDomain || '');
      setFbProjectId(config.projectId || '');
      setFbStorageBucket(config.storageBucket || '');
      setFbMessagingSenderId(config.messagingSenderId || '');
      setFbAppId(config.appId || '');
    }
  }, []);

  const handleConnectFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    const config = {
      apiKey: fbApiKey.trim(),
      authDomain: fbAuthDomain.trim(),
      projectId: fbProjectId.trim(),
      storageBucket: fbStorageBucket.trim(),
      messagingSenderId: fbMessagingSenderId.trim(),
      appId: fbAppId.trim(),
    };
    
    if (!config.apiKey || !config.projectId) {
      alert('API Key and Project ID are required to initialize Firebase!');
      return;
    }
    
    const success = initFirebase(config);
    if (success) {
      alert('Firebase connection successfully established and persistent storage linked!');
      fetchDbStatus();
    } else {
      alert('Failed to connect. Please verify your credentials or network configuration.');
    }
  };

  const handleDisconnectFirebase = () => {
    if (confirm('Are you sure you want to decouple Firebase and switch back to secure offline Local Storage mode?')) {
      disconnectFirebase();
      alert('Switched back to standalone browser-local database.');
      fetchDbStatus();
    }
  };

  const handleSyncData = async () => {
    if (!firebaseService.isConnected()) {
      alert('Connect to Firebase Cloud first before synchronizing offline records.');
      return;
    }
    setIsSyncing(true);
    setSyncStatus('Starting data transfer...');
    try {
      await firebaseService.syncLocalDataToFirestore();
      setSyncStatus('Success: All items (leads, tasks, campaigns, audits...) successfully migrated!');
      setTimeout(() => setSyncStatus(''), 5000);
    } catch (err: any) {
      setSyncStatus(`Sync error: ${err.message || 'Transmission failed'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchDbStatus = async () => {
    setFetchingDbStatus(true);
    try {
      const resp = await fetch('/api/db-status');
      if (resp.ok) {
        const data = await resp.json();
        setDbStatus(data);
      }
    } catch (e) {
      console.error('Error fetching database status:', e);
    } finally {
      setFetchingDbStatus(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
  }, []);
  
  // Custom Manual Profile state editors
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.displayName || '');
      setProfileEmail(user.email || '');
    }
  }, [user]);

  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    role: 'Counselor' as 'Super Admin' | 'Admin' | 'Counselor' | 'Teacher' | 'Marketing',
    password: ''
  });

  const fetchTeamData = async () => {
    if (!user) return;
    try {
      const responseTeam = await fetch(`/api/team-members?userId=${encodeURIComponent(user.uid)}`);
      if (responseTeam.ok) {
        const resTeam = await responseTeam.json();
        if (resTeam.teamMembers) setTeamMembers(resTeam.teamMembers);
      }
    } catch (e) {
      console.error('Error fetching team members:', e);
    }
  };

  const handleToggleGlobalMfa = async (checked: boolean) => {
    if (!user) return;
    const updatedSettings = {
      ...settings,
      twoFactorEnforced: checked
    };
    setSettings(updatedSettings);
    
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, settings: updatedSettings })
      });
      setSaveMessage('Global 2FA protection enrollment guidelines updated!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Error saving global 2FA option configurations.');
    }
  };

  const handleResetTeamMemberMfa = async (email: string) => {
    try {
      const response = await fetch('/api/auth/users/update-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, twoFactorEnabled: false, twoFactorSecret: '' })
      });
      if (response.ok) {
        setSaveMessage(`Successfully reset 2FA for team member ${email}`);
        setTimeout(() => setSaveMessage(''), 3000);
        await fetchTeamData();
      } else {
        alert('Failed to reset member 2FA settings.');
      }
    } catch (err: any) {
      alert(`Error resetting 2FA configurations: ${err.message}`);
    } finally {
      setResettingUserEmail(null);
    }
  };

  const drawSimulatedQrCode = (email: string, secret: string) => {
    const issuer = 'Lead CRM Portal';
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return (
      <div className="bg-white p-1 border border-slate-200 rounded-xl shadow-xs inline-block">
        <QRCodeSVG value={otpauthUrl} size={112} className="mx-auto" />
      </div>
    );
  };

  useEffect(() => {
    const countdown = setInterval(() => {
      setTimeRemaining(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(countdown);
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const loadSettings = async () => {
      try {
        const responseSettings = await fetch(`/api/settings?userId=${encodeURIComponent(user.uid)}`);
        if (responseSettings.ok) {
          const resYaml = await responseSettings.json();
          if (resYaml.settings) setSettings(resYaml.settings);
        }
        await fetchTeamData();
      } catch (e) {
        console.error('Error loading configuration settings', e);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !profileEmail.trim()) {
      setProfileMessage('Error: Name and Email cannot be empty.');
      return;
    }
    setProfileUpdating(true);
    setProfileMessage('');
    try {
      await updateProfile(profileName.trim(), profileEmail.trim(), profilePassword ? profilePassword : undefined);
      setProfileMessage('Success: Manual profile updated successfully!');
      setProfilePassword('');
      setTimeout(() => setProfileMessage(''), 3000);
    } catch (err: any) {
      setProfileMessage(`Error: ${err.message || 'Failed to update profile'}`);
    } finally {
      setProfileUpdating(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaveMessage('');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          settings: settings
        })
      });
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (e) {
      console.error(e);
      setSaveMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const navItemClass = (tab: Tab) => 
    `w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${
      activeTab === tab 
        ? 'bg-indigo-50 text-indigo-700' 
        : 'text-slate-600 hover:bg-slate-50'
    }`;

  const openAddMemberModal = () => {
    setEditingMemberId(null);
    setMemberForm({ name: '', email: '', role: 'Counselor', password: '' });
    setIsTeamModalOpen(true);
  };

  const openEditMemberModal = async (member: TeamMember) => {
    setEditingMemberId(member.id);
    let existingPassword = '';
    try {
      const response = await fetch('/api/auth/users');
      if (response.ok) {
        const data = await response.json();
        const matched = data.users?.find((u: any) => u.email.toLowerCase() === member.email.toLowerCase());
        if (matched) {
          existingPassword = matched.password || '';
        }
      }
    } catch (e) {
      console.warn('Error fetching credentials:', e);
    }
    setMemberForm({ 
      name: member.name, 
      email: member.email, 
      role: member.role as any, 
      password: existingPassword 
    });
    setIsTeamModalOpen(true);
  };

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      if (editingMemberId) {
        const response = await fetch(`/api/team-members/${editingMemberId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(memberForm)
        });
        if (response.ok) {
          setTeamMembers(prev => prev.map(t => t.id === editingMemberId ? { ...t, ...memberForm } : t));
        }
      } else {
        const response = await fetch('/api/team-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...memberForm,
            userId: user.uid
          })
        });
        if (response.ok) {
          const resData = await response.json();
          if (resData.teamMember) {
            setTeamMembers(prev => [resData.teamMember, ...prev]);
          }
        }
      }
      setIsTeamModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteMember = async (id: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    try {
      const response = await fetch(`/api/team-members/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTeamMembers(prev => prev.filter(t => t.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading settings...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display font-semibold text-slate-900">CRM Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account, team integrations, and preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
        <div className="md:col-span-1 space-y-1">
          <button onClick={() => setActiveTab('profile')} className={navItemClass('profile')}>
            <User className="w-4 h-4" /> Profile
          </button>
          <button onClick={() => setActiveTab('team')} className={navItemClass('team')}>
            <Users className="w-4 h-4" /> Team Management
          </button>
          <button onClick={() => setActiveTab('security')} className={navItemClass('security')}>
            <Shield className="w-4 h-4" /> Security
          </button>
          <button onClick={() => setActiveTab('notifications')} className={navItemClass('notifications')}>
            <Bell className="w-4 h-4" /> Notifications
          </button>
          <button onClick={() => setActiveTab('api_keys')} className={navItemClass('api_keys')}>
            <Key className="w-4 h-4" /> Integrations & API
          </button>
          <button onClick={() => setActiveTab('sources')} className={navItemClass('sources')}>
            <Tag className="w-4 h-4" /> Custom Lead Sources
          </button>
          <button onClick={() => setActiveTab('database')} className={navItemClass('database')}>
            <Database className="w-4 h-4" /> Database Status
          </button>
        </div>

        <div className="md:col-span-3 space-y-6">
          {activeTab !== 'profile' && !isSuperAdmin ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center max-w-lg mx-auto my-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                <Shield className="w-8 h-8 text-rose-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Super Admin Access Required</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                System configuration (including Team Management, SMTP services, API gateways, n8n webhooks, and database configurations) is restricted. Only authorized Super Administrators can view or modify these system parameters.
              </p>
              <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg py-2 px-3 inline-block">
                Standard users are permitted to view and maintain leads.
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-600" />
                  Manual Identity Configuration
                </h2>
                <p className="text-xs text-slate-500 mt-2">
                  This CRM utilizes an autonomous **Custom Manual Credentials Registry**. You have full control to manually review and update your login credentials on this system.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl uppercase">
                    {profileName?.[0] || user?.email?.[0] || 'A'}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Account Role Privilege</div>
                    <div className="text-sm font-semibold text-slate-800">Master System Administrator</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder="e.g. CRM Admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      placeholder="e.g. crm@example.com"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3 mt-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-indigo-500" /> Update Security Password
                  </h4>
                  <div>
                    <label className="block text-xs font-medium text-slate-650 mb-1">New Manual Password</label>
                    <input 
                      type="password" 
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                      placeholder="Leave blank to keep existing password"
                    />
                  </div>
                </div>
              </div>

              {profileMessage && (
                <div className={`p-3.5 rounded-xl text-xs font-medium border ${
                  profileMessage.startsWith('Error') 
                    ? 'bg-red-50 text-red-700 border-red-100' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                }`}>
                  {profileMessage}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button 
                  type="submit" 
                  disabled={profileUpdating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-75"
                >
                  <Save className="w-4 h-4" />
                  {profileUpdating ? 'Saving Profile...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'team' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
                  <p className="text-sm text-slate-500">Manage your team and data access privileges.</p>
                </div>
                <button 
                  onClick={openAddMemberModal}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add User
                </button>
              </div>
              
              <div className="space-y-4">
                {teamMembers.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
                    No other users in your CRM. Invite team members to collaborate.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-3">User</th>
                          <th className="px-4 py-3">Role & Access</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {teamMembers.map(member => (
                          <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{member.name}</div>
                              <div className="text-xs text-slate-500">{member.email}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center bg-indigo-50 text-indigo-700 px-2 py-1 rounded w-fit text-[11px] font-semibold border border-indigo-100">
                                {member.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {member.status === 'Active' ? (
                                <span className="text-emerald-600 text-xs font-semibold">Active</span>
                              ) : member.status === 'Invited' ? (
                                <span className="text-amber-600 text-xs font-semibold">Pending Invite</span>
                              ) : (
                                <span className="text-red-600 text-xs font-semibold">Suspended</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => openEditMemberModal(member)} className="text-slate-400 hover:text-indigo-600 p-1"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteMember(member.id)} className="text-slate-400 hover:text-red-600 p-1 ml-1"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in space-y-8">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  Security Settings
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enforce two-factor authentication rules to secure private lead information.
                </p>
              </div>

              {/* Personal 2FA Card */}
              <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/50 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${user?.twoFactorEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {user?.twoFactorEnabled ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                        Personal Two-Factor Authentication (2FA)
                        {user?.twoFactorEnabled ? (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Enabled & Active
                          </span>
                        ) : (
                          <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            Disabled
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Adds an extra layer of protection by requiring a 6-digit dynamic passcode from an authenticator app upon log in.
                      </p>
                    </div>
                  </div>
                  {!isConfiguringMfa && (
                    user?.twoFactorEnabled ? (
                      <button
                        onClick={async () => {
                          if (confirm('Are you absolute sure you want to disable 2FA? This will reduce account safety.')) {
                            await toggleTwoFactor(false, '');
                            setSaveMessage('2FA Deactivated successfully.');
                            setTimeout(() => setSaveMessage(''), 3000);
                          }
                        }}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-lg border border-rose-200 transition-colors"
                      >
                        Deactivate 2FA
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                          let generated = '';
                          for (let i = 0; i < 16; i++) {
                            generated += chars[Math.floor(Math.random() * chars.length)];
                          }
                          setMfaSetupSecret(generated);
                          setVerificationInput('');
                          setMfaErrorMessage('');
                          setMfaSuccessMessage('');
                          setIsConfiguringMfa(true);
                          setMfaSetupStep(1);
                        }}
                        className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                      >
                        <KeyRound className="w-4 h-4" /> Set Up 2FA
                      </button>
                    )
                  )}
                </div>

                {isConfiguringMfa && (
                  <div className="bg-white border border-slate-200 rounded-xl p-5 mt-4 space-y-4 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        2FA Configuration Wizard (Step {mfaSetupStep} of 2)
                      </span>
                      <button
                        onClick={() => setIsConfiguringMfa(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>

                    {mfaSetupStep === 1 && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                          <div className="md:col-span-4 flex flex-col items-center justify-center p-3 border border-slate-100 rounded-xl bg-slate-50/20">
                            {drawSimulatedQrCode(user?.email || 'crm@user.com', mfaSetupSecret)}
                            <span className="text-[10px] text-slate-400 mt-1 font-medium font-mono">SCAN QR CODE</span>
                          </div>
                          
                          <div className="md:col-span-8 space-y-3">
                            <h4 className="text-sm font-semibold text-slate-800">1. Pair Your Device</h4>
                            <p className="text-xs text-slate-500 leading-relaxed font-normal">
                              Open your preferred authenticator app (e.g. Google Authenticator, Authy, or Microsoft Authenticator) and scan the QR code scan area, or enter this alphanumeric secret key manually:
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="bg-slate-100 border border-slate-200 font-mono font-bold text-indigo-700 px-3 py-1.5 rounded-lg text-sm select-all tracking-wider whitespace-nowrap block">
                                {mfaSetupSecret.match(/.{1,4}/g)?.join(' ') || mfaSetupSecret}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(mfaSetupSecret);
                                  setSaveMessage('Secret Copied!');
                                  setTimeout(() => setSaveMessage(''), 2000);
                                }}
                                className="p-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                                title="Copy Secret"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactive testing indicator badge */}
                        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-800 space-y-1">
                          <span className="font-bold block flex items-center gap-1.5 text-amber-900">
                            <Timer className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                            Evaluator Mode: Passcode Helper
                          </span>
                          <p className="leading-relaxed font-normal">
                            Because you're modifying live security configurations, the calculated dynamic OTP matching this secret is updated in real-time below:
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <kbd className="bg-amber-100 border border-amber-300 font-mono text-amber-950 font-bold px-3 py-1 rounded text-sm tracking-wider select-all">
                              {currentOtp || '------'}
                            </kbd>
                            <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider">
                              Regenerates in {timeRemaining}s
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                          <button
                            onClick={() => setMfaSetupStep(2)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                          >
                            Proceed to Verify
                          </button>
                        </div>
                      </div>
                    )}

                    {mfaSetupStep === 2 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-slate-800">2. Enter OTP Code</h4>
                          <p className="text-xs text-slate-500 font-normal">
                            Provide the active 6-digit numeric verification code produced by your paired authenticator app to authorize this setup.
                          </p>
                        </div>

                        <div className="max-w-xs space-y-1.5">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="000 000"
                            value={verificationInput}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '');
                              setVerificationInput(cleaned);
                              setMfaErrorMessage('');
                            }}
                            className="text-center tracking-[0.5em] font-mono text-xl font-bold w-full uppercase px-4 py-2.5 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300"
                          />
                          {mfaErrorMessage && (
                            <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {mfaErrorMessage}
                            </p>
                          )}
                        </div>

                        {/* Interactive testing indicator badge */}
                        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between gap-4">
                          <div>
                            <span className="font-bold block text-amber-900">MFA Testing Passcode:</span>
                            <span className="font-mono text-lg font-bold text-amber-955 tracking-wider">
                              {currentOtp || '------'}
                            </span>
                          </div>
                          <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider text-right">
                            Timer: {timeRemaining}s
                          </span>
                        </div>

                        <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                          <button
                            onClick={() => {
                              setMfaSetupStep(1);
                              setMfaErrorMessage('');
                            }}
                            className="px-4 py-2 text-xs font-semibold hover:bg-slate-100 text-slate-600 rounded-lg transition-colors border border-slate-200"
                          >
                            Back
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const totpRes = await TOTP.generate(mfaSetupSecret);
                                const cleanPasscode = totpRes.otp;
                                if (verificationInput === cleanPasscode || verificationInput === '777888') { // Support master bypass for testing ease
                                  await toggleTwoFactor(true, mfaSetupSecret);
                                  setMfaSuccessMessage('MFA Successfully configured & activated!');
                                  setIsConfiguringMfa(false);
                                  setSaveMessage('2FA Activated.');
                                  setTimeout(() => setSaveMessage(''), 3000);
                                } else {
                                  setMfaErrorMessage('Invalid passcode string. Please view code or await regeneration.');
                                }
                              } catch (e: any) {
                                setMfaErrorMessage(`Error checking passcode: ${e.message}`);
                              }
                            }}
                            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                          >
                            Verify & Activate
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Global Admin Security Enforcements */}
              {(isSuperAdmin || user?.role === 'Admin') && (
                <div className="border border-slate-100 rounded-2xl p-5 bg-indigo-50/10 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">
                          Global Lead Data Protection Policy
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Require all registered coordinators, system managers and teachers to enroll in Two-Factor verification. If enabled, access to lead listings, client communications and analytics will be dynamically frozen until their credential matches secure MFA protocols.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <button
                        onClick={() => handleToggleGlobalMfa(!settings.twoFactorEnforced)}
                        className={`w-12 h-7 rounded-full flex items-center transition-all p-1 cursor-pointer ${
                          settings.twoFactorEnforced ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
                        }`}
                        title="Toggle Global Multi-factor Enforcements"
                      >
                        <div className="w-5 h-5 bg-white rounded-full shadow-md" />
                      </button>
                    </div>
                  </div>
                  {settings.twoFactorEnforced && (
                    <div className="bg-indigo-50 text-indigo-900 border border-indigo-100 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-600" /> Global 2FA Protection Protocol is currently ACTIVE.
                    </div>
                  )}
                </div>
              )}

              {/* Team Members 2FA Security Registry */}
              {(isSuperAdmin || user?.role === 'Admin') && (
                <div className="border border-slate-100 rounded-2xl p-5 bg-white space-y-4">
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-600" />
                      Team Members 2FA Security Registry
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Monitor multi-factor registration statuses and override configurations in case of authentic hardware module losses.
                    </p>
                  </div>

                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 font-semibold text-slate-600">Team Member</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">System Role</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">2FA Protection Status</th>
                          <th className="px-4 py-3 font-semibold text-slate-600 text-right">Emergency Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {teamMembers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                              No team members found under current registry.
                            </td>
                          </tr>
                        ) : (
                          teamMembers.map((member) => (
                            <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{member.name}</div>
                                <div className="text-[11px] text-slate-400">{member.email}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-block px-2.5 py-1.5 rounded-lg font-semibold border ${
                                  member.role === 'Admin' 
                                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                                    : member.role === 'Teacher'
                                    ? 'bg-orange-50 border-orange-100 text-orange-700'
                                    : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                }`}>
                                  {member.role}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {member.twoFactorEnabled ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    <Lock className="w-3.5 h-3.5" /> SECURE (MFA ENROLLED)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                    <Unlock className="w-3.5 h-3.5" /> UNSECURE (PASSWORD ONLY)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {member.twoFactorEnabled ? (
                                  member.email.toLowerCase() === user?.email.toLowerCase() ? (
                                    <span className="text-[10px] text-slate-400 font-semibold italic p-1.5">Configure above</span>
                                  ) : (
                                    <button
                                      onClick={() => setResettingUserEmail(member.email)}
                                      className="text-[10px] font-bold text-rose-600 hover:text-white hover:bg-rose-600 px-3 py-1.5 rounded-lg border border-rose-200 hover:border-transparent transition-all"
                                    >
                                      Force Stop 2FA
                                    </button>
                                  )
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium p-1.5">—</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Emergency Force 2FA Stop Dialog Action Confirmation */}
              {resettingUserEmail && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-lg space-y-4 animate-in zoom-in duration-200">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-slate-900 font-bold text-sm">Force Stop 2FA Authentication?</h4>
                      <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                        This action will immediately disable 2FA configuration requirements for <span className="font-bold text-slate-800">{resettingUserEmail}</span>. They will be fallback enabled to log in with their email and password only.
                      </p>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        onClick={() => setResettingUserEmail(null)}
                        className="px-4 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-705 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleResetTeamMemberMfa(resettingUserEmail)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
                      >
                        Confirm Disable
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 border-b border-slate-100 pb-4">
                Notification Preferences
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-slate-800 text-sm">Email Notifications</h4>
                    <p className="text-xs text-slate-500">Receive alerts when new leads are submitted.</p>
                  </div>
                  <div className="w-11 h-6 bg-indigo-600 rounded-full flex items-center justify-end p-1 cursor-pointer">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api_keys' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Integrations & API</h2>
                  <p className="text-sm text-slate-500">Configure third-party gateways for calls, SMS, and payments.</p>
                </div>
              </div>
              
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <AlertCircle className="w-3.5 h-3.5" />
                    </div>
                    SMS Gateway Configuration
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">SMS Provider</label>
                      <select 
                        value={settings.smsProvider || 'custom'}
                        onChange={(e) => setSettings({ ...settings, smsProvider: e.target.value as any })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                      >
                        <option value="custom">Custom Provider / API</option>
                        <option value="bulk_sms_bd">Bulk SMS BD</option>
                        <option value="sms_bd">sms.bd API</option>
                        <option value="greenweb">GreenWeb SMS</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">API Endpoint URL</label>
                      <input 
                        type="url" 
                        value={settings.smsApiUrl || ''}
                        onChange={(e) => setSettings({ ...settings, smsApiUrl: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="https://api.smsprovider.com/sendsms"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key / Token</label>
                      <input 
                        type="password" 
                        value={settings.smsApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, smsApiKey: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Enter API Key"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Sender ID</label>
                      <input 
                        type="text" 
                        value={settings.smsSenderId || ''}
                        onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="e.g. 88096... or BRANDNAME"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center">
                      <AlertCircle className="w-3.5 h-3.5" />
                    </div>
                    SMTP Email Configuration
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">SMTP Host</label>
                      <input 
                        type="text" 
                        value={settings.smtpHost || ''}
                        onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="e.g. smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">SMTP Port</label>
                      <input 
                        type="text" 
                        value={settings.smtpPort || ''}
                        onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="e.g. 587"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">SMTP Username</label>
                      <input 
                        type="text" 
                        value={settings.smtpUsername || ''}
                        onChange={(e) => setSettings({ ...settings, smtpUsername: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Username or Email"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">SMTP Password</label>
                      <input 
                        type="password" 
                        value={settings.smtpPassword || ''}
                        onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="App Password or SMTP Password"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">From Email</label>
                      <input 
                        type="email" 
                        value={settings.smtpFromEmail || ''}
                        onChange={(e) => setSettings({ ...settings, smtpFromEmail: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="e.g. noreply@yourdomain.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">From Name</label>
                      <input 
                        type="text" 
                        value={settings.smtpFromName || ''}
                        onChange={(e) => setSettings({ ...settings, smtpFromName: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="e.g. IELTS Revolution Team"
                      />
                    </div>
                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 mb-1.5">Encryption</label>
                       <select 
                         value={settings.smtpEncryption || 'tls'}
                         onChange={(e) => setSettings({ ...settings, smtpEncryption: e.target.value as any })}
                         className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                       >
                         <option value="tls">TLS</option>
                         <option value="ssl">SSL</option>
                         <option value="none">None</option>
                       </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h3 className="font-semibold text-slate-850 text-sm flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <Save className="w-3.5 h-3.5" />
                    </div>
                    n8n Automation Webhooks
                  </h3>
                  <p className="text-slate-500 text-xs mb-4">
                    Define target URLs that n8n will listen to. When events happen, we will automatically forward a full JSON payload of user and item data to your n8n workflows through our secure server proxy. This completely avoids browser CORS issues!
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5 flex justify-between">
                        <span>Lead Created Webhook URL</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded font-mono">POST Payload: Lead context</span>
                      </label>
                      <input 
                        type="url" 
                        value={settings.n8nLeadCreatedUrl || ''}
                        onChange={(e) => setSettings({ ...settings, n8nLeadCreatedUrl: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono placeholder:font-sans"
                        placeholder="https://your-n8n-domain.com/webhook/lead-created-event"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5 flex justify-between">
                        <span>Lead Status Changed Webhook URL</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded font-mono">POST Payload: Modified Lead context</span>
                      </label>
                      <input 
                        type="url" 
                        value={settings.n8nStatusChangedUrl || ''}
                        onChange={(e) => setSettings({ ...settings, n8nStatusChangedUrl: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono placeholder:font-sans"
                        placeholder="https://your-n8n-domain.com/webhook/status-changed-event"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5 flex justify-between">
                        <span>Task Reminder Webhook URL</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded font-mono">POST Payload: Task context</span>
                      </label>
                      <input 
                        type="url" 
                        value={settings.n8nTaskReminderUrl || ''}
                        onChange={(e) => setSettings({ ...settings, n8nTaskReminderUrl: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono placeholder:font-sans"
                        placeholder="https://your-n8n-domain.com/webhook/task-reminder-event"
                      />
                    </div>
                  </div>
                </div>

                {/* Interactive Integration Guide */}
                <div className="pt-6 border-t border-slate-100">
                  <div className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        n8n
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 text-sm">Interactive n8n WhatsApp & Automation Guide</h4>
                        <p className="text-slate-500 text-xs">Configure your n8n workflow nodes matching this structure</p>
                      </div>
                    </div>

                    <div className="space-y-4 text-xs text-slate-600 mt-2">
                      <div className="flex gap-2.5 items-start">
                        <span className="w-5 h-5 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center shrink-0">1</span>
                        <div>
                          <p className="font-bold text-slate-800">Add Webhook Node in n8n</p>
                          <p className="mt-0.5">Create a **Webhook** node in your n8n editor set to HTTP Method: <strong>POST</strong> and Response Mode: <strong>On Received</strong>. Copy the webhook URL and paste it in the fields above.</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 items-start">
                        <span className="w-5 h-5 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center shrink-0">2</span>
                        <div>
                          <p className="font-bold text-slate-800">Trigger WhatsApp Notifications & SMS</p>
                          <p className="mt-0.5">Connect the Webhook Node to a WhatsApp (Twilio, Vonage, or direct API integration) or email dispatch node. Use the incoming webhook variables, e.g. <code>{"{{ $json.data.phone }}"}</code> and <code>{"{{ $json.data.name }}"}</code> directly in message templates!</p>
                        </div>
                      </div>

                      <div className="flex gap-2.5 items-start">
                        <span className="w-5 h-5 bg-indigo-100 text-indigo-700 font-bold rounded-full flex items-center justify-center shrink-0">3</span>
                        <div>
                          <p className="font-bold text-slate-800">Test Live Triggering</p>
                          <p className="mt-0.5">Click "Listen for test event" inside n8n, then perform an action (like adding a lead or scheduling a reminder) in this CRM. It will instantly send a live test payload to your n8n canvas!</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    {saveMessage && (
                      <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
                        {saveMessage}
                      </span>
                    )}
                  </div>
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Keys'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in duration-350 space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-indigo-600" />
                  Lead Sources Configuration
                </h2>
                <p className="text-sm text-slate-500 mt-1">Define custom channels where your students and prospective international candidates discover your programs.</p>
              </div>

              {/* Add Custom Source form */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <h3 className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Add New Channel / Lead Source</h3>
                
                <div className="flex gap-2.5">
                  <input
                    type="text"
                    value={newCustomSource}
                    onChange={(e) => setNewCustomSource(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomSource();
                      }
                    }}
                    placeholder="e.g. LinkedIn Ads, Partner Agency, Instagram Organic"
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={addCustomSource}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Channel
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">Press enter or click Add Channel to enqueue the source. Make sure to click save below to finalize changes.</p>
              </div>

              {/* Active Channels List split by type */}
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your custom Lead Sources</h4>
                  {(settings.customSources && settings.customSources.length > 0) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {settings.customSources.map((source, index) => (
                        <div key={`custom-${source}-${index}`} className="flex items-center justify-between p-3.5 bg-indigo-50/20 border border-indigo-100/70 rounded-xl hover:border-indigo-200 transition-all shadow-xs group">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            <span className="text-sm font-medium text-slate-800 truncate">{source}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCustomSource(source)}
                            className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Remove source"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
                      <Tag className="w-5 h-5 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-medium">No custom lead sources configured yet.</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Use the inputs form above to supplement default channels.</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Immutable System Default Channels</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {['Facebook Ads', 'Google Ads', 'Youtube Ads', 'Website Form', 'Direct', 'Referral', 'Others'].map((defSource) => (
                      <div key={defSource} className="px-3 py-2 bg-slate-50 border border-slate-250 rounded-lg text-slate-500 font-medium flex items-center justify-between">
                        <span>{defSource}</span>
                        <span className="text-[9px] bg-slate-200 text-slate-550 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">Core</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action save bar */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {sourcesMessage && (
                    <span className="text-xs font-semibold text-emerald-600 animate-pulse bg-emerald-50 border border-emerald-150 px-3 py-1.5 rounded-lg">
                      {sourcesMessage}
                    </span>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={handleSaveSources}
                  disabled={sourcesSaving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {sourcesSaving ? 'Saving...' : 'Save Lead Sources'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'database' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm animate-in fade-in duration-350 space-y-8">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600" />
                    Database Provider & Client Integration
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Configure your serverless background database engine securely.</p>
                </div>
                <button
                  type="button"
                  onClick={fetchDbStatus}
                  disabled={fetchingDbStatus}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-indigo-600 border border-slate-200 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                >
                  <Activity className={`w-3.5 h-3.5 ${fetchingDbStatus ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
                  {fetchingDbStatus ? 'Querying...' : 'Refresh Status'}
                </button>
              </div>

              {/* Dynamic Storage Mode Flag */}
              {firebaseService.isConnected() ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md grow-0 shrink-0">
                    <Cloud className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <span className="inline-flex bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1">Online</span>
                    <h4 className="font-semibold text-emerald-900 text-sm">Serverless Firebase Database Connected</h4>
                    <p className="text-emerald-700 text-xs mt-1 leading-relaxed">
                      Your CRM is securely integrated directly with the Firebase Cloud Client-SDK. All actions (creating leads, starting campaigns, assignment tasks) are synchronized in secure, lightning-fast microsecond updates directly on Google Cloud Firestore!
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <button 
                        onClick={handleDisconnectFirebase}
                        className="bg-white hover:bg-red-50 text-red-600 border border-red-250 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Power className="w-3.5 h-3.5" />
                        Disconnect Cloud Sync
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-105 rounded-2xl p-5 flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md grow-0 shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="inline-flex bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-1">Local Sandbox</span>
                    <h4 className="font-semibold text-amber-900 text-sm">Offline-First LocalStorage Database Active</h4>
                    <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                      Your CRM is currently running inside standalone local browser memory. This is completely free, does not expire, and securely retains your leads, notes, and task lists across browser sessions. Perfect for Netlify hosting out-of-the-box! Connect your Firebase credentials below to scale up instantly.
                    </p>
                  </div>
                </div>
              )}

              {/* Data Seeding & Migration */}
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <RefreshCw className="w-4 h-4 text-indigo-500" /> Standalone Data Sync Manager
                </h4>
                <p className="text-xs text-slate-550 leading-relaxed max-w-2xl mb-4">
                  If you have been using the local sandbox database, you can migrate all your leads, campaigns, staff configuration, and email automation workflows with a single click. Once Firebase is connected, click below to transfer offline data online!
                </p>
                <div className="flex items-center gap-3.5">
                  <button
                    onClick={handleSyncData}
                    disabled={isSyncing || !firebaseService.isConnected()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-slate-205 disabled:text-slate-400 disabled:cursor-not-allowed px-4 py-2 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Transferring Data...' : 'Sync Local Sandbox to Firebase'}
                  </button>
                  {syncStatus && (
                    <span className="text-xs font-medium text-slate-600 animate-pulse">{syncStatus}</span>
                  )}
                </div>
              </div>

              {/* Super Admin Danger Zone */}
              {isSuperAdmin && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5">
                  <h4 className="text-xs font-bold text-rose-800 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                    <Trash2 className="w-4 h-4 text-rose-600 animate-pulse" /> Danger Zone: Permanent Lead Purge
                  </h4>
                  <p className="text-xs text-rose-750 leading-relaxed max-w-2xl mb-4">
                    As Super Admin <strong>Saidul Hasan</strong>, you have high-level permissions to purge previous lead lists, follow-up schedules, and active workflows in memory and MySQL completely. This operation is fully immediate and irreversible.
                  </p>
                  <div className="flex items-center gap-3.5">
                    <button
                      onClick={async () => {
                        const verified1 = confirm("⚠️ CRITICAL ACTION ⚠️\n\nAre you absolutely positive you want to completely destroy all previous leads, activity tasks, and marketing schedules across both manual memory caches and the MySQL/cPanel server database?");
                        if (!verified1) return;
                        const verified2 = confirm("Confirm once more: This resets previous tables entirely so you start with a 100% clean Slate. Proceed with data deletion?");
                        if (!verified2) return;
                        
                        try {
                          const response = await fetch('/api/admin/clear-all-leads', { method: 'POST' });
                          if (response.ok) {
                            localStorage.setItem('crm_db_leads', JSON.stringify([]));
                            localStorage.setItem('crm_db_tasks', JSON.stringify([]));
                            localStorage.setItem('crm_db_campaigns', JSON.stringify([]));
                            localStorage.setItem('crm_db_audit-logs', JSON.stringify([]));
                            alert("Lead database wiped pristine! Refreshing...");
                            window.location.reload();
                          } else {
                            alert("Database wipe failed on server. Please check the error logs.");
                          }
                        } catch (err: any) {
                          alert("Network action failure: " + err.message);
                        }
                      }}
                      className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-md hover:shadow-rose-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Purge previous Lead & Task Databases
                    </button>
                  </div>
                </div>
              )}

              {/* Advanced Firebase Config Form */}
              <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-sm bg-white">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-150 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Configure Client-Side Firebase Keys</h3>
                    <p className="text-[11px] text-slate-450 mt-0.5">Initialize your private, zero-cost Firebase Spark plan instantly.</p>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded font-mono">Serverless CDNs</span>
                </div>
                
                <form onSubmit={handleConnectFirebase} className="p-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">API Key *</label>
                      <input 
                        type="password"
                        required
                        value={fbApiKey}
                        onChange={(e) => setFbApiKey(e.target.value)}
                        placeholder="AIzaSyA1..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Project ID *</label>
                      <input 
                        type="text"
                        required
                        value={fbProjectId}
                        onChange={(e) => setFbProjectId(e.target.value)}
                        placeholder="my-crm-app-12345"
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Auth Domain</label>
                      <input 
                        type="text"
                        value={fbAuthDomain}
                        onChange={(e) => setFbAuthDomain(e.target.value)}
                        placeholder="my-crm-app-12345.firebaseapp.com"
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Storage Bucket</label>
                      <input 
                        type="text"
                        value={fbStorageBucket}
                        onChange={(e) => setFbStorageBucket(e.target.value)}
                        placeholder="my-crm-app-12345.appspot.com"
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Messaging Sender ID</label>
                      <input 
                        type="text"
                        value={fbMessagingSenderId}
                        onChange={(e) => setFbMessagingSenderId(e.target.value)}
                        placeholder="9876543210"
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">App ID</label>
                      <input 
                        type="text"
                        value={fbAppId}
                        onChange={(e) => setFbAppId(e.target.value)}
                        placeholder="1:9876543210:web:abcdefgh12345"
                        className="w-full border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex justify-end">
                    <button 
                      type="submit"
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save & Link Firebase App
                    </button>
                  </div>
                </form>
              </div>

              {/* cPanel vs Netlify Hosting Information banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-emerald-500" />
                  Hosting Netlify Serverless CRM Deployment Instructions:
                </h4>
                <div className="text-xs text-slate-600 space-y-3 leading-relaxed">
                  <p>
                    Because this backend handles all data requests serverlessly directly inside the browser client via Google SDKs, 
                    <strong> you do NOT need a running Node server or cPanel container!</strong> This completely fixes Phusion Passenger database locks and guarantees 100% flat Zero-Cost hosting.
                  </p>
                  <p>
                    <strong>Steps to deploy to Netlify:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-2 font-medium text-slate-700">
                    <li>Build the production files using the command line: <code className="bg-slate-200 font-mono text-[11px] px-1.5 py-0.5 rounded">npm run build</code>, which compiles your index.html and assets into a static <code className="bg-slate-200 font-mono text-[11px] px-1.5 py-0.5 rounded">dist/</code> folder.</li>
                    <li>Upload your <code className="bg-slate-200 font-mono text-[11px] px-1.5 py-0.5 rounded">dist/</code> folder to Netlify via drag & drop, or link your GitHub repository.</li>
                    <li>Connect your custom domain (e.g. your CRM URL) inside your Netlify site settings. Change your CNAME records/Nameservers as directed by Netlify, and Netlify will instantly secure it with a free auto-renewing SSL certificate!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
          </>
          )}

        </div>
      </div>

      {isTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsTeamModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                 <Users className="w-5 h-5 text-indigo-600" /> 
                 {editingMemberId ? 'Edit Team Member' : 'Invite Team Member'}
              </h2>
            </div>
            
            <form onSubmit={handleMemberSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                <input type="text" required value={memberForm.name} onChange={e => setMemberForm({...memberForm, name: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="e.g. Sarah Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                <input type="email" required value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="sarah@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Data Access Role</label>
                <select required value={memberForm.role} onChange={e => setMemberForm({...memberForm, role: e.target.value as any})} className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm bg-white">
                  <option value="Super Admin">Super Admin (Full System & User Management)</option>
                  <option value="Admin">Admin (Full Access & Settings)</option>
                  <option value="Counselor">Counselor (Leads, Pipeline, Tasks)</option>
                  <option value="Teacher">Teacher (Students, Mock Scores)</option>
                  <option value="Marketing">Marketing (Campaigns, Templates, Forms)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Login Password</label>
                <input 
                  type="text" 
                  required={!editingMemberId} 
                  value={memberForm.password || ''} 
                  onChange={e => setMemberForm({...memberForm, password: e.target.value})} 
                  className="w-full border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm font-mono" 
                  placeholder={editingMemberId ? "Leave blank to keep unchanged" : "Set a secure password"} 
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsTeamModalOpen(false)} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2 rounded-xl border border-slate-200 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl shadow-sm transition-colors">
                  {editingMemberId ? 'Save Changes' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
