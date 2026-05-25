import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ManualUser {
  uid: string;
  email: string;
  displayName: string;
  password?: string;
}

interface AuthContextType {
  user: ManualUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfile: (displayName: string, email: string, password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  logOut: async () => {},
  updateProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ManualUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize the manual users database and check current active session.
  useEffect(() => {
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
      email: 'admin@crm.com',
      password: 'admin123',
      displayName: 'CRM Administrator'
    };

    const adminExists = savedUsers.some(u => u.email.toLowerCase() === defaultAdmin.email.toLowerCase());
    if (!adminExists) {
      savedUsers.push(defaultAdmin);
      localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));
    }

    // 2. Check active session
    const activeSession = localStorage.getItem('crm_active_session');
    if (activeSession) {
      try {
        const sessionUser = JSON.parse(activeSession);
        setUser(sessionUser);
      } catch (e) {
        localStorage.removeItem('crm_active_session');
      }
    }

    setLoading(false);
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    // Artificial latency for a premium native platform feel
    await new Promise(resolve => setTimeout(resolve, 650));

    const savedUsersStr = localStorage.getItem('crm_users_db') || '[]';
    let savedUsers: ManualUser[] = [];
    try {
      savedUsers = JSON.parse(savedUsersStr);
    } catch (e) {
      throw new Error('Database integrity error.');
    }

    const found = savedUsers.find(
      u => u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (!found) {
      throw new Error('No admin user found with this email.');
    }

    if (found.password !== password) {
      throw new Error('Incorrect credentials. Please verify your manual password.');
    }

    // Create session (safe to omit password)
    const sessionUser: ManualUser = {
      uid: found.uid,
      email: found.email,
      displayName: found.displayName
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
    const exists = savedUsers.some(u => u.email.toLowerCase() === emailLower);
    if (exists) {
      throw new Error('This email address is already manually registered.');
    }

    const newUser: ManualUser = {
      uid: 'user_' + Math.random().toString(36).substring(2, 11),
      email: email.trim(),
      password: password,
      displayName: displayName
    };

    savedUsers.push(newUser);
    localStorage.setItem('crm_users_db', JSON.stringify(savedUsers));

    const sessionUser: ManualUser = {
      uid: newUser.uid,
      email: newUser.email,
      displayName: newUser.displayName
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
      if (u.uid === user.uid) {
        return {
          ...u,
          displayName,
          email,
          ...(password ? { password } : {})
        };
      }
      return u;
    });

    localStorage.setItem('crm_users_db', JSON.stringify(updatedUsers));

    const updatedSession: ManualUser = {
      uid: user.uid,
      email: email,
      displayName: displayName
    };

    localStorage.setItem('crm_active_session', JSON.stringify(updatedSession));
    setUser(updatedSession);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithEmail, signUpWithEmail, logOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

