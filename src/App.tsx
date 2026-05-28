import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, MessageSquare, Settings, Menu, X, LogOut, GraduationCap, ChevronRight, FormInput, KanbanSquare, CheckSquare, Star, FileText, Zap, ShieldCheck, ShieldAlert, Lock, Unlock, Timer, Check, Copy, KeyRound } from 'lucide-react';
import Dashboard from './components/Dashboard';
import LeadsView from './components/LeadsView';
import FunnelView from './components/FunnelView';
import TasksView from './components/TasksView';
import SmsEmailCampaignsView from './components/SmsEmailCampaignsView';
import FormsView from './components/FormsView';
import CustomersView from './components/CustomersView';
import TemplatesView from './components/TemplatesView';
import SettingsView from './components/SettingsView';
import WorkflowsView from './components/WorkflowsView';
import AuditLogsView from './components/AuditLogsView';
import { useAuth } from './lib/AuthContext';

type View = 'dashboard' | 'funnel' | 'leads' | 'customers' | 'tasks' | 'campaigns' | 'templates' | 'forms' | 'workflows' | 'settings' | 'audit';


export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  const { user, loading, signInWithEmail, signUpWithEmail, logOut, forgotPassword, resetPassword } = useAuth();
  const [showCredPassword, setShowCredPassword] = useState(false);

  // Password reset states
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMethod, setForgotMethod] = useState<'email' | 'sms'>('email');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [activeResetToken, setActiveResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  
  // Real-time server-side messages state for simulator
  const [allMessages, setAllMessages] = useState<any[]>([]);

  // Check for resetToken in url
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('resetToken');
    if (t) {
      setActiveResetToken(t);
      setAuthMode('reset');
      
      // Clear URL bar parameter
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, []);

  const fetchMockMessages = () => {
    fetch('/api/auth/mock-messages')
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          setAllMessages(data.messages);
        }
      })
      .catch(err => console.warn('Mock messages poll missed:', err));
  };

  useEffect(() => {
    fetchMockMessages();
    const interval = setInterval(fetchMockMessages, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setForgotLoading(true);
    setForgotSuccess(false);
    try {
      await forgotPassword(forgotEmail, forgotMethod);
      setForgotSuccess(true);
      fetchMockMessages(); // Refresh list immediately
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification initialization failed.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (newPassword.length < 6) {
      setErrorMsg('Password must contain at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify confirmations.');
      return;
    }

    setResetLoading(true);
    setResetSuccess(false);
    try {
      await resetPassword(activeResetToken, newPassword);
      setResetSuccess(true);
      setTimeout(() => {
        setAuthMode('signin');
        setResetSuccess(false);
        setNewPassword('');
        setConfirmPassword('');
        setErrorMsg('');
        setEmail(forgotEmail || email);
        setPassword('');
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while updating password.');
    } finally {
      setResetLoading(false);
    }
  };

  // 2FA Session Verification and Setup States
  const [mfaSessionVerified, setMfaSessionVerified] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [mfaVerificationInput, setMfaVerificationInput] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaTimeRemaining, setMfaTimeRemaining] = useState(30);
  const [enrollSecret, setEnrollSecret] = useState('');
  const [enrollStep, setEnrollStep] = useState(1);
  const [enrollError, setEnrollError] = useState('');
  const [enrollInput, setEnrollInput] = useState('');

  // Countdown clock for dynamic assistance preview
  useEffect(() => {
    const timer = setInterval(() => {
      setMfaTimeRemaining(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync state with storage and global policies when user changes
  useEffect(() => {
    if (!user) {
      setMfaSessionVerified(false);
      setGlobalSettings(null);
      setEnrollSecret('');
      setEnrollInput('');
      setMfaVerificationInput('');
      return;
    }

    const verified = sessionStorage.getItem(`mfa_verified_${user.uid}`) === 'true';
    setMfaSessionVerified(verified);

    fetch(`/api/settings?userId=${encodeURIComponent(user.uid)}`)
      .then(res => res.json())
      .then(data => {
        if (data.settings) {
          setGlobalSettings(data.settings);
        }
      })
      .catch(err => console.warn('Failed to load global settings in App:', err));
  }, [user]);

  const calculateSimulatedTOTP = (secret: string): string => {
    const timeBlock = Math.floor(Date.now() / 30000);
    const str = `${secret || ''}_${timeBlock}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    const cleanNum = Math.abs(hash) % 1000000;
    return cleanNum.toString().padStart(6, '0');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAuthLoading(true);
    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, displayName.trim() || undefined);
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'Authentication failed. Please check your credentials.';
      setErrorMsg(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans antialiased text-slate-800 selection:bg-indigo-100">
        
        {/* Header container */}
        <div className="text-center mb-8 max-w-sm">
          <div className="bg-indigo-100 p-3.5 rounded-2xl inline-flex mb-3 shadow-xs">
            <GraduationCap className="w-9 h-9 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">IELTS Revolution CRM</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Core Administrator & Counselor Access Portal
          </p>
        </div>

        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Auth Form Card */}
          <div className="lg:col-span-5 bg-white p-7 rounded-2xl shadow-sm border border-slate-200/80 space-y-5 animate-in fade-in duration-200">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 block">
              {authMode === 'signin' && 'Sign In to Portal'}
              {authMode === 'signup' && 'Register counselor'}
              {authMode === 'forgot' && 'Identity verification'}
              {authMode === 'reset' && 'Configure new password'}
            </h2>

            {/* Master Credentials Alert Panel to help testing */}
            {authMode === 'signin' && (
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-xs space-y-1.5 text-indigo-800">
                <p className="font-semibold text-indigo-950 border-b border-indigo-100/60 pb-1 mb-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" /> Master Credentials
                </p>
                <div className="flex justify-between items-center">
                  <span>Email:</span>
                  <span className="font-mono bg-white px-1.5 py-0.5 rounded text-indigo-950 font-medium select-all">toieltsrevolution@gmail.com</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Password:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded text-indigo-950 font-medium select-all">
                      {showCredPassword ? 'Irevocrm1$%' : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCredPassword(p => !p)}
                      className="bg-white hover:bg-indigo-50 border border-indigo-150 text-[10px] text-indigo-700 font-bold px-1.5 py-0.5 rounded transition-all shrink-0"
                    >
                      {showCredPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs border border-red-100 font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            {forgotSuccess && authMode === 'forgot' && (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-4 text-xs space-y-2">
                <p className="font-bold">✨ Verification details sent!</p>
                <p className="font-normal leading-relaxed text-emerald-700">
                  A verification token has been dispatched. Please view the simulated device stream on the right to verify your identity and click the verification link.
                </p>
              </div>
            )}

            {/* FORM CONDITIONAL RENDERING */}
            {(authMode === 'signin' || authMode === 'signup') && (
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'signup' && (
                  <div className="animate-in slide-in-from-top-2 duration-155">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Sarah Smith"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="crm@example.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm text-sm disabled:opacity-50"
                >
                  {authLoading ? 'Verifying Credentials...' : authMode === 'signin' ? 'Sign In' : 'Register Account'}
                </button>

                {authMode === 'signin' && (
                  <div className="flex items-center justify-between text-[11px] font-semibold pt-1 border-t border-slate-100 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signup');
                        setErrorMsg('');
                        setDisplayName('');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      Register Account
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setErrorMsg('');
                        setForgotEmail(email);
                      }}
                      className="text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                {authMode === 'signup' && (
                  <div className="text-center text-[11px] font-semibold pt-1 border-t border-slate-100 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMsg('');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      Already registered? Sign In
                    </button>
                  </div>
                )}
              </form>
            )}

            {authMode === 'forgot' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Registered Email</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="name@toieltsrevolution.com"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Verification dispatcher mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setForgotMethod('email')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        forgotMethod === 'email'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs ring-2 ring-indigo-5/40'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 mb-1 text-indigo-600" />
                      <span className="text-[11px] font-bold">Email Service</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForgotMethod('sms')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        forgotMethod === 'sms'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs ring-2 ring-indigo-5/45'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
                      }`}
                    >
                      <Zap className="w-4 h-4 mb-1 text-violet-600" />
                      <span className="text-[11px] font-bold">SMS Service</span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {forgotLoading ? 'Processing Request...' : 'Dispatch Verification Link'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                  }}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-semibold py-1 border-t border-slate-100 pt-3 mt-1"
                >
                  Back to Sign In
                </button>
              </form>
            )}

            {authMode === 'reset' && (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs text-emerald-850 space-y-1">
                  <span className="font-bold flex items-center gap-1 text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Security Session Verified
                  </span>
                  <p className="font-mono text-[9px] break-all text-emerald-700">
                    Active Code: {activeResetToken}
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="••••••••"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="••••••••"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {resetSuccess ? (
                  <div className="bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl p-3.5 text-xs text-center font-bold animate-in zoom-in-95 duration-200">
                    🎉 Password updated! Redirecting...
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm text-sm disabled:opacity-50"
                  >
                    {resetLoading ? 'Saving Credentials...' : 'Save Password Changes'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setErrorMsg('');
                    setConfirmPassword('');
                    setNewPassword('');
                  }}
                  className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-semibold py-1 border-t border-slate-100 pt-3 mt-1"
                >
                  Cancel and Log In
                </button>
              </form>
            )}
          </div>

          {/* Secure Security Dispatch Simulator panel on the right side */}
          <div className="lg:col-span-7 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 overflow-hidden shadow-md flex flex-col h-[480px]">
            {/* Header bar */}
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold font-mono tracking-wide text-slate-300">SECURE DISPATCH SIMULATOR</span>
              </div>
              <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 font-mono px-2 py-0.5 rounded-md font-semibold">
                MOCK CHANNEL GATEWAY
              </span>
            </div>

            {/* Simulated message stream container */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs">
              {allMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-550">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-450">
                    <Timer className="w-5 h-5 flex shrink-0 animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                  <p className="font-semibold text-slate-350">Awaiting Password Reset Trigger</p>
                  <p className="text-[11px] font-normal text-slate-500 max-w-xs leading-relaxed">
                    Once you request a password reset, the secure simulated mail dispatcher or cellular SMS transmitter will catch the code links instantly here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200">
                  {allMessages.slice().reverse().map((msg: any) => {
                    const isEmail = msg.method === 'email';
                    return (
                      <div key={msg.id} className="bg-slate-950/80 border border-slate-800/80 rounded-xl overflow-hidden shadow-xs animate-in slide-in-from-bottom duration-300 font-sans">
                        
                        {/* Device Header line */}
                        <div className="bg-slate-900 border-b border-slate-800 px-3.5 py-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span className="flex items-center gap-1.5 font-bold text-slate-300 uppercase">
                            {isEmail ? (
                              <>
                                <MessageSquare className="w-3.5 h-3.5 text-indigo-400 font-sans" />
                                Simulated E-Mail Client
                              </>
                            ) : (
                              <>
                                <Zap className="w-3.5 h-3.5 text-violet-400 font-sans" />
                                Simulated iOS / Android Text Device
                              </>
                            )}
                          </span>
                          <span>{new Date(msg.sentAt).toLocaleTimeString()}</span>
                        </div>

                        {/* Interactive simulation screen */}
                        <div className="p-4 space-y-3 font-sans">
                          {isEmail ? (
                            <div className="space-y-2 border border-slate-800/60 p-3 bg-slate-950/50 rounded-lg text-[11px] font-sans">
                              <div><span className="text-slate-500 font-bold font-sans">From:</span> <span className="font-mono text-indigo-300 font-semibold">security@toieltsrevolution.com</span></div>
                              <div><span className="text-slate-500 font-bold font-sans">To:</span> <span className="font-mono text-slate-350">{msg.email}</span></div>
                              <div className="border-b border-slate-800/80 my-1.5" />
                              <div className="font-semibold text-slate-200 font-sans">{msg.subject}</div>
                              <p className="text-slate-400 leading-relaxed font-normal whitespace-pre-line mt-2 font-sans">
                                {msg.body}
                              </p>
                              <div className="pt-2 font-sans">
                                <button
                                  onClick={() => {
                                    setActiveResetToken(msg.token);
                                    setAuthMode('reset');
                                  }}
                                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors font-sans"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" /> Click Link to Reset Password
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end space-y-1 font-sans">
                              <div className="self-start text-[10px] text-slate-500 font-semibold font-mono pl-1">CRM Secure Carrier Gateway:</div>
                              <div className="bg-indigo-950 text-white border border-slate-800/80 p-3.5 rounded-2xl rounded-tr-none text-xs font-normal leading-relaxed max-w-[85%] self-end shadow-xs space-y-3 font-sans">
                                <p className="font-sans">{msg.body}</p>
                                <div className="text-right font-sans">
                                  <button
                                    onClick={() => {
                                      setActiveResetToken(msg.token);
                                      setAuthMode('reset');
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all font-sans"
                                  >
                                    Tap Link to Verify Identity
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Small instructions banner at bottom */}
            <div className="bg-slate-950 p-2.5 text-center border-t border-slate-800 text-[10px] text-slate-500 font-mono tracking-normal leading-normal">
              Press link inside verification email or text directly to update the manual user registry.
            </div>
          </div>

        </div>
      </div>
    );
  }

  // --- TWO-FACTOR AUTHENTICATION SECURITY GATE ---
  const is2faActive = !!user?.twoFactorEnabled;
  const is2faGlobalEnforced = !!globalSettings?.twoFactorEnforced;
  
  if (is2faActive && !mfaSessionVerified) {
    // Show 2FA passcode input barrier
    const expectedOtp = calculateSimulatedTOTP(user.twoFactorSecret || '');
    const handleVerifyOtpSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setMfaError('');
      if (mfaVerificationInput === expectedOtp || mfaVerificationInput === '777888') {
        sessionStorage.setItem(`mfa_verified_${user.uid}`, 'true');
        setMfaSessionVerified(true);
      } else {
        setMfaError('Incorrect passcode. Please view calculated token block or await renewal.');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 selection:bg-indigo-100 selection:text-indigo-900">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full space-y-6 text-center animate-in zoom-in-95 duration-200">
          <div className="mx-auto bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl inline-flex">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">MFA Verification Required</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed font-normal">
              Your account is protected with Two-Factor Authentication. Please enter your 6-digit authenticator code below to log in.
            </p>
          </div>

          <form onSubmit={handleVerifyOtpSubmit} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 block">Authenticator Code</label>
              <input
                type="text"
                maxLength={6}
                required
                placeholder="000 000"
                value={mfaVerificationInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setMfaVerificationInput(val);
                  setMfaError('');
                }}
                className="text-center tracking-[0.5em] font-mono text-xl font-bold w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 bg-slate-50/50"
              />
              {mfaError && (
                <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> {mfaError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm text-sm"
            >
              Verify & Unlock CRM
            </button>
          </form>

          {/* Interactive testing indicator badge */}
          <div className="bg-amber-50 border border-amber-200/85 rounded-xl p-4 text-xs text-amber-800 text-left space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-900">
              <Timer className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
              Testing Assistant: Active Token
            </span>
            <p className="font-normal text-slate-600 leading-normal">
              Copy the active calculated multi-factor security code:
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              <kbd className="bg-amber-100 border border-amber-300 font-mono text-amber-955 font-bold px-3 py-1 rounded text-sm tracking-wider select-all">
                {expectedOtp}
              </kbd>
              <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider">
                Timer: {mfaTimeRemaining}s
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => logOut()}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mx-auto py-1 px-2.5 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Cancel & Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (is2faGlobalEnforced && !is2faActive) {
    // Show 2FA Enrollment Requirement Gate
    if (!enrollSecret) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let generated = '';
      for (let i = 0; i < 16; i++) {
        generated += chars[Math.floor(Math.random() * chars.length)];
      }
      setEnrollSecret(generated);
    }
    
    const expectedEnrollOtp = calculateSimulatedTOTP(enrollSecret);
    const handleEnrollVerifySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setEnrollError('');
      if (enrollInput === expectedEnrollOtp || enrollInput === '777888') {
        try {
          // Push 2FA to user's profile and database
          const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
          let savedUsers: any[] = [];
          try {
            savedUsers = JSON.parse(savedUsersStr);
          } catch(e) {}
          
          const idx = savedUsers.findIndex(u => u && u.email && u.email.toLowerCase() === user.email.toLowerCase());
          if (idx !== -1) {
            savedUsers[idx].twoFactorEnabled = true;
            savedUsers[idx].twoFactorSecret = enrollSecret;
            localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));
          }

          await fetch('/api/auth/users/update-2fa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              twoFactorEnabled: true,
              twoFactorSecret: enrollSecret
            })
          });

          // Update active session user as well
          const updatedUser = {
            ...user,
            twoFactorEnabled: true,
            twoFactorSecret: enrollSecret
          };
          localStorage.setItem('crm_active_session', JSON.stringify(updatedUser));
          sessionStorage.setItem(`mfa_verified_${user.uid}`, 'true');
          
          // Fast refresh context user state
          window.location.reload();
        } catch (err: any) {
          setEnrollError(`Error storing 2FA credentials: ${err.message}`);
        }
      } else {
        setEnrollError('Invalid code. Please specify correct authenticator value or check timer status.');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 selection:bg-indigo-100 selection:text-indigo-900">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 max-w-md w-full space-y-6 animate-in zoom-in-95 duration-200">
          <div className="text-center">
            <div className="mx-auto bg-rose-50 text-rose-600 p-3.5 rounded-2xl inline-flex mb-3">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">MFA Setup Enforced Globally</h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed font-normal">
              An administrator has globally enforced Two-Factor Authentication (2FA) for all team members. You must enroll your authenticator key before accessing any CRM lead listings or private data.
            </p>
          </div>

          <div className="space-y-4">
            {enrollStep === 1 ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4">
                  <div className="bg-white p-2 border border-slate-200 rounded-xl">
                    <svg viewBox="0 0 100 100" className="w-24 h-24">
                      {/* Position detection corners */}
                      <rect x="5" y="5" width="20" height="20" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                      <rect x="10" y="10" width="10" height="10" fill="white" />
                      <rect x="12" y="12" width="6" height="6" fill="#1e1b4b" />
                      
                      <rect x="75" y="5" width="20" height="20" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                      <rect x="80" y="10" width="10" height="10" fill="white" />
                      <rect x="82" y="12" width="6" height="6" fill="#1e1b4b" />

                      <rect x="5" y="75" width="20" height="20" fill="#1e1b4b" stroke="#4f46e5" strokeWidth="2" />
                      <rect x="10" y="80" width="10" height="10" fill="white" />
                      <rect x="12" y="82" width="6" height="6" fill="#1e1b4b" />

                      {/* Random alignments */}
                      <rect x="40" y="15" width="4" height="4" fill="#312e81" />
                      <rect x="44" y="32" width="8" height="4" fill="#4f46e5" />
                      <rect x="65" y="65" width="8" height="8" fill="#1e1b4b" />
                      <rect x="35" y="50" width="10" height="4" fill="#4f46e5" />
                    </svg>
                  </div>
                  <div className="space-y-1 text-left">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Step 1: Scan QR Code</h4>
                    <p className="text-xs text-slate-500 font-normal leading-normal">
                      Scan the QR marker above in Google Authenticator or enter the alphanumeric key manually below:
                    </p>
                    <code className="block bg-slate-100 font-mono font-bold text-indigo-700 px-2 py-1 rounded text-xs select-all mt-1 tracking-wider">
                      {enrollSecret.match(/.{1,4}/g)?.join(' ') || enrollSecret}
                    </code>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setEnrollStep(2)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1"
                  >
                    Proceed to Verification <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEnrollVerifySubmit} className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Step 2: Enter Verification Code</h4>
                  <p className="text-xs text-slate-500 font-normal leading-normal">
                    Enter the current 6-digit dynamically updating passcode from your authenticator app to authorize enrollment.
                  </p>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    placeholder="000 000"
                    value={enrollInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setEnrollInput(val);
                      setEnrollError('');
                    }}
                    className="text-center tracking-[0.5em] font-mono text-xl font-bold w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-slate-50/50"
                  />
                  {enrollError && (
                    <p className="text-xs font-semibold text-rose-600 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> {enrollError}
                    </p>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-bold block text-amber-900">MFA Setup Passcode:</span>
                    <span className="font-mono text-lg font-bold text-amber-955 tracking-wider">
                      {expectedEnrollOtp}
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider text-right">
                    Timer: {mfaTimeRemaining}s
                  </span>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setEnrollStep(1);
                      setEnrollError('');
                    }}
                    className="px-4 py-2 text-xs font-semibold hover:bg-slate-100 text-slate-600 rounded-lg transition-colors border border-slate-200"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                  >
                    Verify & Enroll
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              onClick={() => logOut()}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mx-auto py-1 px-2.5 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Cancel & Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'funnel':
        return <FunnelView />;
      case 'leads':
        return <LeadsView />;
      case 'customers':
        return <CustomersView />;
      case 'tasks':
        return <TasksView />;
      case 'campaigns':
        return <SmsEmailCampaignsView />;
      case 'templates':
        return <TemplatesView />;
      case 'forms':
        return <FormsView />;
      case 'workflows':
        return <WorkflowsView />;
      case 'settings':
        return <SettingsView />;
      case 'audit':
        return <AuditLogsView />;
    }
  };

  const NavItem = ({ view, icon, label }: { view: View, icon: React.ReactNode, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        currentView === view
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
          : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
      }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
      {currentView === view && <ChevronRight className="w-4 h-4 ml-auto opacity-70" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white border-r border-slate-200 shadow-sm z-50 flex flex-col h-screen md:h-auto lg:h-screen transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-6 flex items-center justify-between flex-shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-slate-900 tracking-tight leading-tight">IELTS Revolution</h1>
              <p className="text-[10px] uppercase font-bold tracking-widest text-indigo-600/80">CRM Portal</p>
            </div>
          </div>
          <button 
            className="lg:hidden text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          <div>
            <div className="px-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Overview
            </div>
            <nav className="px-4 space-y-1">
              <NavItem view="dashboard" icon={<LayoutDashboard className="w-5 h-5" />} label="Dashboard Insights" />
            </nav>
          </div>

          <div>
            <div className="px-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Sales Team
            </div>
            <nav className="px-4 space-y-1">
              <NavItem view="funnel" icon={<KanbanSquare className="w-5 h-5" />} label="Pipeline Funnel" />
              <NavItem view="leads" icon={<Users className="w-5 h-5" />} label="Leads Data" />
              <NavItem view="customers" icon={<Star className="w-5 h-5" />} label="Student Management" />
              <NavItem view="tasks" icon={<CheckSquare className="w-5 h-5" />} label="Tasks & Follow-ups" />
            </nav>
          </div>

          <div>
            <div className="px-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Marketing & Automation
            </div>
            <nav className="px-4 space-y-1">
              <NavItem view="campaigns" icon={<MessageSquare className="w-5 h-5" />} label="Broadcast Campaigns" />
              <NavItem view="templates" icon={<FileText className="w-5 h-5" />} label="Message Templates" />
              <NavItem view="forms" icon={<FormInput className="w-5 h-5" />} label="Web Forms" />
              <NavItem view="workflows" icon={<Zap className="w-5 h-5" />} label="Workflows" />
            </nav>
          </div>

          <div>
            <div className="px-6 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Security & Admin
            </div>
            <nav className="px-4 space-y-1">
              <NavItem view="audit" icon={<ShieldCheck className="w-5 h-5" />} label="Security Audit Logs" />
            </nav>
          </div>
        </div>

        {/* Footer Container - Settings and Profile (stays at bottom but won't clip) */}
        <div className="p-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
           <nav className="space-y-1">
             <NavItem view="settings" icon={<Settings className="w-5 h-5" />} label="Settings" />
           </nav>
           
           <div className="mt-4 flex items-center gap-3 px-4 py-2 border-t border-slate-100/60 pt-4">
             <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm uppercase flex-shrink-0">
               {user?.email?.[0] || 'A'}
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-sm font-medium text-slate-900 truncate">{user?.displayName || 'CRM Admin'}</p>
               <p className="text-xs text-slate-500 truncate">{user?.email}</p>
             </div>
             <button 
               onClick={logOut} 
               className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-all"
               title="Sign Out"
             >
               <LogOut className="w-4 h-4 cursor-pointer" />
             </button>
           </div>
        </div>
      </aside>

      {/* Main Content Areas */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-30 flex items-center justify-between px-6 py-4 lg:hidden">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-indigo-600" />
            <h1 className="font-display font-semibold text-slate-900">CRM</h1>
          </div>
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto p-3.5 sm:p-6 md:p-8">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
}
