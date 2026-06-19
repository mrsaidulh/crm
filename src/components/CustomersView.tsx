import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Mail, Phone, ExternalLink, ShieldCheck, FileEdit, Calculator, GraduationCap, X, UserSearch, Trash2, Download } from 'lucide-react';
import type { Lead, MockScore } from '../types';
import { format } from 'date-fns';
import CustomerProfileModal from './CustomerProfileModal';
import { calculateLeadScore } from '../utils/scoring';

export default function CustomersView() {
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingScoresForId, setManagingScoresForId] = useState<string | null>(null);
  const [viewingProfileFor, setViewingProfileFor] = useState<Lead | null>(null);

  const [scoreForm, setScoreForm] = useState({
    listening: '', reading: '', writing: '', speaking: ''
  });

  const { user, isSuperAdmin } = useAuth();
  const userId = user?.uid || 'ielts_crm_main_user';

  const handleDeleteStudent = async (id: string) => {
    if (!isSuperAdmin) {
      alert('Access Denied: Only a Super Admin is authorized to permanently delete student records.');
      return;
    }
    if (!confirm('Are you absolutely sure you want to permanently delete this student record from leads, test scores, and follow-ups? This action is irreversible.')) return;
    try {
      const resp = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setCustomers(prev => prev.filter(c => c.id !== id));
      } else {
        alert('Failed to delete student.');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting student.');
    }
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leads?userId=${encodeURIComponent(userId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.leads) {
          // filter for enrolled students only
          const enrolled = data.leads.filter((l: Lead) => l.status === 'Enrolled');
          enrolled.sort((a, b) => b.createdAt - a.createdAt);
          setCustomers(enrolled);
        }
      })
      .catch(error => console.error('Error fetching student list:', error))
      .finally(() => setLoading(false));
  }, [userId]);

  const openScoresModal = (student: Lead) => {
    setManagingScoresForId(student.id);
    setScoreForm({ listening: '', reading: '', writing: '', speaking: '' });
  };

  const handleScoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingScoresForId) return;

    const student = customers.find(c => c.id === managingScoresForId);
    if (!student) return;

    const l = parseFloat(scoreForm.listening) || 0;
    const r = parseFloat(scoreForm.reading) || 0;
    const w = parseFloat(scoreForm.writing) || 0;
    const s = parseFloat(scoreForm.speaking) || 0;
    
    // Exact IELTS rounding logic or simple average
    const avg = (l + r + w + s) / 4;
    const overall = Math.round(avg * 2) / 2; // rounds to nearest 0.5

    const newScore: MockScore = {
      date: Date.now(),
      listening: l,
      reading: r,
      writing: w,
      speaking: s,
      overall
    };

    const updatedScores = [...(student.mockScores || []), newScore];

    try {
      const response = await fetch(`/api/leads/${managingScoresForId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockScores: updatedScores })
      });
      if (response.ok) {
        setCustomers(prev => prev.map(c => c.id === managingScoresForId ? { ...c, mockScores: updatedScores } : c));
        setManagingScoresForId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportCSV = () => {
    const isAdmin = isSuperAdmin || user?.role === 'Admin';
    if (!isAdmin) {
      alert("Access Denied: Only Admins are authorized to download student data reports.");
      return;
    }
    if (customers.length === 0) {
      alert("No students found in the current list to export.");
      return;
    }
    const headers = [
      "Name",
      "Email",
      "Phone",
      "Target Course",
      "Target Band",
      "Destination",
      "Latest Mock Test (Overall)",
      "Listening Score",
      "Reading Score",
      "Writing Score",
      "Speaking Score",
      "Lead Score",
      "Lead Status",
      "Enrolled At",
    ];

    const rows = customers.map((cust) => {
      const latestScore = cust.mockScores?.length ? cust.mockScores[cust.mockScores.length - 1] : null;
      const scoreDetails = calculateLeadScore(cust);
      return [
        cust.name,
        cust.email,
        cust.phone,
        cust.targetCourse || "",
        cust.targetBand || "",
        cust.destination || "",
        latestScore ? latestScore.overall.toFixed(1) : "N/A",
        latestScore ? latestScore.listening.toString() : "N/A",
        latestScore ? latestScore.reading.toString() : "N/A",
        latestScore ? latestScore.writing.toString() : "N/A",
        latestScore ? latestScore.speaking.toString() : "N/A",
        scoreDetails.score,
        cust.status || "Enrolled",
        cust.createdAt ? format(new Date(cust.createdAt), "yyyy-MM-dd HH:mm:ss") : "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((e) =>
        e.map((val) => `"${String(val || "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `enrolled_students_report_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading students...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Student Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage enrolled students, track mock test scores, and monitor progress.</p>
        </div>
        {(isSuperAdmin || user?.role === 'Admin') && (
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-indigo-600 hover:text-indigo-805 border border-indigo-200/60 hover:border-indigo-300 px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            title="Download current enrolled student records as a CSV report"
          >
            <Download className="w-4 h-4 text-indigo-500 animate-pulse" />
            Download CSV
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Course Info</th>
                <th className="px-6 py-4">Latest Mock Score</th>
                <th className="px-6 py-4">Lead Score</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No enrolled students yet. Convert leads to "Enrolled" in the Pipeline.
                  </td>
                </tr>
              ) : (
                customers.map((customer, index) => {
                  const latestScore = customer.mockScores?.length ? customer.mockScores[customer.mockScores.length - 1] : null;
                  const scoreDetails = calculateLeadScore(customer);

                  return (
                    <tr key={customer.id || `cust-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{customer.name}</div>
                            <div className="text-[11px] text-slate-500" title={customer.notes}>
                               {customer.phone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className="text-slate-800 font-medium text-xs flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                            {customer.targetCourse || 'Course Unspecified'}
                          </span>
                          {(customer.targetBand || customer.destination) && (
                            <span className="text-xs text-slate-500 font-medium">
                               Aim: {customer.targetBand ? `${customer.targetBand} Band` : 'TBD'} 
                               {customer.destination ? ` (${customer.destination})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {latestScore ? (
                          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-900 px-3 py-1.5 rounded-lg border border-indigo-100/50">
                             <div className="font-bold text-base">{latestScore.overall.toFixed(1)}</div>
                             <div className="w-px h-6 bg-indigo-200/50 mx-1"></div>
                             <div className="text-[10px] space-y-0.5 font-mono text-indigo-700/80">
                               <div className="flex gap-2"><span>L:{latestScore.listening}</span><span>R:{latestScore.reading}</span></div>
                               <div className="flex gap-2"><span>W:{latestScore.writing}</span><span>S:{latestScore.speaking}</span></div>
                             </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">No scores yet</span>
                        )}
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
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                         <button 
                           onClick={() => setViewingProfileFor(customer)}
                           className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-emerald-100 flex items-center gap-1.5"
                         >
                           <UserSearch className="w-3.5 h-3.5" /> 360° Profile
                         </button>
                         <button 
                           onClick={() => openScoresModal(customer)}
                           className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100"
                         >
                           Add Mock Score
                         </button>
                         {isSuperAdmin && (
                           <button 
                             onClick={() => handleDeleteStudent(customer.id)}
                             className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors border border-red-100 flex items-center justify-center"
                             title="Delete Student Record"
                           >
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                         )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {managingScoresForId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setManagingScoresForId(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-600" /> Log Mock Score
              </h2>
              <button onClick={() => setManagingScoresForId(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleScoreSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Listening</label>
                  <input type="number" step="0.5" min="0" max="9" required value={scoreForm.listening} onChange={e => setScoreForm({...scoreForm, listening: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 font-mono text-center focus:ring-2 focus:ring-indigo-500" placeholder="0.0" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Reading</label>
                  <input type="number" step="0.5" min="0" max="9" required value={scoreForm.reading} onChange={e => setScoreForm({...scoreForm, reading: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 font-mono text-center focus:ring-2 focus:ring-indigo-500" placeholder="0.0" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Writing</label>
                  <input type="number" step="0.5" min="0" max="9" required value={scoreForm.writing} onChange={e => setScoreForm({...scoreForm, writing: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 font-mono text-center focus:ring-2 focus:ring-indigo-500" placeholder="0.0" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Speaking</label>
                  <input type="number" step="0.5" min="0" max="9" required value={scoreForm.speaking} onChange={e => setScoreForm({...scoreForm, speaking: e.target.value})} className="w-full border border-slate-200 rounded-xl px-4 py-2 font-mono text-center focus:ring-2 focus:ring-indigo-500" placeholder="0.0" />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl transition-colors shadow-sm">
                  Save Scores
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingProfileFor && (
        <CustomerProfileModal 
          customer={viewingProfileFor} 
          onClose={() => setViewingProfileFor(null)} 
        />
      )}
    </div>
  );
}
