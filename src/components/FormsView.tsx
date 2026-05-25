import React, { useState } from 'react';
import { Copy, Link as LinkIcon, Code, ExternalLink, CheckCircle, Globe, QrCode, Download } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { QRCodeSVG } from 'qrcode.react';

export default function FormsView() {
  const { user } = useAuth();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  
  // Custom Campaign Info
  const [campaignSource, setCampaignSource] = useState('');
  const [campaignCourse, setCampaignCourse] = useState('');
  const [campaignTags, setCampaignTags] = useState('');

  // Custom Domain State - Defaults to window.location.origin or suggests their host
  const initialOrigin = window.location.origin.includes('run.app') || window.location.origin.includes('localhost')
    ? 'https://crm.ieltsrevolution.com'
    : window.location.origin;

  const [customDomain, setCustomDomain] = useState(initialOrigin);

  // Fallback if not loaded
  if (!user) return null;

  const resolvedUid = user.uid || 'ielts_crm_main_user';
  
  const buildFormUrl = () => {
    let url = `${customDomain.replace(/\/$/, '')}/form`;
    if (campaignSource || campaignCourse || campaignTags) {
       url += `/${encodeURIComponent(campaignSource.trim() || 'organic')}`;
       
       if (campaignCourse || campaignTags) {
         url += `/${encodeURIComponent(campaignCourse.trim() || 'any')}`;
       }
       if (campaignTags) {
         // for path-based tags we just use the first tag, or split them
         const tagsList = campaignTags.split(',').map(s => encodeURIComponent(s.trim())).filter(Boolean);
         if (tagsList.length > 0) {
           url += `/${tagsList.join('/')}`;
         }
       }
    }
    url += `?uid=${resolvedUid}`;
    return url;
  };
  
  const formUrl = buildFormUrl();
  
  const iframeCode = `<iframe src="${formUrl}" width="100%" height="600" frameborder="0" style="border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;"></iframe>`;

  const copyToClipboard = (text: string, type: 'link' | 'iframe') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => handleSuccess(type))
          .catch(() => fallbackCopy(text, type));
      } else {
        fallbackCopy(text, type);
      }
    } catch (e) {
      fallbackCopy(text, type);
    }
  };

  const fallbackCopy = (text: string, type: 'link' | 'iframe') => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.position = 'fixed';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        handleSuccess(type);
      } else {
        alert('Please manually select and copy the link from the input field.');
      }
    } catch (err) {
      console.error('Fallback copy failed', err);
      alert('Please manually select and copy the link from the input field.');
    }
    document.body.removeChild(textarea);
  };

  const handleSuccess = (type: 'link' | 'iframe') => {
    if (type === 'link') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  };

  const downloadQRCode = () => {
    const svg = document.getElementById('qr-code-svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const pngFile = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.download = 'crm-lead-qr.png';
          downloadLink.href = `${pngFile}`;
          downloadLink.click();
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900">Lead Capture Forms</h1>
          <p className="text-slate-500 text-sm mt-1">Share this form or embed it on your website to automatically capture new leads.</p>
        </div>
        
        {/* Custom Host Configurator */}
        <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 max-w-sm">
          <Globe className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="flex-1">
            <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">Form Domain URL</label>
            <input 
              type="text" 
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none w-full mt-1 border-b border-indigo-200 focus:border-indigo-650"
              placeholder="e.g. https://crm.ieltsrevolution.com"
            />
          </div>
          <button 
            type="button"
            onClick={() => setCustomDomain('https://crm.ieltsrevolution.com')}
            className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-2 py-1 rounded font-medium shrink-0 transition-colors"
            title="Set to https://crm.ieltsrevolution.com"
          >
            Reset to Hub
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* QR Code Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 flex items-center justify-center rounded-xl mb-4">
            <QrCode className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">QR Code</h2>
          <p className="text-xs text-slate-500 mt-2 mb-4">
            Print this QR code on flyers, banners, or business cards.
          </p>
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm mb-4">
            <QRCodeSVG 
              id="qr-code-svg"
              value={formUrl} 
              size={150} 
              bgColor={"#ffffff"}
              fgColor={"#0f172a"}
              level={"H"}
              includeMargin={true}
            />
          </div>
          <button 
            onClick={downloadQRCode}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Download QR
          </button>
        </div>
        
        <div className="lg:col-span-2 space-y-6">
          {/* Direct Link Section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 flex items-center justify-center rounded-xl mb-4">
              <LinkIcon className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Direct Form Link</h2>
            <p className="text-sm text-slate-500 mt-2 mb-6">
              Share this link directly in Facebook Ads, WhatsApp, SMS campaigns, or your email signature.
            </p>

            {/* URL Builder Options */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Campaign Link Builder (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Campaign Source</label>
                  <input
                    type="text"
                    value={campaignSource}
                    onChange={(e) => setCampaignSource(e.target.value)}
                    placeholder="e.g. facebook, youtube"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Target Course</label>
                  <input
                    type="text"
                    value={campaignCourse}
                    onChange={(e) => setCampaignCourse(e.target.value)}
                    placeholder="e.g. IELTS Writing"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">Campaign Tags</label>
                  <input
                    type="text"
                    value={campaignTags}
                    onChange={(e) => setCampaignTags(e.target.value)}
                    placeholder="e.g. webinar, high intent"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100 mb-2">
              <input 
                readOnly 
                onClick={(e) => (e.target as HTMLInputElement).select()}
                value={formUrl} 
                className="flex-1 bg-transparent text-sm text-slate-600 outline-none select-all font-mono" 
              />
              <a 
                href={formUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-slate-400 hover:text-indigo-600 transition-colors p-2"
                title="Open link"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button 
                onClick={() => copyToClipboard(formUrl, 'link')}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 p-2 rounded-lg transition-colors shadow-sm flex items-center gap-2 text-xs font-medium shrink-0"
              >
                {copiedLink ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
            
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 font-medium border border-amber-100 flex items-start gap-1">
              Note: Make sure your form is deployed to Netlify/Firebase for the URL to be publicly accessible.
            </p>
          </div>

          {/* Website Embed Section */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 flex items-center justify-center rounded-xl mb-4">
              <Code className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Website Embed Code</h2>
            <p className="text-sm text-slate-500 mt-2 mb-6">
              Copy and paste this HTML snippet into your WordPress website, custom landing page, or blog.
            </p>

            <div className="relative group">
              <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-xs overflow-x-auto border border-slate-800">
                <code>{iframeCode}</code>
              </pre>
              <button 
                onClick={() => copyToClipboard(iframeCode, 'iframe')}
                className="absolute top-3 right-3 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
              >
                {copiedIframe ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedIframe ? 'Copied' : 'Copy HTML'}
              </button>
            </div>
          </div>
        </div>

      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 flex items-start gap-4 mt-6">
        <div className="bg-indigo-100 p-3 rounded-full mt-1">
          <CheckCircle className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h4 className="font-medium text-indigo-900">Automatic Sync</h4>
          <p className="text-indigo-800/70 text-sm mt-1 leading-relaxed">
            All leads submitted through these links, QR codes, or iframes are automatically synced to your <strong>Leads Pipeline</strong> in real-time with the status set to "New". They will be safely assigned to your admin account ID.
          </p>
        </div>
      </div>
    </div>
  );
}
