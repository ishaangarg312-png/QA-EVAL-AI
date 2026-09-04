import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, TokenResponse } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  googleClientId: string | null;
  login: (email: string, password: string, otp?: string) => Promise<TokenResponse>;
  loginWithGoogle: (idToken: string) => Promise<TokenResponse>;
  register: (data: { email: string; full_name: string; password: string; role?: string; otp?: string }) => Promise<TokenResponse | User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('auth_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load public auth config (e.g. Google Client ID) from backend
  useEffect(() => {
    api.getAuthConfig()
      .then((cfg) => {
        if (cfg.google_client_id) {
          setGoogleClientId(cfg.google_client_id);
        }
      })
      .catch(() => {});
  }, []);

  // Synchronously listen for global 401 unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('active_matrix_job_id');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const refreshUser = async () => {
    try {
      const activeUser = await api.getMe();
      setUser(activeUser);
      localStorage.setItem('auth_user', JSON.stringify(activeUser));
    } catch {
      // Token might be invalid or expired
      setUser(null);
      setToken(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string, otp?: string): Promise<TokenResponse> => {
    const res = await api.login(email, password, otp);
    setToken(res.access_token);
    localStorage.setItem('auth_token', res.access_token);
    
    const userProfile: User = {
      id: res.user_id,
      email: res.email,
      full_name: res.full_name || email.split('@')[0],
      role: res.role,
      organization_id: res.organization_id
    };
    setUser(userProfile);
    localStorage.setItem('auth_user', JSON.stringify(userProfile));
    return res;
  };

  const loginWithGoogle = async (idToken: string): Promise<TokenResponse> => {
    const res = await api.loginWithGoogle(idToken);
    setToken(res.access_token);
    localStorage.setItem('auth_token', res.access_token);

    const userProfile: User = {
      id: res.user_id,
      email: res.email,
      full_name: res.full_name || res.email.split('@')[0],
      role: res.role,
      organization_id: res.organization_id
    };
    setUser(userProfile);
    localStorage.setItem('auth_user', JSON.stringify(userProfile));
    return res;
  };

  const register = async (data: { email: string; full_name: string; password: string; role?: string; otp?: string }): Promise<TokenResponse | User> => {
    const res = await api.register(data);
    if (res && (res as TokenResponse).access_token) {
      const tokenRes = res as TokenResponse;
      setToken(tokenRes.access_token);
      localStorage.setItem('auth_token', tokenRes.access_token);
      const userProfile: User = {
        id: tokenRes.user_id || (tokenRes as any).id,
        email: tokenRes.email,
        full_name: tokenRes.full_name || data.full_name || tokenRes.email.split('@')[0],
        role: tokenRes.role,
        organization_id: tokenRes.organization_id
      };
      setUser(userProfile);
      localStorage.setItem('auth_user', JSON.stringify(userProfile));
    }
    return res;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('active_matrix_job_id');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        googleClientId,
        login,
        loginWithGoogle,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
