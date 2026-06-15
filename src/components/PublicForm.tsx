import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Smartphone,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  GraduationCap,
  Globe,
} from "lucide-react";
import type { LeadSource, LeadStatus } from "../types";
import {
  triggerGlobalWebhook,
  triggerWorkflowAutomations,
  evaluateKeywordsTrigger,
} from "../utils/automation";

/**
 * Utility to sanitize dynamic user input in client-side to prevent Cross-Site Scripting (XSS)
 * when displaying or parsing inputs in templates.
 */
const sanitizeInput = (val: string): string => {
  return val
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

const COUNTRY_CODES: Record<string, string> = {
  BD: "+880",
  US: "+1",
  CA: "+1",
  GB: "+44",
  AU: "+61",
  NZ: "+64",
  IE: "+353",
  DE: "+49",
  IN: "+91",
  PK: "+92",
  SG: "+65",
  MY: "+60",
  AE: "+971",
  SA: "+966",
  QA: "+974",
};

export default function PublicForm() {
  const [userId, setUserId] = useState<string | null>(null);

  // Clean, structured local state for Free Consultation Form
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    targetCourse: "", // Empty by default to force manual select course list
    targetBand: "",
    destination: "", // Empty by default to force manual select country list
    source: "Website Form" as LeadSource,
  });

  // State to track if inputs have been blurred or modified to enable smart real-time validation UX
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    targetCourse: false,
    targetBand: false,
    destination: false,
  });

  // State to hold validation error messages for each field
  const [errors, setErrors] = useState({
    name: "",
    email: "",
    phone: "",
    targetCourse: "",
    targetBand: "",
    destination: "",
  });

  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [toastMessage, setToastMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Custom Country storage for "Others" selection
  const [customCountry, setCustomCountry] = useState("");
  const coreCountries = React.useMemo(
    () => [
      "United Kingdom",
      "USA",
      "Canada",
      "Australia",
      "New Zealand",
      "Germany",
      "Ireland",
    ],
    [],
  );

  useEffect(() => {
    if (
      formData.destination &&
      formData.destination !== "Others" &&
      formData.destination !== "Other" &&
      !coreCountries.includes(formData.destination)
    ) {
      setCustomCountry(formData.destination);
    }
  }, [formData.destination, coreCountries]);

  // OTP Verification States
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [demoCode, setDemoCode] = useState(""); // helper to test OTP in sandbox environments
  const [validationError, setValidationError] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);

  // UTM Parameters Tracking State
  const [utmParams, setUtmParams] = useState({
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
  });

  // Parse userId and dynamic tracking info from URL paths or query params
  // Supports formats like /form/facebook/ieltswriting/webinar or ?source=facebook&course=IELTS Writing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    let uid = params.get("uid");
    let urlSource = params.get("source") || params.get("utm_source");
    let urlCourse =
      params.get("targetCourse") ||
      params.get("course") ||
      params.get("utm_campaign");
    let urlDestination = params.get("destination") || params.get("country");
    let urlTagsParam =
      params.get("tags") || params.get("utm_medium") || params.get("campaign");

    // Capture precise standard UTM campaign parameter values for hidden fields and CRM logs
    const utm_source = params.get("utm_source") || "";
    const utm_medium = params.get("utm_medium") || "";
    const utm_campaign = params.get("utm_campaign") || "";
    const utm_term = params.get("utm_term") || "";
    const utm_content = params.get("utm_content") || "";

    setUtmParams({
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    });

    if (pathParts.length > 1 && pathParts[0] === "form") {
      if (
        !urlSource &&
        pathParts.length > 1 &&
        !pathParts[1].startsWith("uid")
      ) {
        urlSource = decodeURIComponent(pathParts[1]);
      }
      if (!urlCourse && pathParts.length > 2) {
        urlCourse = decodeURIComponent(pathParts[2]);
      }
      if (pathParts.length > 3) {
        const extraTags = pathParts.slice(3).map(decodeURIComponent);
        if (urlTagsParam) {
          urlTagsParam += "," + extraTags.join(",");
        } else {
          urlTagsParam = extraTags.join(",");
        }
      }
    }

    if (!uid) {
      uid = "ielts_crm_main_user"; // fallback for single-tenant / general ads without explicit uid mapping
    }
    setUserId(uid);

    let finalSource: any = "Website Form";
    if (urlSource) {
      const ls = urlSource.toLowerCase();
      if (ls.includes("facebook") || ls === "fb") finalSource = "Facebook Ads";
      else if (ls.includes("google") || ls.includes("adwords"))
        finalSource = "Google Ads";
      else if (ls.includes("youtube") || ls === "yt")
        finalSource = "Youtube Ads";
      else if (ls.includes("referral")) finalSource = "Referral";
      else finalSource = decodeURIComponent(urlSource);
    }

    setFormData((prev) => ({
      ...prev,
      source: finalSource,
      targetCourse: urlCourse
        ? decodeURIComponent(urlCourse)
        : prev.targetCourse,
      destination: urlDestination
        ? decodeURIComponent(urlDestination)
        : prev.destination,
    }));

    if (urlTagsParam) {
      setHiddenTags(
        urlTagsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }, []);

  // Set automatic country code based on browser IP address on mount
  useEffect(() => {
    const detectCountryCallingCode = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) {
          const data = await res.json();
          if (data.country_calling_code) {
            const code = data.country_calling_code;
            setFormData((prev) => {
              if (!prev.phone || prev.phone === "") {
                return { ...prev, phone: code };
              }
              return prev;
            });
            return;
          }
        }
      } catch (e1) {
        console.warn("First GeoIP attempt failed, trying fallback...", e1);
      }

      try {
        const res = await fetch("https://ipinfo.io/json");
        if (res.ok) {
          const data = await res.json();
          const country = data.country;
          if (country && COUNTRY_CODES[country]) {
            const code = COUNTRY_CODES[country];
            setFormData((prev) => {
              if (!prev.phone || prev.phone === "") {
                return { ...prev, phone: code };
              }
              return prev;
            });
            return;
          }
        }
      } catch (e2) {
        console.warn("Second GeoIP attempt failed:", e2);
      }

      // Default fallback
      setFormData((prev) => {
        if (!prev.phone || prev.phone === "") {
          return { ...prev, phone: "+880" };
        }
        return prev;
      });
    };

    detectCountryCallingCode();
  }, []);

  // Handle OTP countdown timer for rate limiting and client-side throttle
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  /**
   * Field-level validation engine supporting exact regex patterns, length limits,
   * range checks, and custom target course & target band validations.
   */
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case "name": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Full name is required";
        }
        if (trimmed.length < 3) {
          return "Name must be at least 3 characters";
        }
        if (trimmed.length > 50) {
          return "Name must be at most 50 characters";
        }
        // Allows letters, spaces, hyphens and apostrophes
        if (!/^[a-zA-Z\s'-]+$/.test(trimmed)) {
          return "Name can only contain letters, spaces, hyphens, and apostrophes";
        }
        // Check for at least two words (First name & Last name)
        const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
        if (wordCount < 2) {
          return "Please enter your full name (first and last)";
        }
        return "";
      }
      case "email": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Email address is required";
        }
        if (trimmed.length > 100) {
          return "Email address must be at most 100 characters";
        }
        // Standard high-quality email pattern with top-level domain enforcement
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
          return "Please enter a valid email address (e.g., you@email.com)";
        }
        return "";
      }
      case "phone": {
        // Strip spaces and dashes before performing regex validation
        const cleaned = value.replace(/[\s-]/g, "");
        if (!cleaned || cleaned === "+" || cleaned === "+880") {
          return "Phone number is required for OTP verification";
        }
        // If international format (+...)
        if (cleaned.startsWith("+")) {
          if (!/^\+\d{7,15}$/.test(cleaned)) {
            return "Please enter a valid international phone number (e.g., +8801711223344)";
          }
          return "";
        }
        // If Bangladeshi format starting with 01
        if (cleaned.startsWith("01")) {
          if (cleaned.length !== 11) {
            return "Bangladeshi phone number must be 11 digits";
          }
          if (!/^01[3-9]\d{8}$/.test(cleaned)) {
            return "Please enter a valid Bangladeshi mobile number (e.g., 01711223344)";
          }
          return "";
        }
        // Fallback checks
        if (!/^\d{7,15}$/.test(cleaned)) {
          return "Phone number must contain between 7 to 15 digits";
        }
        return "";
      }
      case "targetCourse": {
        if (!value || value === "") {
          return "Please select a course";
        }
        return "";
      }
      case "targetBand": {
        const trimmed = value.trim();
        if (!trimmed) {
          return "Target band is required";
        }
        const num = parseFloat(trimmed);
        if (isNaN(num) || num < 6.0 || num > 9.0) {
          return "Band score must be between 6.0 and 9.0";
        }
        // Force valid 0.5 increments using regex patterns
        if (!/^([6-8](\.[05])?|9(\.0)?)$/.test(trimmed)) {
          return "Band score must be in 0.5 increments (e.g., 6.0, 6.5, 7.0)";
        }
        return "";
      }
      case "destination": {
        if (!value || value === "" || value === "Others" || value === "Other") {
          return "Please specify your target country name";
        }
        return "";
      }
      default:
        return "";
    }
  };

  // Dynamically re-evaluate validation constraints on text input changes to support instant visual feedback
  useEffect(() => {
    setErrors({
      name: validateField("name", formData.name),
      email: validateField("email", formData.email),
      phone: validateField("phone", formData.phone),
      targetCourse: validateField("targetCourse", formData.targetCourse),
      targetBand: validateField("targetBand", formData.targetBand),
      destination: validateField("destination", formData.destination),
    });
  }, [formData]);

  // Handle key input change safely while auto-filtering characters for specific fields
  const handleInputChange = (field: keyof typeof formData, value: string) => {
    if (field === "phone") {
      // Auto-format phone as user types: only allow digits, hyphens, spaces, and plus signs
      const formattedInput = value.replace(/[^0-9\s+-]/g, "");
      setFormData((prev) => ({ ...prev, phone: formattedInput }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }

    // Interactive Real-Time: Set touched to true on keypress input for immediately styling responsiveness
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Trim whitespace and clean standard inputs on blur events
  const handleBlur = (field: keyof typeof touched) => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    if (field === "name" || field === "email" || field === "targetBand") {
      setFormData((prev) => ({
        ...prev,
        [field]: prev[field].trim(),
      }));
    } else if (field === "phone") {
      // Remove whitespace and dashes when focus shifts away from the phone input
      setFormData((prev) => ({
        ...prev,
        phone: prev.phone.replace(/[\s-]/g, ""),
      }));
    }
  };

  // Quick form state query: returns true if the user filled in all options correctly without validation flags
  const isFormValid =
    formData.name.trim() !== "" &&
    formData.email.trim() !== "" &&
    formData.phone.replace(/[\s-]/g, "") !== "" &&
    formData.targetCourse !== "" &&
    formData.targetBand !== "" &&
    formData.destination !== "" &&
    !errors.name &&
    !errors.email &&
    !errors.phone &&
    !errors.targetCourse &&
    !errors.targetBand &&
    !errors.destination;

  // Retrieve clean, sanitized JSON representation of form data
  const getSanitizedData = () => {
    let rawPhone = formData.phone.replace(/[\s-]/g, "");
    if (rawPhone.startsWith("+")) {
      rawPhone = rawPhone.substring(1);
    }
    if (rawPhone.startsWith("01") && rawPhone.length === 11) {
      rawPhone = "88" + rawPhone;
    } else if (rawPhone.startsWith("1") && rawPhone.length === 10) {
      rawPhone = "880" + rawPhone;
    }
    return {
      name: sanitizeInput(formData.name.trim()),
      email: sanitizeInput(formData.email.trim().toLowerCase()), // Convert to lowercase
      phone: sanitizeInput(rawPhone),
      targetCourse: sanitizeInput(formData.targetCourse),
      targetBand: sanitizeInput(formData.targetBand.trim()),
      destination: sanitizeInput(formData.destination),
      source: formData.source,
    };
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    // Trigger full touched activation to display active feedback instantly
    setTouched({
      name: true,
      email: true,
      phone: true,
      targetCourse: true,
      targetBand: true,
      destination: true,
    });

    const missingFields: string[] = [];
    if (!formData.name.trim()) missingFields.push("Full Name");
    if (!formData.email.trim()) missingFields.push("Email Address");
    if (!formData.phone.replace(/[\s-]/g, ""))
      missingFields.push("Phone Number");
    if (!formData.targetCourse) missingFields.push("Target Course");
    if (!formData.targetBand.trim()) missingFields.push("Target Band");
    if (!formData.destination) missingFields.push("Target Country");

    if (missingFields.length > 0) {
      setValidationError(
        `Required fields have not been set: ${missingFields.join(", ")}. Please fill in these details.`,
      );
      return;
    }

    if (!isFormValid) {
      const errList: string[] = [];
      if (errors.name) errList.push(`• Full Name (${errors.name})`);
      if (errors.email) errList.push(`• Email (${errors.email})`);
      if (errors.phone) errList.push(`• Phone (${errors.phone})`);
      if (errors.targetCourse)
        errList.push(`• Course (${errors.targetCourse})`);
      if (errors.targetBand)
        errList.push(`• Band score (${errors.targetBand})`);
      if (errors.destination) errList.push(`• Country (${errors.destination})`);

      setValidationError(
        `Please resolve form validation parameters:\n${errList.join("\n")}`,
      );
      return;
    }

    const cleanedData = getSanitizedData();

    // Side-effect: Sync cleaned state back into the client form
    setFormData((prev) => ({
      ...prev,
      email: cleanedData.email,
      phone: cleanedData.phone,
    }));

    setVerificationLoading(true);
    setValidationError("");

    // Log validated dataset cleanly to the browser development console as a security & integration placeholder
    console.log(
      "[Form Submitted] Standardized and validated Consultation Request:",
      cleanedData,
    );

    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanedData.phone }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setIsOtpSent(true);
        setCountdown(60); // 60 seconds throttle for resend (Rate Limiting Protection)
        if (data.demoCode) {
          setDemoCode(data.demoCode);
        }
        showToast(
          "success",
          "Verification code dispatched successfully to " + cleanedData.phone,
        );
      } else {
        setValidationError(
          data.error ||
            "Failed to dispatch verification code. Please check your operator parameters.",
        );
      }
    } catch (err) {
      console.error("Error sending OTP code:", err);
      setValidationError(
        "Network issues prevented secure verification dispatch. Check your internet connection.",
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifyOtpAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (
      verificationLoading ||
      status === "submitting" ||
      status === "success"
    ) {
      return;
    }

    if (!otpCode.trim() || otpCode.length < 6) {
      setValidationError("Please enter a valid 6-digit verification pin.");
      return;
    }

    setVerificationLoading(true);
    setValidationError("");

    try {
      const response = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formData.phone, code: otpCode }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setValidationError(
          data.error ||
            "Verification verification code validation failed. Please retry.",
        );
        setVerificationLoading(false);
        return;
      }

      // If OTP verified successfully, save the lead to MySQL database via API
      setStatus("submitting");

      const cleanData = getSanitizedData();

      // Bundle standard UTM campaign parameter tags automatically for easy CRM search/filtering
      const finalTags = [...hiddenTags];
      if (utmParams.utm_source)
        finalTags.push(`utm_source:${utmParams.utm_source}`);
      if (utmParams.utm_medium)
        finalTags.push(`utm_medium:${utmParams.utm_medium}`);
      if (utmParams.utm_campaign)
        finalTags.push(`utm_campaign:${utmParams.utm_campaign}`);
      if (utmParams.utm_term) finalTags.push(`utm_term:${utmParams.utm_term}`);
      if (utmParams.utm_content)
        finalTags.push(`utm_content:${utmParams.utm_content}`);

      const utmLines = [];
      if (utmParams.utm_source)
        utmLines.push(`• Source: ${utmParams.utm_source}`);
      if (utmParams.utm_medium)
        utmLines.push(`• Medium: ${utmParams.utm_medium}`);
      if (utmParams.utm_campaign)
        utmLines.push(`• Campaign: ${utmParams.utm_campaign}`);
      if (utmParams.utm_term) utmLines.push(`• Term: ${utmParams.utm_term}`);
      if (utmParams.utm_content)
        utmLines.push(`• Content: ${utmParams.utm_content}`);

      const utmNotes =
        utmLines.length > 0
          ? `[UTM Ad Tracking Summary]\n${utmLines.join("\n")}`
          : undefined;

      const leadData = {
        ...cleanData,
        status: "New" as LeadStatus,
        userId: userId,
        phoneVerified: true,
        tags: finalTags.length > 0 ? finalTags : undefined,
        notes: utmNotes,
      };

      const resp = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadData),
      });
      const respData = await resp.json();

      if (resp.ok) {
        setStatus("success");
        showToast(
          "success",
          "Thank you! Appointment requested and phone number validated.",
        );
        const createdLead = respData.lead;

        // Evaluate keywords trigger and apply tags
        const finalizedLead = await evaluateKeywordsTrigger(
          userId,
          createdLead,
        );

        // Trigger automatic webhooks and CRM workflows
        triggerGlobalWebhook(userId, "Lead Created", finalizedLead);
        triggerWorkflowAutomations(
          userId,
          "Lead Created",
          "New",
          finalizedLead,
        );
        triggerWorkflowAutomations(
          userId,
          "Lead Status Changed",
          "New Lead",
          finalizedLead,
        );
      } else {
        setValidationError(
          respData.error ||
            "Database storage error. Please retry submission process.",
        );
        setStatus("idle");
      }
    } catch (err) {
      console.error("Error verifying OTP and submitting lead:", err);
      setValidationError(
        "Connection exception while committing new lead. Please retry.",
      );
      setStatus("idle");
    } finally {
      setVerificationLoading(false);
    }
  };

  // Simple toast dispatch helper
  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  // Helper utility to style focus borders based on fields state
  const getInputStyles = (fieldName: keyof typeof errors) => {
    const base =
      "w-full border rounded-lg py-3 pl-4 pr-10 text-sm focus:outline-none transition-all duration-200 text-slate-800 bg-white";
    if (!touched[fieldName]) {
      return `${base} border-slate-350 focus:ring-2 focus:ring-[#e31c3d]/15 focus:border-[#e31c3d]`;
    }
    if (errors[fieldName]) {
      return `${base} border-red-400 focus:ring-2 focus:ring-red-500/15 focus:border-red-500`;
    }
    return `${base} border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 focus:border-emerald-500`;
  };

  if (status === "error" && !userId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900">
            Invalid Form Link
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            This form link is missing a valid tracking ID parameters. Please
            refresh.
          </p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-[#f3f4f6]/50 flex flex-col items-center justify-start pb-12">
        {/* Top Banner Theme in Deep Violet `#23085a` without breadcrumbs */}
        <div className="w-full bg-[#23085a] py-14 px-4 text-center text-white shadow-inner mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">
            Thank You!
          </h1>
        </div>

        <div className="bg-white p-6 sm:p-8 border border-neutral-200/80 shadow-md rounded-2xl w-full max-w-sm sm:max-w-md mx-4 text-center animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>

          <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
            Registration Complete!
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            Thank you,{" "}
            <span className="font-bold text-slate-900">{formData.name}</span>!
            Your IELTS Free Consultation request has been successfully stored.
            An expert advisor will reach out to you within the next 24 business
            hours.
          </p>

          {/* Submitted Information Card */}
          <div className="bg-slate-50 border border-slate-105 rounded-xl p-4 mb-6 text-left text-xs space-y-2.5">
            <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] pb-1 border-b border-slate-200">
              Submitted Consultation Details
            </h3>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Full Name:</span>
              <span className="text-slate-800 font-semibold">
                {formData.name}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Email Address:</span>
              <span className="text-slate-800 font-semibold">
                {formData.email}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Phone Number:</span>
              <span className="text-slate-800 font-semibold">
                {formData.phone}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Target Course:</span>
              <span className="text-slate-800 font-semibold">
                {formData.targetCourse}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">Target Band:</span>
              <span className="text-slate-800 font-semibold">
                {formData.targetBand}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500 font-medium">
                Target Country:
              </span>
              <span className="text-slate-800 font-semibold">
                {formData.destination}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setFormData({
                name: "",
                email: "",
                phone: "",
                targetCourse: "",
                targetBand: "",
                destination: "",
                source: "Website Form",
              });
              setTouched({
                name: false,
                email: false,
                phone: false,
                targetCourse: false,
                targetBand: false,
                destination: false,
              });
              setIsOtpSent(false);
              setOtpCode("");
              setStatus("idle");
            }}
            className="w-full bg-[#23085a] hover:bg-[#34117f] text-white text-sm font-semibold py-3 px-4 rounded-xl transition-colors cursor-pointer"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6]/50 flex flex-col items-center justify-start pb-12">
      {/* Top Banner Theme in Deep Violet `#23085a` without breadcrumbs */}
      <div className="w-full bg-[#23085a] py-14 px-4 text-center text-white shadow-inner mb-8">
        <h1 className="text-3xl font-display font-bold tracking-tight">
          Contact Us
        </h1>
      </div>

      {/* Toast Notification for Form Updates */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-lg border flex items-center gap-2.5 transition-all duration-300 animate-in slide-in-from-top-4 ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-red-50 border-red-100 text-red-800"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      <div className="bg-[#f5f6f7] p-6 sm:p-8 border border-neutral-200/80 shadow-md rounded-2xl w-full max-w-sm sm:max-w-md mx-4">
        {!isOtpSent ? (
          // STEP 1: Registration Form with interactive validation checks
          <form
            onSubmit={handleSendOtp}
            id="consultation-form"
            className="space-y-4"
          >
            {/* CSRF Token (Placeholder protection against Cross-Site Request Forgery) */}
            <input
              type="hidden"
              name="_csrf"
              value="csrf-token-placeholder-xyz123"
            />

            {/* UTM Tracking Hidden Fields for Analytics and Ad Networks */}
            <input
              type="hidden"
              name="utm_source"
              value={utmParams.utm_source}
            />
            <input
              type="hidden"
              name="utm_medium"
              value={utmParams.utm_medium}
            />
            <input
              type="hidden"
              name="utm_campaign"
              value={utmParams.utm_campaign}
            />
            <input type="hidden" name="utm_term" value={utmParams.utm_term} />
            <input
              type="hidden"
              name="utm_content"
              value={utmParams.utm_content}
            />

            <div className="border-b border-slate-200 pb-3.5 mb-4">
              <h2 className="font-bold text-slate-800 tracking-tight flex flex-col gap-0.5">
                <span className="text-2xl font-black text-indigo-950">
                  IELTS Revolution
                </span>
                <span className="text-lg font-bold text-[#e31c3d] tracking-wide">
                  Free Consultation
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Fill out the fields to submit your study query.
              </p>
            </div>

            {validationError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium whitespace-pre-line"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Field 1: Full Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Full Name <span className="text-[#e31c3d]">*</span>
              </label>
              <div className="relative">
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  onBlur={() => handleBlur("name")}
                  aria-invalid={
                    touched.name && !!errors.name ? "true" : "false"
                  }
                  aria-describedby={
                    touched.name && errors.name ? "name-error" : undefined
                  }
                  className={getInputStyles("name")}
                  placeholder="e.g. John Doe"
                />
                {touched.name && (
                  <div className="absolute right-3 top-3 flex items-center pointer-events-none">
                    {errors.name ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                )}
              </div>
              {touched.name && errors.name && (
                <span
                  id="name-error"
                  role="alert"
                  className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  {errors.name}
                </span>
              )}
            </div>

            {/* Field 2: Email Address */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Email Address <span className="text-[#e31c3d]">*</span>
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  onBlur={() => handleBlur("email")}
                  aria-invalid={
                    touched.email && !!errors.email ? "true" : "false"
                  }
                  aria-describedby={
                    touched.email && errors.email ? "email-error" : undefined
                  }
                  className={getInputStyles("email")}
                  placeholder="john@example.com"
                />
                {touched.email && (
                  <div className="absolute right-3 top-3 flex items-center pointer-events-none">
                    {errors.email ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                )}
              </div>
              {touched.email && errors.email && (
                <span
                  id="email-error"
                  role="alert"
                  className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  {errors.email}
                </span>
              )}
            </div>

            {/* Field 3: Phone Number */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Phone Number <span className="text-[#e31c3d]">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-3 flex items-center pointer-events-none">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  onBlur={() => handleBlur("phone")}
                  aria-invalid={
                    touched.phone && !!errors.phone ? "true" : "false"
                  }
                  aria-describedby={
                    touched.phone && errors.phone ? "phone-error" : undefined
                  }
                  className={`${getInputStyles("phone")} pl-10`}
                  placeholder="e.g. +8801711223344"
                />
                {touched.phone && (
                  <div className="absolute right-3 top-3 flex items-center pointer-events-none">
                    {errors.phone ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                )}
              </div>
              {touched.phone && errors.phone && (
                <span
                  id="phone-error"
                  role="alert"
                  className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  {errors.phone}
                </span>
              )}
            </div>

            {/* Fields 4 & 5 Grid: Course Selection and Target Band */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="targetCourse"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Target Course <span className="text-[#e31c3d]">*</span>
                </label>
                <div className="relative">
                  <select
                    id="targetCourse"
                    required
                    value={formData.targetCourse}
                    onChange={(e) =>
                      handleInputChange("targetCourse", e.target.value)
                    }
                    onBlur={() => handleBlur("targetCourse")}
                    aria-invalid={
                      touched.targetCourse && !!errors.targetCourse
                        ? "true"
                        : "false"
                    }
                    aria-describedby={
                      touched.targetCourse && errors.targetCourse
                        ? "course-error"
                        : undefined
                    }
                    className={getInputStyles("targetCourse")}
                  >
                    <option value="">Select Course</option>
                    <option value="IELTS Revolution">IELTS Revolution</option>
                    <option value="IELTS GT">IELTS GT</option>
                    <option value="IELTS UKVI">IELTS UKVI</option>
                    <option value="IELTS Life Skills">IELTS Life Skills</option>
                  </select>
                </div>
                {touched.targetCourse && errors.targetCourse && (
                  <span
                    id="course-error"
                    role="alert"
                    className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                  >
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    {errors.targetCourse}
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="targetBand"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Target Band <span className="text-[#e31c3d]">*</span>
                </label>
                <div className="relative">
                  <input
                    id="targetBand"
                    type="number"
                    step="0.5"
                    min="6"
                    max="9"
                    required
                    value={formData.targetBand}
                    onChange={(e) =>
                      handleInputChange("targetBand", e.target.value)
                    }
                    onBlur={() => handleBlur("targetBand")}
                    aria-invalid={
                      touched.targetBand && !!errors.targetBand
                        ? "true"
                        : "false"
                    }
                    aria-describedby={
                      touched.targetBand && errors.targetBand
                        ? "band-error"
                        : undefined
                    }
                    className={getInputStyles("targetBand")}
                    placeholder="e.g. 7.5"
                  />
                  {touched.targetBand && (
                    <div className="absolute right-3 top-3 flex items-center pointer-events-none">
                      {errors.targetBand ? (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                    </div>
                  )}
                </div>
                {touched.targetBand && errors.targetBand && (
                  <span
                    id="band-error"
                    role="alert"
                    className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                  >
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    {errors.targetBand}
                  </span>
                )}
              </div>
            </div>

            {/* Field 6: Target Country */}
            <div>
              <label
                htmlFor="destination"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Target Country <span className="text-[#e31c3d]">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-3 flex items-center pointer-events-none">
                  <Globe className="w-4 h-4 text-slate-400" />
                </div>
                <select
                  id="destination"
                  required
                  value={
                    formData.destination === "Other" ||
                    formData.destination === "Others" ||
                    ![
                      "",
                      "United Kingdom",
                      "USA",
                      "Canada",
                      "Australia",
                      "New Zealand",
                      "Germany",
                      "Ireland",
                    ].includes(formData.destination)
                      ? "Others"
                      : formData.destination
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "Others") {
                      handleInputChange("destination", "Others");
                      setCustomCountry("");
                    } else {
                      handleInputChange("destination", val);
                      setCustomCountry("");
                    }
                  }}
                  onBlur={() => handleBlur("destination")}
                  aria-invalid={
                    touched.destination && !!errors.destination
                      ? "true"
                      : "false"
                  }
                  aria-describedby={
                    touched.destination && errors.destination
                      ? "destination-error"
                      : undefined
                  }
                  className={`${getInputStyles("destination")} pl-10`}
                >
                  <option value="">Select target destination</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="USA">USA</option>
                  <option value="Canada">Canada</option>
                  <option value="Australia">Australia</option>
                  <option value="New Zealand">New Zealand</option>
                  <option value="Germany">Germany</option>
                  <option value="Ireland">Ireland</option>
                  <option value="Others">Others</option>
                </select>
              </div>
              {touched.destination && errors.destination && (
                <span
                  id="destination-error"
                  role="alert"
                  className="text-[11px] text-red-500 font-medium flex items-center gap-1 mt-1.5 animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-3 h-3 text-red-400" />
                  {errors.destination}
                </span>
              )}

              {/* If others is selected, specify the exact country */}
              {(formData.destination === "Others" ||
                formData.destination === "Other" ||
                (![
                  "",
                  "United Kingdom",
                  "USA",
                  "Canada",
                  "Australia",
                  "New Zealand",
                  "Germany",
                  "Ireland",
                ].includes(formData.destination) &&
                  formData.destination !== "")) && (
                <div className="mt-3 relative animate-in fade-in duration-250">
                  <label
                    htmlFor="customCountry"
                    className="block text-xs font-semibold text-slate-500 mb-1.5 pl-0.5"
                  >
                    Please specify country name{" "}
                    <span className="text-[#e31c3d]">*</span>
                  </label>
                  <input
                    type="text"
                    id="customCountry"
                    placeholder="Enter student's preferred country"
                    value={
                      customCountry ||
                      (formData.destination !== "Others" &&
                      formData.destination !== "Other"
                        ? formData.destination
                        : "")
                    }
                    onChange={(e) => {
                      const userVal = e.target.value;
                      setCustomCountry(userVal);
                      setFormData((prev) => ({
                        ...prev,
                        destination: userVal,
                      }));
                    }}
                    onBlur={() => handleBlur("destination")}
                    className={`${getInputStyles("destination")} pl-4`}
                  />
                </div>
              )}
            </div>

            <input type="hidden" value={formData.source} />

            <div className="pt-2">
              <button
                type="submit"
                disabled={!isFormValid || verificationLoading}
                aria-disabled={
                  !isFormValid || verificationLoading ? "true" : "false"
                }
                className={`w-full py-3.5 px-6 rounded-lg font-bold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                  isFormValid
                    ? "bg-[#e31c3d] text-white hover:bg-[#c91430] active:scale-[0.98] shadow-md shadow-red-200/50"
                    : "bg-slate-200 border border-slate-300 text-slate-400 cursor-not-allowed shadow-none"
                }`}
              >
                {verificationLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Processing Secure Request...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Send Verification Code & Submit</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          // STEP 2: Challenging 6-Digit Verification PIN Input
          <form onSubmit={handleVerifyOtpAndSubmit} className="space-y-6">
            {/* UTM Tracking Hidden Fields for Analytics and Ad Networks */}
            <input
              type="hidden"
              name="utm_source"
              value={utmParams.utm_source}
            />
            <input
              type="hidden"
              name="utm_medium"
              value={utmParams.utm_medium}
            />
            <input
              type="hidden"
              name="utm_campaign"
              value={utmParams.utm_campaign}
            />
            <input type="hidden" name="utm_term" value={utmParams.utm_term} />
            <input
              type="hidden"
              name="utm_content"
              value={utmParams.utm_content}
            />

            <div className="text-center">
              <div className="w-14 h-14 bg-[#fce8eb] border border-[#fbd4d9] rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                <KeyRound className="w-7 h-7 text-[#e31c3d]" />
              </div>
              <h1 className="text-xl font-display font-black text-slate-900 tracking-tight">
                Verify Your Phone
              </h1>
              <p className="text-xs text-slate-500 mt-2">
                We sent a secure 6-digit OTP code to the verified number:
              </p>
              <p className="text-sm font-extrabold text-slate-800 mt-1">
                {formData.phone}
              </p>
            </div>

            {validationError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{validationError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="otpCode"
                className="block text-center text-xs font-semibold text-slate-600 uppercase tracking-widest mb-3"
              >
                Enter Verification Code Pin
              </label>
              <input
                id="otpCode"
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) =>
                  setOtpCode(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="------"
                aria-label="6-Digit Verification Code"
                className="w-full text-center tracking-[12px] font-mono text-2xl font-black border border-slate-200 rounded-lg py-3.5 bg-white focus:ring-4 focus:ring-[#e31c3d]/15 focus:border-[#e31c3d] text-slate-900 focus:outline-none transition-all"
              />
            </div>

            {/* Active Sandbox bypass widget to helper users testing the form inside their applet */}
            {demoCode && (
              <div className="p-3.5 bg-[#fce8eb]/60 border border-[#fbd4d9] rounded-xl text-center shadow-inner animate-pulse">
                <span className="text-[11px] font-bold text-[#e31c3d] flex items-center justify-center gap-1.5 leading-none">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  CRM Sandbox Bypass Code:
                  <strong className="text-xs bg-white text-[#e31c3d] px-2 py-0.5 rounded-lg font-mono border border-red-200 shadow-sm">
                    {demoCode}
                  </strong>
                </span>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={verificationLoading || otpCode.length < 6}
                className="w-full bg-[#e31c3d] hover:bg-[#c91430] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer transform active:scale-98"
              >
                {verificationLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <span>Complete & Secure Submit</span>
                )}
              </button>

              <div className="flex items-center justify-between text-xs px-1 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOtpSent(false);
                    setOtpCode("");
                    setValidationError("");
                  }}
                  className="text-slate-500 hover:text-[#e31c3d] font-semibold transition-colors"
                >
                  ← Edit Phone
                </button>

                {countdown > 0 ? (
                  <span className="text-slate-400 italic">
                    Resend code in {countdown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-[#e31c3d] hover:text-[#c91430] font-bold flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
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
