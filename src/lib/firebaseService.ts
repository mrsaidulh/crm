import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  Firestore 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, Auth } from 'firebase/auth';
import { Lead, Campaign, AuditLog, Task, Template, WorkflowRule, UserSettings, TeamMember } from '../types';
import appletConfig from '../../firebase-applet-config.json';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId?: string;
}

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firebaseAuth: Auth | null = null;
let activeConfig: FirebaseConfig | null = null;

// Initialize Firebase dynamically
export function initFirebase(config: FirebaseConfig): boolean {
  try {
    if (!config || !config.apiKey || !config.projectId) {
      return false;
    }
    
    // De-duplicate initialization
    if (getApps().length > 0) {
      firebaseApp = getApp();
    } else {
      firebaseApp = initializeApp(config);
    }
    
    if (config.firestoreDatabaseId) {
      firestoreDb = getFirestore(firebaseApp, config.firestoreDatabaseId);
    } else {
      firestoreDb = getFirestore(firebaseApp);
    }
    
    // Initialize Anonymous Authentication automatically if enabled in the console
    firebaseAuth = getAuth(firebaseApp);
    signInAnonymously(firebaseAuth)
      .then(() => {
        console.log('[FirebaseService] Successfully authenticated session anonymously.');
      })
      .catch((err) => {
        console.warn('[FirebaseService] Anonymous authentication is not enabled in your firebase console (auth/admin-restricted-operation). This is normal. Using connection default rules.', err);
      });

    activeConfig = config;
    
    // Store in localStorage for persistence across reloads
    localStorage.setItem('crm_firebase_config', JSON.stringify(config));
    localStorage.setItem('crm_db_mode', 'firebase');
    
    console.log('[FirebaseService] Successfully initialized Firebase Client SDK connection.');
    return true;
  } catch (err) {
    
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

    return false;
  }
}

// Check if Firebase is active
export function isFirebaseConnected(): boolean {
  return isFirebaseActive();
}

// Retrieve current config from localStorage on boot
export function loadSavedFirebaseConfig(): FirebaseConfig | null {
  const saved = localStorage.getItem('crm_firebase_config');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as FirebaseConfig;
      if (parsed.apiKey && parsed.projectId) {
        initFirebase(parsed);
        return parsed;
      }
    } catch {
      // safe fallback
    }
  } else if (appletConfig && appletConfig.apiKey && appletConfig.projectId) {
    try {
      const configWithDb: FirebaseConfig = {
        apiKey: appletConfig.apiKey,
        authDomain: appletConfig.authDomain,
        projectId: appletConfig.projectId,
        storageBucket: appletConfig.storageBucket,
        messagingSenderId: appletConfig.messagingSenderId,
        appId: appletConfig.appId,
        firestoreDatabaseId: appletConfig.firestoreDatabaseId
      };
      initFirebase(configWithDb);
      return configWithDb;
    } catch (err) {
      
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

    }
  }
  return null;
}

// Disconnect Firebase (fallback to local database mode)
export function disconnectFirebase() {
  firebaseApp = null;
  firestoreDb = null;
  activeConfig = null;
  localStorage.setItem('crm_db_mode', 'local');
  localStorage.removeItem('crm_firebase_config');
}

// Load configurations on bundle initial load
loadSavedFirebaseConfig();

let firebaseOfflineSuspended = false;

