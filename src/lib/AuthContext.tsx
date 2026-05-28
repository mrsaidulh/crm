import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ManualUser {
  uid: string;
  email: string;
  displayName: string;
  password?: string;
  role?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
}

interface AuthContextType {
  user: ManualUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfile: (displayName: string, email: string, password?: string) => Promise<void>;
  isSuperAdmin: boolean;
  toggleTwoFactor: (enabled: boolean, secret?: string) => Promise<void>;
  forgotPassword: (email: string, method: 'email' | 'sms') => Promise<{ token: string; email: string; displayName: string; method: 'email' | 'sms' }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  logOut: async () => {},
  updateProfile: async () => {},
  isSuperAdmin: false,
  toggleTwoFactor: async () => {},
  forgotPassword: async () => ({ token: '', email: '', displayName: '', method: 'email' as const }),
  resetPassword: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ManualUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize the manual users database and check current active session.
  useEffect(() => {
    const initAuth = async () => {
      // Clear previous lead data as requested
      if (!localStorage.getItem('crm_leads_cleared_v2')) {
        localStorage.setItem('crm_db_leads', JSON.stringify([]));
        localStorage.setItem('crm_db_tasks', JSON.stringify([]));
        localStorage.setItem('crm_db_campaigns', JSON.stringify([]));
        localStorage.setItem('crm_db_audit-logs', JSON.stringify([]));
        localStorage.setItem('crm_leads_cleared_v2', 'true');
        
        // Wipe server database
        fetch('/api/admin/clear-all-leads', { method: 'POST' }).catch(err => console.warn('Wipe failed:', err));
      }

      // 1. Ensure a default admin account exists in localStorage
      const savedUsersStr = localStorage.getItem('crm_users_db');
      let savedUsers: ManualUser[] = [];
      
      if (savedUsersStr) {
        try {
          savedUsers = JSON.parse(savedUsersStr);
        } catch (e) {
          savedUsers = [];
        }
      }

      const defaultAdmin: ManualUser = {
        uid: 'ielts_crm_main_user',
        email: 'toieltsrevolution@gmail.com',
        password: 'Irevocrm1$%',
        displayName: 'Saidul Hasan',
        role: 'Super Admin'
      };

      const defaultAdmin2: ManualUser = {
        uid: 'user_1779881851973fw16q',
        email: 'saidulgmac@gmail.com',
        password: 'Irevocrm1$%',
        displayName: 'Saidul Hasan',
        role: 'Super Admin'
      };

      // 1.5 Sync users list with backend server database
      try {
        const response = await fetch('/api/auth/users');
        if (response.ok) {
          const data = await response.json();
          const serverUsers: ManualUser[] = data.users || [];
          
          // Merge local and server users: key is email (lowered)
          const usersMap = new Map<string, ManualUser>();
          
          // Seed with local users first
          savedUsers.forEach(u => {
            if (u && u.email) {
              usersMap.set(u.email.toLowerCase(), u);
            }
          });
          
          // Overwrite/Add server users
          serverUsers.forEach(u => {
            if (u && u.email) {
              usersMap.set(u.email.toLowerCase(), u);
            }
          });
          
          // Re-serialize back to savedUsers list
          savedUsers = Array.from(usersMap.values());
        }
      } catch (err) {
        console.warn('[Sync Auth] Backend sync could not be completed, using local store:', err);
      }

      let updated = false;
      for (let i = 0; i < savedUsers.length; i++) {
          if (savedUsers[i] && savedUsers[i].email && savedUsers[i].email.toLowerCase() === 'admin@crm.com' && savedUsers[i].uid === 'ielts_crm_main_user') {
              savedUsers[i] = defaultAdmin;
              updated = true;
          }
      }

      // Remove any old placeholder administrators from list to start fresh
      savedUsers = savedUsers.filter(u => u && u.email && u.email.toLowerCase() !== 'crm@example.com' && u.email.toLowerCase() !== 'admin@crm.com');

      const adminExists = savedUsers.some(u => u && u.email && u.email.toLowerCase() === defaultAdmin.email.toLowerCase());
      if (!adminExists) {
        savedUsers.push(defaultAdmin);
        updated = true;
      }

      const admin2Exists = savedUsers.some(u => u && u.email && u.email.toLowerCase() === defaultAdmin2.email.toLowerCase());
      if (!admin2Exists) {
        savedUsers.push(defaultAdmin2);
        updated = true;
      }

      localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));

      // 2. Check active session
      const activeSession = localStorage.getItem('crm_active_session');
      if (activeSession) {
        try {
          let sessionUser = JSON.parse(activeSession);
          if (
            !sessionUser.email || 
            sessionUser.email.toLowerCase() === 'admin@crm.com' || 
            sessionUser.displayName === 'Administrator Name' || 
            sessionUser.uid === 'ielts_crm_main_user'
          ) {
            sessionUser = {
              uid: 'ielts_crm_main_user',
              email: 'toieltsrevolution@gmail.com',
              displayName: 'Saidul Hasan',
              role: 'Super Admin'
            };
            localStorage.setItem('crm_active_session', JSON.stringify(sessionUser));
          }
          // Make sure sessionUser exists in synchronized savedUsers to match their synced details
          const matchingUser = savedUsers.find(u => u && u.email && u.email.toLowerCase() === sessionUser.email.toLowerCase());
          if (matchingUser) {
            sessionUser = {
              uid: matchingUser.uid,
              email: matchingUser.email,
              displayName: matchingUser.displayName,
              role: matchingUser.role || (matchingUser.email.toLowerCase() === 'toieltsrevolution@gmail.com' ? 'Super Admin' : 'Counselor'),
              twoFactorEnabled: matchingUser.twoFactorEnabled,
              twoFactorSecret: matchingUser.twoFactorSecret
            };
          }
          setUser(sessionUser);
        } catch (e) {
          localStorage.removeItem('crm_active_session');
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    // Artificial latency for a premium native platform feel
    await new Promise(resolve => setTimeout(resolve, 650));

    // Try a quick server sync to ensure up-to-date credential database before verifying
    let savedUsers: ManualUser[] = [];
    try {
      const response = await fetch('/api/auth/users');
      if (response.ok) {
        const data = await response.json();
        savedUsers = data.users || [];
      } else {
        throw new Error('Not OK');
      }
    } catch (e) {
      const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
      try {
        savedUsers = JSON.parse(savedUsersStr);
      } catch (parseErr) {
        throw new Error('Database integrity error.');
      }
    }

    // Ensure pre-setup super admin accounts are always present in the verification pool
    const defaultAdmins = [
      {
        uid: 'ielts_crm_main_user',
        email: 'toieltsrevolution@gmail.com',
        password: 'Irevocrm1$%',
        displayName: 'Saidul Hasan',
        role: 'Super Admin'
      },
      {
        uid: 'user_1779881851973fw16q',
        email: 'saidulgmac@gmail.com',
        password: 'Irevocrm1$%',
        displayName: 'Saidul Hasan',
        role: 'Super Admin'
      }
    ];

    defaultAdmins.forEach(admin => {
      if (!savedUsers.some(u => u && u.email && u.email.toLowerCase() === admin.email.toLowerCase())) {
        savedUsers.push(admin);
      }
    });

    const found = savedUsers.find(
      u => u && u.email && u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (!found) {
      throw new Error('Access Denied. This email is not a registered administrator or counselor.');
    }

    if (found.password !== password) {
      throw new Error('Incorrect credentials. Please try again.');
    }

    // Create session (safe to omit password)
    const sessionUser: ManualUser = {
      uid: found.uid,
      email: found.email,
      displayName: found.displayName,
      role: found.role || (found.email.toLowerCase() === 'toieltsrevolution@gmail.com' ? 'Super Admin' : 'Counselor'),
      twoFactorEnabled: found.twoFactorEnabled,
      twoFactorSecret: found.twoFactorSecret
    };

    localStorage.setItem('crm_active_session', JSON.stringify(sessionUser));
    setUser(sessionUser);
  };

  const signUpWithEmail = async (email: string, password: string, displayName = 'CRM Counselor') => {
    await new Promise(resolve => setTimeout(resolve, 650));

    const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
    let savedUsers: ManualUser[] = [];
    try {
      savedUsers = JSON.parse(savedUsersStr);
    } catch (e) {
      savedUsers = [];
    }

    const emailLower = email.trim().toLowerCase();
    const exists = savedUsers.some(u => u && u.email && u.email.toLowerCase() === emailLower);
    if (exists) {
      throw new Error('This email address is already manually registered.');
    }

    let targetUid = 'user_' + Math.random().toString(36).substring(2, 11);
    if (emailLower === 'mrsaidulvc@gmail.com' || emailLower === 'saidulgmac@gmail.com') {
      targetUid = 'user_1779881851973fw16q';
    } else {
      let hash = 0;
      for (let i = 0; i < emailLower.length; i++) {
        const char = emailLower.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      const cleanStr = emailLower.replace(/[^a-z0-9]/g, '');
      targetUid = `user_stable_${Math.abs(hash)}_${cleanStr.slice(0, 8)}`;
    }

    const newUser: ManualUser = {
      uid: targetUid,
      email: email.trim(),
      password: password,
      displayName: displayName,
      role: emailLower === 'toieltsrevolution@gmail.com' ? 'Super Admin' : 'Counselor'
    };

    savedUsers.push(newUser);
    localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));

    // Sync newly created user with backend server
    try {
      await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
    } catch (err) {
      console.warn('[Sync Auth] Failed to push registered user to backend server:', err);
    }

    const sessionUser: ManualUser = {
      uid: newUser.uid,
      email: newUser.email,
      displayName: newUser.displayName,
      role: newUser.role
    };

    localStorage.setItem('crm_active_session', JSON.stringify(sessionUser));
    setUser(sessionUser);
  };

  const logOut = async () => {
    localStorage.removeItem('crm_active_session');
    setUser(null);
  };

  const updateProfile = async (displayName: string, email: string, password?: string) => {
    if (!user) throw new Error('Not logged in.');

    const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
    let savedUsers: ManualUser[] = [];
    try {
      savedUsers = JSON.parse(savedUsersStr);
    } catch {
      throw new Error('Database error.');
    }

    const updatedUsers = savedUsers.map(u => {
      if (u && u.uid === user.uid) {
        const up = {
          ...u,
          displayName,
          email,
          ...(password ? { password } : {})
        };

        // Push update to server
        fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(up)
        }).catch(err => console.warn('[Sync Auth] Failed to push updated profile to backend server:', err));

        return up;
      }
      return u;
    });

    localStorage.setItem('crm_users_db', JSON.stringify(updatedUsers));

    const updatedSession: ManualUser = {
      uid: user.uid,
      email: email,
      displayName: displayName,
      role: user.role
    };

    localStorage.setItem('crm_active_session', JSON.stringify(updatedSession));
    setUser(updatedSession);
  };

