import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Smartphone, KeyRound, Loader2, Lock, RefreshCw } from 'lucide-react';
import type { LeadSource, LeadStatus } from '../types';
import { triggerGlobalWebhook, triggerWorkflowAutomations } from '../utils/automation';

export default function PublicForm() {
  const [userId, setUserId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    targetCourse: 'IELTS Academic',
    targetBand: '',
    destination: 'United Kingdom',
    source: 'Website Form' as LeadSource
  });

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  
  // OTP Verification States
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [demoCode, setDemoCode] = useState(''); // helper to test OTP in sandbox environments
  const [validationError, setValidationError] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    // Parse userId from URL params query, e.g. /form?uid=123
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    if (uid) {
      setUserId(uid);
    } else {
      setStatus('error');
    }
  }, []);

  // Handle otp countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !formData.phone.trim()) return;

    setVerificationLoading(true);
    setValidationError('');
    
    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setIsOtpSent(true);
        setCountdown(60); // 60 seconds throttle for resend
        if (data.demoCode) {
          setDemoCode(data.demoCode);
        }
      } else {
        setValidationError(data.error || 'Failed to send verification code. Please check key or number format.');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setValidationError('Network error. Unable to request OTP code.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifyOtpAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (!otpCode.trim() || otpCode.length < 4) {
      setValidationError('Please enter a valid verification code.');
      return;
    }

    setVerificationLoading(true);
    setValidationError('');

    try {
      const response = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone, code: otpCode })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setValidationError(data.error || 'Validation failed. Please enter the correct code.');
        setVerificationLoading(false);
        return;
      }

      // If OTP verified successfully, save the lead to MySQL database via API
      setStatus('submitting');
      const leadData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        source: formData.source,
        targetCourse: formData.targetCourse,
        targetBand: formData.targetBand,
        destination: formData.destination,
        status: 'New' as LeadStatus,
        userId: userId,
        phoneVerified: true // marked verified
      };

      const resp = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData)
      });
      const respData = await resp.json();

      if (resp.ok) {
        setStatus('success');
        const createdLead = respData.lead;
        // Trigger automatic webhooks and CRM workflows
        triggerGlobalWebhook(userId, 'Lead Created', createdLead);
        triggerWorkflowAutomations(userId, 'Lead Created', 'New', createdLead);
      } else {
        setValidationError(respData.error || 'Failed to complete lead registration. Try again.');
        setStatus('idle');
      }
    } catch (err) {
      console.error('Error verifying OTP and submitting lead:', err);
      setValidationError('Failed to complete lead registration. Try again.');
      setStatus('idle');
    } finally {
      setVerificationLoading(false);
    }
  };

  if (status === 'error' && !userId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900">Invalid Link</h2>
          <p className="text-slate-500 text-sm mt-2">This form link is missing a valid tracking ID.</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-display font-semibold text-slate-900 mb-2">Thank you!</h2>
          <p className="text-slate-500">Your inquiry has been submitted. Our team will contact you shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8">
      <div className="bg-white p-6 sm:p-8 border border-slate-200 shadow-xl shadow-slate-200/40 rounded-3xl w-full max-w-md">
        
        {!isOtpSent ? (
          // STEP 1: Capture Details & Send OTP
          <form onSubmit={handleSendOtp} className="space-y-5">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-display font-bold text-slate-900">Get Free Consultation</h1>
              <p className="text-sm text-slate-500 mt-2">Drop your contact details and our IELTS experts will guide you.</p>
            </div>

            {validationError && (
              <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{validationError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-800"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-800"
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone Number (For OTP Verification)</label>
              <div className="relative">
                <input 
                  type="tel" 
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-800"
                  placeholder="e.g. 01711223344"
                />
                <Smartphone className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Course</label>
                <select
                  value={formData.targetCourse}
                  onChange={(e) => setFormData({ ...formData, targetCourse: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-850"
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
                  min="4"
                  max="9"
                  value={formData.targetBand}
                  onChange={(e) => setFormData({ ...formData, targetBand: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-800"
                  placeholder="e.g. 7.5"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Target Country</label>
              <select
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow bg-slate-50 focus:bg-white text-slate-850"
              >
                <option value="Australia">Australia</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="USA">USA</option>
                <option value="Canada">Canada</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <input type="hidden" value={formData.source} />

            <button 
              type="submit" 
              disabled={verificationLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              {verificationLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Verification Code...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Send Verification Code & Submit
                </>
              )}
            </button>
          </form>
        ) : (
          // STEP 2: Challenging Code Input
          <form onSubmit={handleVerifyOtpAndSubmit} className="space-y-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                <KeyRound className="w-6 h-6 text-indigo-600 animate-pulse" />
              </div>
              <h1 className="text-xl font-display font-bold text-slate-900">Verify Your Phone</h1>
              <p className="text-xs text-slate-500 mt-2">
                We sent a 6-digit verification code to
              </p>
              <p className="text-sm font-bold text-slate-850 mt-1">{formData.phone}</p>
            </div>

            {validationError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 font-medium">
                {validationError}
              </div>
            )}

            <div>
              <label className="block text-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                Enter Verification Code
              </label>
              <input 
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="------"
                className="w-full text-center tracking-[12px] font-mono text-2xl font-bold border border-slate-200 rounded-xl py-3.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-900 focus:outline-none uppercase"
              />
            </div>

            {demoCode && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-center">
                <span className="text-[11px] font-semibold text-indigo-800 flex items-center justify-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  CRM Sandbox Bypass Code:
                  <strong className="text-xs bg-white text-indigo-700 px-1.5 py-0.5 rounded font-mono border border-indigo-200">{demoCode}</strong>
                </span>
              </div>
            )}

            <div className="space-y-3">
              <button 
                type="submit" 
                disabled={verificationLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {verificationLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking Code...
                  </>
                ) : (
                  'Complete & Secure Submit'
                )}
              </button>

              <div className="flex items-center justify-between text-xs px-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsOtpSent(false);
                    setOtpCode('');
                    setValidationError('');
                  }}
                  className="text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  ← Edit Phone Number
                </button>

                {countdown > 0 ? (
                  <span className="text-slate-400 italic">
                    Resend code in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Resend Code
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