// Determine if Firebase is physically active and connected
export function isFirebaseActive(): boolean {
  if (typeof window !== 'undefined' && !window.navigator.onLine) {
    return true && false; // Return false cleanly
  }
  return firestoreDb !== null && !firebaseOfflineSuspended;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[FirebaseService] Client detected as ONLINE. Restoring Firestore availability check.');
    firebaseOfflineSuspended = false;
  });
  window.addEventListener('offline', () => {
    console.warn('[FirebaseService] Client detected as OFFLINE. Temporarily suspending Firestore operations.');
    firebaseOfflineSuspended = true;
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const user = firebaseAuth?.currentUser;
  const errMsg = error instanceof Error ? error.message : String(error);
  
  // Cleanly suspend connection if known offline or unreachable error occurs
  const isOfflineError = 
    errMsg.toLowerCase().includes('offline') || 
    errMsg.toLowerCase().includes('network') || 
    errMsg.toLowerCase().includes('unreachable') || 
    errMsg.toLowerCase().includes('failed-precondition') ||
    errMsg.toLowerCase().includes('unavailable');

  if (isOfflineError) {
    console.warn('[FirebaseService] Live Firestore is unreachable or offline. Suspending Firestore connector and falling back to client-side localStorage.');
    firebaseOfflineSuspended = true;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: user?.uid || null,
      email: user?.email || null,
      emailVerified: user?.emailVerified || null,
      isAnonymous: user?.isAnonymous || null,
      tenantId: user?.tenantId || null,
      providerInfo: user?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('[FirebaseService] Firestore operational error caught. Falling back gracefully to client session database (local). Error details:', JSON.stringify(errInfo));
}

// --- LOCAL STORAGE DATA SEEDERS & HELPERS (STANDALONE FALLBACK DB) ---

function getLocalItem<T>(key: string, defaultVal: T[] = []): T[] {
  const val = localStorage.getItem(`crm_db_${key}`);
  if (!val) {
    // Seed initial items if empty
    if (key === 'audit-logs') {
      const initLogs: AuditLog[] = [{
        id: 'log_init_1',
        userId: 'ielts_crm_main_user',
        action: 'System Initialized',
        entityType: 'system',
        entityId: 'system',
        details: 'Serverless CRM system completed boot sequence successfully. Standalone browser-local database active.',
        createdAt: Date.now() - 3600000
      }];
      localStorage.setItem(`crm_db_${key}`, JSON.stringify(initLogs));
      return initLogs as unknown as T[];
    }
    return defaultVal;
  }
  try {
    return JSON.parse(val) as T[];
  } catch {
    return defaultVal;
  }
}

function saveLocalItem<T>(key: string, data: T[]) {
  localStorage.setItem(`crm_db_${key}`, JSON.stringify(data));
}

// --- MASTER DATA SERVICE INTERFACES ---

export const firebaseService = {
  
  // Dynamic check
  isConnected(): boolean {
    return isFirebaseConnected();
  },

  getConfig() {
    return activeConfig;
  },

  // --- LEADS ---
  async getLeads(userId?: string): Promise<Lead[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const leadRef = collection(firestoreDb, 'leads');
        const q = userId 
          ? query(leadRef, where('userId', '==', userId))
          : leadRef;
        const snapshot = await getDocs(q);
        const data: Lead[] = [];
        snapshot.forEach((docSnap) => {
          data.push(docSnap.data() as Lead);
        });
        return data.sort((a, b) => b.createdAt - a.createdAt);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'leads');
      }
    }
    
    // Local storage fallback
    const local = getLocalItem<Lead>('leads');
    if (userId) {
      return local.filter(l => l.userId === userId);
    }
    return local;
  },

  async insertLead(lead: Lead): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'leads', lead.id), lead);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'leads/' + lead.id);
      }
    }
    
    const local = getLocalItem<Lead>('leads');
    local.unshift(lead);
    saveLocalItem('leads', local);
  },

  async updateLeadStatus(id: string, status: string): Promise<Lead | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const leadRef = doc(firestoreDb, 'leads', id);
        await updateDoc(leadRef, { status });
        const snap = await getDoc(leadRef);
        return snap.exists() ? (snap.data() as Lead) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'leads/' + id);
      }
    }
    
    const local = getLocalItem<Lead>('leads');
    const idx = local.findIndex(l => l.id === id);
    if (idx !== -1) {
      local[idx].status = status as any;
      saveLocalItem('leads', local);
      return local[idx];
    }
    return null;
  },

  async updateLead(id: string, updateData: Partial<Lead>): Promise<Lead | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const leadRef = doc(firestoreDb, 'leads', id);
        await updateDoc(leadRef, updateData as any);
        const snap = await getDoc(leadRef);
        return snap.exists() ? (snap.data() as Lead) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'leads/' + id);
      }
    }
    
    const local = getLocalItem<Lead>('leads');
    const idx = local.findIndex(l => l.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...updateData };
      saveLocalItem('leads', local);
      return local[idx];
    }
    return null;
  },

  async deleteLead(id: string): Promise<Lead | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const leadRef = doc(firestoreDb, 'leads', id);
        const snap = await getDoc(leadRef);
        if (snap.exists()) {
          const data = snap.data() as Lead;
          await deleteDoc(leadRef);
          return data;
        }
        return null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'leads/' + id);
      }
    }
    
    const local = getLocalItem<Lead>('leads');
    const idx = local.findIndex(l => l.id === id);
    if (idx !== -1) {
      const removed = local.splice(idx, 1);
      saveLocalItem('leads', local);
      return removed[0];
    }
    return null;
  },

  // --- CAMPAIGNS ---
  async getCampaigns(userId?: string): Promise<Campaign[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const campaignRef = collection(firestoreDb, 'campaigns');
        const q = userId ? query(campaignRef, where('userId', '==', userId)) : campaignRef;
        const snapshot = await getDocs(q);
        const list: Campaign[] = [];
        snapshot.forEach((s) => list.push(s.data() as Campaign));
        return list.sort((a, b) => b.sentAt - a.sentAt);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'campaigns');
      }
    }
    const local = getLocalItem<Campaign>('campaigns');
    return userId ? local.filter(c => c.userId === userId) : local;
  },

  async insertCampaign(campaign: Campaign): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'campaigns', campaign.id), campaign);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'campaigns/' + campaign.id);
      }
    }
    const local = getLocalItem<Campaign>('campaigns');
    local.unshift(campaign);
    saveLocalItem('campaigns', local);
  },

  // --- AUDIT LOGS ---
  async getAuditLogs(userId?: string): Promise<AuditLog[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const logRef = collection(firestoreDb, 'audit-logs');
        const q = userId ? query(logRef, where('userId', '==', userId)) : logRef;
        const snapshot = await getDocs(q);
        const list: AuditLog[] = [];
        snapshot.forEach((s) => list.push(s.data() as AuditLog));
        return list.sort((a, b) => b.createdAt - a.createdAt);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'audit-logs');
      }
    }
    const local = getLocalItem<AuditLog>('audit-logs');
    return userId ? local.filter(l => l.userId === userId) : local;
  },

  async insertAuditLog(log: AuditLog): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'audit-logs', log.id), log);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'audit-logs/' + log.id);
      }
    }
    const local = getLocalItem<AuditLog>('audit-logs');
    local.unshift(log);
    saveLocalItem('audit-logs', local);
  },

  async clearAuditLogs(userId?: string): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        // Bulk delete on client side
        const logRef = collection(firestoreDb, 'audit-logs');
        const q = userId ? query(logRef, where('userId', '==', userId)) : logRef;
        const snapshot = await getDocs(q);
        for (const logDoc of snapshot.docs) {
          await deleteDoc(doc(firestoreDb, 'audit-logs', logDoc.id));
        }
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'audit-logs');
      }
    }
    if (userId) {
      const local = getLocalItem<AuditLog>('audit-logs');
      saveLocalItem('audit-logs', local.filter(log => log.userId !== userId));
    } else {
      saveLocalItem('audit-logs', []);
    }
  },

  // --- SYSTEM USER SETTINGS ---
  async getSettings(userId: string): Promise<UserSettings | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const snap = await getDoc(doc(firestoreDb, 'settings', userId));
        return snap.exists() ? (snap.data() as UserSettings) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.GET, 'settings/' + userId);
      }
    }
    const local = localStorage.getItem(`crm_db_settings_${userId}`);
    return local ? JSON.parse(local) : null;
  },

  async saveSettings(userId: string, settings: UserSettings): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'settings', userId), settings);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.WRITE, 'settings/' + userId);
      }
    }
    localStorage.setItem(`crm_db_settings_${userId}`, JSON.stringify(settings));
  },

  // --- REQUISITE FOLLOW-UP TASKS ---
  async getTasks(userId?: string): Promise<Task[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const taskRef = collection(firestoreDb, 'tasks');
        const q = userId ? query(taskRef, where('userId', '==', userId)) : taskRef;
        const snapshot = await getDocs(q);
        const list: Task[] = [];
        snapshot.forEach((s) => list.push(s.data() as Task));
        return list.sort((a, b) => a.dueDate - b.dueDate);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'tasks');
      }
    }
    const local = getLocalItem<Task>('tasks');
    return userId ? local.filter(t => t.userId === userId) : local;
  },

  async insertTask(task: Task): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'tasks', task.id), task);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'tasks/' + task.id);
      }
    }
    const local = getLocalItem<Task>('tasks');
    local.unshift(task);
    saveLocalItem('tasks', local);
  },

  async updateTask(id: string, task: Partial<Task>): Promise<Task | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const taskRef = doc(firestoreDb, 'tasks', id);
        await updateDoc(taskRef, task as any);
        const snap = await getDoc(taskRef);
        return snap.exists() ? (snap.data() as Task) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'tasks/' + id);
      }
    }
    const local = getLocalItem<Task>('tasks');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...task };
      saveLocalItem('tasks', local);
      return local[idx];
    }
    return null;
  },

  async deleteTask(id: string): Promise<boolean> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, 'tasks', id));
        return true;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'tasks/' + id);
      }
    }
    const local = getLocalItem<Task>('tasks');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local.splice(idx, 1);
      saveLocalItem('tasks', local);
      return true;
    }
    return false;
  },

  // --- TEMPLATES ---
  async getTemplates(userId?: string): Promise<Template[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const templateRef = collection(firestoreDb, 'templates');
        const q = userId ? query(templateRef, where('userId', '==', userId)) : templateRef;
        const snapshot = await getDocs(q);
        const list: Template[] = [];
        snapshot.forEach((s) => list.push(s.data() as Template));
        return list;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'templates');
      }
    }
    const local = getLocalItem<Template>('templates');
    return userId ? local.filter(t => t.userId === userId) : local;
  },

  async insertTemplate(template: Template): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'templates', template.id), template);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'templates/' + template.id);
      }
    }
    const local = getLocalItem<Template>('templates');
    local.unshift(template);
    saveLocalItem('templates', local);
  },

  async updateTemplate(id: string, template: Partial<Template>): Promise<Template | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const tempRef = doc(firestoreDb, 'templates', id);
        await updateDoc(tempRef, template as any);
        const snap = await getDoc(tempRef);
        return snap.exists() ? (snap.data() as Template) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'templates/' + id);
      }
    }
    const local = getLocalItem<Template>('templates');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...template };
      saveLocalItem('templates', local);
      return local[idx];
    }
    return null;
  },

  async deleteTemplate(id: string): Promise<boolean> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, 'templates', id));
        return true;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'templates/' + id);
      }
    }
    const local = getLocalItem<Template>('templates');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local.splice(idx, 1);
      saveLocalItem('templates', local);
      return true;
    }
    return false;
  },

  // --- AUTOMATION WORKFLOWS ---
  async getWorkflows(userId?: string): Promise<WorkflowRule[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const wfRef = collection(firestoreDb, 'workflows');
        const q = userId ? query(wfRef, where('userId', '==', userId)) : wfRef;
        const snapshot = await getDocs(q);
        const list: WorkflowRule[] = [];
        snapshot.forEach((s) => list.push(s.data() as WorkflowRule));
        return list.sort((a, b) => b.createdAt - a.createdAt);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'workflows');
      }
    }
    const local = getLocalItem<WorkflowRule>('workflows');
    return userId ? local.filter(w => w.userId === userId) : local;
  },

  async insertWorkflow(workflow: WorkflowRule): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'workflows', workflow.id), workflow);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'workflows/' + workflow.id);
      }
    }
    const local = getLocalItem<WorkflowRule>('workflows');
    local.unshift(workflow);
    saveLocalItem('workflows', local);
  },

  async updateWorkflow(id: string, workflow: Partial<WorkflowRule>): Promise<WorkflowRule | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const wfRef = doc(firestoreDb, 'workflows', id);
        await updateDoc(wfRef, workflow as any);
        const snap = await getDoc(wfRef);
        return snap.exists() ? (snap.data() as WorkflowRule) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'workflows/' + id);
      }
    }
    const local = getLocalItem<WorkflowRule>('workflows');
    const idx = local.findIndex(w => w.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...workflow };
      saveLocalItem('workflows', local);
      return local[idx];
    }
    return null;
  },

  async deleteWorkflow(id: string): Promise<boolean> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, 'workflows', id));
        return true;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'workflows/' + id);
      }
    }
    const local = getLocalItem<WorkflowRule>('workflows');
    const idx = local.findIndex(w => w.id === id);
    if (idx !== -1) {
      local.splice(idx, 1);
      saveLocalItem('workflows', local);
      return true;
    }
    return false;
  },

  // --- TEAM MEMBERS PRIVILEGES ---
  async getTeamMembers(userId?: string): Promise<TeamMember[]> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const tmRef = collection(firestoreDb, 'team-members');
        const q = userId ? query(tmRef, where('userId', '==', userId)) : tmRef;
        const snapshot = await getDocs(q);
        const list: TeamMember[] = [];
        snapshot.forEach((s) => list.push(s.data() as TeamMember));
        return list.sort((a, b) => b.createdAt - a.createdAt);
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.LIST, 'team-members');
      }
    }
    const local = getLocalItem<TeamMember>('team-members');
    return userId ? local.filter(t => t.userId === userId) : local;
  },

  async insertTeamMember(teamMember: TeamMember): Promise<void> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await setDoc(doc(firestoreDb, 'team-members', teamMember.id), teamMember);
        return;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.CREATE, 'team-members/' + teamMember.id);
      }
    }
    const local = getLocalItem<TeamMember>('team-members');
    local.unshift(teamMember);
    saveLocalItem('team-members', local);
  },

  async updateTeamMember(id: string, teamMember: Partial<TeamMember>): Promise<TeamMember | null> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        const tmRef = doc(firestoreDb, 'team-members', id);
        await updateDoc(tmRef, teamMember as any);
        const snap = await getDoc(tmRef);
        return snap.exists() ? (snap.data() as TeamMember) : null;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.UPDATE, 'team-members/' + id);
      }
    }
    const local = getLocalItem<TeamMember>('team-members');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...teamMember };
      saveLocalItem('team-members', local);
      return local[idx];
    }
    return null;
  },

  async deleteTeamMember(id: string): Promise<boolean> {
    if (isFirebaseActive() && firestoreDb) {
      try {
        await deleteDoc(doc(firestoreDb, 'team-members', id));
        return true;
      } catch (err) {
        
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

        handleFirestoreError(err, OperationType.DELETE, 'team-members/' + id);
      }
    }
    const local = getLocalItem<TeamMember>('team-members');
    const idx = local.findIndex(t => t.id === id);
    if (idx !== -1) {
      local.splice(idx, 1);
      saveLocalItem('team-members', local);
      return true;
    }
    return false;
  },

  // --- SEED ENTIRE LOCAL STORAGE DATA TO FIRESTORE ON CONNECT ---
  async syncLocalDataToFirestore() {
    if (!firestoreDb) return;
    try {
      console.log('[FirebaseService] Starting background merge mapping sync to Firestore...');
      
      const syncList = async <T extends { id: string }>(key: string, collectionName: string) => {
        const localItems = getLocalItem<T>(key);
        for (const item of localItems) {
          await setDoc(doc(firestoreDb!, collectionName, item.id), item);
        }
      };

      await syncList<Lead>('leads', 'leads');
      await syncList<Task>('tasks', 'tasks');
      await syncList<Campaign>('campaigns', 'campaigns');
      await syncList<Template>('templates', 'templates');
      await syncList<WorkflowRule>('workflows', 'workflows');
      await syncList<TeamMember>('team-members', 'team-members');
      await syncList<AuditLog>('audit-logs', 'audit-logs');
      
      console.log('[FirebaseService] Local Database sync complete.');
    } catch (err) {
      
if (String(err).toLowerCase().includes('offline')) {
  console.warn('[FirebaseService] Operation suppressed (offline).');
} else {
  console.error('[FirebaseService] Operation failed:', err);
}

    }
  }
};
