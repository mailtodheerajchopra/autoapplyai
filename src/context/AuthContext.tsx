import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, CandidateProfile } from '../types';
import { api, getStoredToken } from '../api';

interface AuthContextType {
  user: User | null;
  profile: CandidateProfile | null;
  isLoading: boolean;
  activePortal: 'candidate' | 'admin';
  setActivePortal: (portal: 'candidate' | 'admin') => void;
  availableUsers: { id: string; email: string; name: string; role: 'candidate' | 'admin' }[];
  demoPersonas: { id: string; email: string; name: string; role: 'candidate' | 'admin' }[];
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (email: string, name?: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  switchUser: (userId: string) => Promise<void>;
  toggleUserRole: (newRole: 'candidate' | 'admin') => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activePortal, setActivePortal] = useState<'candidate' | 'admin'>('candidate');
  const [demoPersonas, setDemoPersonas] = useState<{ id: string; email: string; name: string; role: 'candidate' | 'admin' }[]>([]);

  const loadInitialSession = async () => {
    setIsLoading(true);
    try {
      const personas = await api.getDemoPersonas().catch(() => []);
      setDemoPersonas(personas);

      const token = getStoredToken();
      if (token) {
        try {
          const me = await api.getMe();
          setUser(me.user);
          setProfile(me.profile);
          // Portal follows role on restore — admins land in the Admin Console.
          setActivePortal(me.user.role === 'admin' ? 'admin' : 'candidate');
        } catch (authErr) {
          console.warn("[auth] Session restore failed with stored token:", authErr);
          // Clean invalid token without overwriting with demo persona
          localStorage.removeItem('autoapply_auth_token');
          setUser(null);
          setProfile(null);
        }
      } else if (personas.length > 0 && !localStorage.getItem('autoapply_explicit_logout')) {
        // Frictionless exploration only on first visit when sandbox personas are available
        await autoLoginDemo();
      }
    } catch (err) {
      console.error("Auth init error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const autoLoginDemo = async () => {
    try {
      const res = await api.demoSwitch('usr_alex_chen');
      setUser(res.user);
      setProfile(res.profile);
    } catch {
      // If demo switch fails, user can manually login
    }
  };

  useEffect(() => {
    loadInitialSession();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      setUser(res.user);
      setProfile(res.profile);
      if (res.user.role === 'admin') {
        setActivePortal('admin');
      } else {
        setActivePortal('candidate');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (email: string, name?: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('autoapply_explicit_logout');
      const res = await api.loginGoogleDirect(email, name);
      setUser(res.user);
      setProfile(res.profile);
      setActivePortal('candidate');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('autoapply_explicit_logout');
      const res = await api.register(name, email, password);
      setUser(res.user);
      setProfile(res.profile);
      setActivePortal('candidate');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.setItem('autoapply_explicit_logout', 'true');
    api.logout();
    setUser(null);
    setProfile(null);
    setActivePortal('candidate');
  };

  const switchUser = async (userId: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('autoapply_explicit_logout');
      const res = await api.demoSwitch(userId);
      setUser(res.user);
      setProfile(res.profile);
      if (res.user.role === 'admin') {
        setActivePortal('admin');
      } else {
        setActivePortal('candidate');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserRole = async (newRole: 'candidate' | 'admin') => {
    if (!user) return;
    try {
      await api.updateRole(newRole);
      setUser({ ...user, role: newRole });
      setActivePortal(newRole);
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const refreshProfile = async () => {
    try {
      const updated = await api.getProfile();
      setProfile(updated);
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        activePortal,
        setActivePortal,
        availableUsers: demoPersonas,
        demoPersonas,
        login,
        loginWithGoogle,
        register,
        logout,
        switchUser,
        toggleUserRole,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
