import React, { useState } from 'react';
import { LayoutDashboard, Users, MessageSquare, Settings, Menu, X, LogOut, GraduationCap, ChevronRight, FormInput, KanbanSquare, CheckSquare, Star, FileText, Zap, ShieldCheck } from 'lucide-react';
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
  
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  const { user, loading, signInWithEmail, signUpWithEmail, logOut } = useAuth();

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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full space-y-6">
          <div className="text-center">
            <div className="bg-indigo-100 p-3 rounded-xl inline-flex mb-3">
              <GraduationCap className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-xl font-display font-bold text-slate-900">IELTS Revolution CRM</h1>
            <p className="text-xs text-slate-500 mt-1">
              Administrator
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs border border-red-100 font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div className="animate-in slide-in-from-top-2 duration-200">
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
          </form>
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
          <div className="max-w-7xl mx-auto p-6 md:p-8">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
}