  const toggleTwoFactor = async (enabled: boolean, secret?: string) => {
    if (!user) return;
    
    // Fetch and update local users
    const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
    let savedUsers: ManualUser[] = [];
    try {
      savedUsers = JSON.parse(savedUsersStr);
    } catch (e) {}

    const idx = savedUsers.findIndex(u => u && u.email && u.email.toLowerCase() === user.email.toLowerCase());
    if (idx !== -1) {
      savedUsers[idx].twoFactorEnabled = enabled;
      savedUsers[idx].twoFactorSecret = secret || undefined;
      localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));
    }
    
    // Update server auth user record
    try {
      await fetch('/api/auth/users/update-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          twoFactorEnabled: enabled,
          twoFactorSecret: secret || ''
        })
      });
    } catch (err) {
      console.warn('Failed to sync 2FA to server:', err);
    }

    // Update current context user state
    const updatedUser: ManualUser = {
      ...user,
      twoFactorEnabled: enabled,
      twoFactorSecret: secret || undefined
    };
    setUser(updatedUser);
    localStorage.setItem('crm_active_session', JSON.stringify(updatedUser));
  };

  const forgotPassword = async (email: string, method: 'email' | 'sms') => {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, method })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to request password reset.');
    }
    return data;
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password.');
    }

    // Also update client-side database in localStorage if user exists
    const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
    let savedUsers: ManualUser[] = [];
    try {
      savedUsers = JSON.parse(savedUsersStr);
    } catch (e) {}

    const emailClean = data.email.toLowerCase();
    const idx = savedUsers.findIndex(u => u && u.email && u.email.toLowerCase() === emailClean);
    if (idx !== -1) {
      savedUsers[idx].password = newPassword;
      localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));
    }
  };

  const isSuperAdmin = 
    user?.role === 'Super Admin' || 
    user?.email.toLowerCase() === 'toieltsrevolution@gmail.com' || 
    user?.email.toLowerCase() === 'saidulgmac@gmail.com' ||
    user?.email.toLowerCase().includes('saidul');

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, logOut, updateProfile, isSuperAdmin, toggleTwoFactor, forgotPassword, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

