import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Bot,
  Sparkles,
  ExternalLink,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { UserRole } from '../../types';

declare global {
  interface Window {
    google?: any;
  }
}

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogle, register, googleClientId } = useAuth();
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('QA_ENGINEER');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);

  // OTP Verification States
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const switchTab = (nextTab: 'login' | 'register' | 'forgot') => {
    setTab(nextTab);
    setError(null);
    setSuccessMsg(null);
    setOtp('');
    setOtpSent(false);
    setConfirmPassword('');
  };

  // Load official Google Identity Services script
  useEffect(() => {
    if (!googleClientId) return;

    const scriptId = 'google-gsi-client-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const initializeGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: any) => {
            if (response.credential) {
              setLoading(true);
              setError(null);
              try {
                await loginWithGoogle(response.credential);
              } catch (err: any) {
                const msg = err.response?.data?.detail || err.message || 'Google authentication failed';
                setError(msg);
              } finally {
                setLoading(false);
              }
            }
          },
        });

        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 338,
        });
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogle;
      document.body.appendChild(script);
    } else {
      initializeGoogle();
    }
  }, [googleClientId, tab]);

  useEffect(() => {
    if (otpCooldown > 0) {
      const timer = setTimeout(() => setOtpCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCooldown]);

  const ALLOWED_SIGNUP_EMAILS = [
    'ishaangarg312@gmail.com',
    'ishaangarg315@gmail.com',
    'mv9646@gmail.com',
  ];

  const handleSendOtp = async (overridePurpose?: 'register' | 'login' | 'reset_password') => {
    setError(null);
    setSuccessMsg(null);
    const emailClean = email.trim().toLowerCase();
    if (!emailClean) {
      setError('Please enter your email address first.');
      return;
    }
    const currentPurpose =
      overridePurpose || (tab === 'login' ? 'login' : tab === 'forgot' ? 'reset_password' : 'register');

    if (currentPurpose === 'register' && !ALLOWED_SIGNUP_EMAILS.includes(emailClean)) {
      setError('Website in development. Coming soon');
      return;
    }

    setOtpSending(true);
    try {
      const res = await api.sendOtp(emailClean, currentPurpose);
      setOtpSent(true);
      setOtpCooldown(res.cooldown_seconds || 30);
      setSuccessMsg(res.message || `Verification code sent to ${emailClean}! Check your inbox.`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to send OTP';
      setError(msg);
    } finally {
      setOtpSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const emailClean = email.trim().toLowerCase();

    if (!emailClean) {
      setError('Please enter your email address.');
      return;
    }

    if (tab === 'forgot') {
      if (!otp.trim()) {
        setError('Please enter the 6-digit verification code sent to your email.');
        return;
      }
      if (!password || password.length < 6) {
        setError('New password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please confirm your new password.');
        return;
      }

      setLoading(true);
      try {
        const res = await api.resetPassword({
          email: emailClean,
          otp: otp.trim(),
          new_password: password,
          confirm_password: confirmPassword,
        });
        setSuccessMsg(res.message || 'Password reset successfully! Redirecting to Log In...');
        setTimeout(() => {
          switchTab('login');
          setPassword('');
          setConfirmPassword('');
        }, 1500);
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || 'Failed to reset password';
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (tab === 'register') {
      if (!ALLOWED_SIGNUP_EMAILS.includes(emailClean)) {
        setError('Website in development. Coming soon');
        return;
      }
      if (!otp.trim()) {
        setError('Please enter the 6-digit verification code sent to your email.');
        return;
      }
      setLoading(true);
      try {
        await register({
          email: emailClean,
          full_name: fullName.trim(),
          password,
          role,
          otp: otp.trim(),
        });
        setSuccessMsg('Account created successfully! Logging you in...');
        await login(emailClean, password, otp.trim());
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || 'Authentication failed';
        setError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (tab === 'login') {
      if (!otp.trim()) {
        if (!otpSent) {
          // If the user entered email & password and hit Sign In, auto-send the OTP!
          await handleSendOtp('login');
          return;
        } else {
          setError('Please enter the 6-digit verification code sent to your email.');
          return;
        }
      }

      setLoading(true);
      try {
        await login(emailClean, password, otp.trim());
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || 'Authentication failed';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="figma-auth-container">
      {/* Background Mesh Grid */}
      <div className="figma-mesh-bg" />

      {/* Decorative Perspective Corner Mesh (SVG) */}
      <svg
        style={{
          position: 'absolute',
          bottom: '-40px',
          left: '-40px',
          width: '380px',
          height: '240px',
          opacity: 0.22,
          pointerEvents: 'none'
        }}
        viewBox="0 0 400 250"
      >
        <defs>
          <linearGradient id="meshPurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={i * 20}
            x2="400"
            y2={i * 12 + 80}
            stroke="url(#meshPurple)"
            strokeWidth="0.8"
          />
        ))}
        {Array.from({ length: 16 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={i * 25}
            y1="0"
            x2={i * 35 - 50}
            y2="250"
            stroke="url(#meshPurple)"
            strokeWidth="0.8"
          />
        ))}
      </svg>

      <svg
        style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '380px',
          height: '240px',
          opacity: 0.18,
          pointerEvents: 'none'
        }}
        viewBox="0 0 400 250"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`th-${i}`}
            x1="0"
            y1={i * 12 + 60}
            x2="400"
            y2={i * 20}
            stroke="#818cf8"
            strokeWidth="0.8"
          />
        ))}
        {Array.from({ length: 16 }).map((_, i) => (
          <line
            key={`tv-${i}`}
            x1={i * 25}
            y1="0"
            x2={i * 35 + 40}
            y2="250"
            stroke="#818cf8"
            strokeWidth="0.8"
          />
        ))}
      </svg>

      {/* Main Figma Layout Container */}
      <div className="figma-auth-layout">
        
        {/* ================================================================= */}
        {/* LEFT COLUMN: Modern Product Hero Showcase                         */}
        {/* ================================================================= */}
        <div className="figma-hero-col">
          
          {/* Logo Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}>
              <Bot size={16} color="#ffffff" />
            </div>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.01em' }}>
              EVAL AI - Enterprise Agent QA Platform
            </span>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.03em', margin: 0 }}>
            Modern product Hero Showcase
          </h1>

          {/* Hero Showcase Card Container */}
          <div className="figma-hero-box">
            
            {/* Left Box: AI Evaluation Matrix Chart */}
            <div className="figma-chart-card">
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                AI evaluation matrix
              </div>

              {/* S-Curve Graph Area */}
              <div style={{ position: 'relative', width: '100%', height: '180px', margin: '4px 0' }}>
                <span style={{ position: 'absolute', top: 2, left: 6, fontSize: '9px', color: '#64748b', fontFamily: 'monospace' }}>High ↑</span>
                <span style={{ position: 'absolute', bottom: 4, left: 6, fontSize: '9px', color: '#64748b', fontFamily: 'monospace' }}>Low</span>
                <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: '9px', color: '#64748b', fontFamily: 'monospace' }}>High →</span>
                <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: '#64748b', fontFamily: 'monospace' }}>Evaluability</span>
                <span style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', fontSize: '8px', color: '#64748b', fontFamily: 'monospace' }}>Evaluation</span>

                <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 200 130">
                  {/* Grid Lines */}
                  <line x1="26" y1="20" x2="185" y2="20" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="26" y1="65" x2="185" y2="65" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="26" y1="110" x2="185" y2="110" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <line x1="26" y1="15" x2="26" y2="110" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <line x1="105" y1="15" x2="105" y2="110" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
                  <line x1="185" y1="15" x2="185" y2="110" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />

                  <defs>
                    <linearGradient id="figmaCurve" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="50%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                    <filter id="figmaGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="3.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Sigmoid Curve */}
                  <path
                    d="M 26 102 C 60 98, 80 82, 105 65 C 130 46, 155 30, 185 24"
                    fill="none"
                    stroke="url(#figmaCurve)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    filter="url(#figmaGlow)"
                  />
                  {/* Luminous Glowing Dot */}
                  <circle cx="105" cy="65" r="9" fill="rgba(99, 102, 241, 0.35)" />
                  <circle cx="105" cy="65" r="4.5" fill="#ffffff" stroke="#818cf8" strokeWidth="2" />
                </svg>
              </div>
            </div>

            {/* Right Box: Stats + Dark Glassmorphism Preview */}
            <div className="figma-stats-col">
              
              {/* Stat Boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="figma-stat-card">
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>99.9%</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Deterministic QA</span>
                </div>
                <div className="figma-stat-card">
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>4x</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Distributed Workers</span>
                </div>
              </div>

              {/* Elegant dark glassmorphism card */}
              <div className="figma-preview-card">
                <div style={{
                  background: 'rgba(5, 9, 20, 0.9)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: '#e2e8f0', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1' }} />
                      <span>EVAL AI</span>
                    </div>
                    <span style={{ fontSize: '8px', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '1px 5px', borderRadius: '4px' }}>
                      ONLINE
                    </span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500 }}>
                    AI-Enterprise Agent QA Platform
                  </div>
                  <div style={{ height: '4px', width: '100%', background: '#1e293b', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '75%', background: '#6366f1', borderRadius: '2px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#64748b', fontFamily: 'monospace' }}>
                    <span>Nodes: 14/14</span>
                    <span>38ms</span>
                  </div>
                </div>
                <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', marginTop: '6px' }}>
                  Elegant dark glassmorphism card
                </span>
              </div>

            </div>

          </div>

        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: Exact Figma Log In Card                             */}
        {/* ================================================================= */}
        <div className="figma-login-card">
          
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              {tab === 'login' ? 'Log In' : tab === 'register' ? 'Sign Up' : 'Reset Password'}
            </h2>
            <button
              type="button"
              onClick={() => {
                if (tab === 'login') switchTab('register');
                else switchTab('login');
              }}
              style={{
                fontSize: '11px',
                color: '#818cf8',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#c7d2fe')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
            >
              {tab === 'login' ? 'Create Account' : 'Back to Sign In'}
            </button>
          </div>

          {tab === 'forgot' && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0', lineHeight: 1.4 }}>
              Enter your registered email, verify with the OTP code, and enter your new password with confirmation.
            </p>
          )}

          {/* Feedback Messages */}
          {error && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              fontSize: '11px',
              color: '#fda4af',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <AlertCircle size={14} color="#f43f5e" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '11px',
              color: '#6ee7b7',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={14} color="#10b981" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Inputs Form */}
          <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Decoy fields to capture aggressive browser/Chrome autofill on localhost */}
            <input type="text" style={{ display: 'none' }} tabIndex={-1} autoComplete="username" />
            <input type="password" style={{ display: 'none' }} tabIndex={-1} autoComplete="current-password" />

            {tab === 'register' && (
              <div className="figma-input-wrapper">
                <div className="figma-input-icon">👤</div>
                <input
                  type="text"
                  required
                  name="eval-auth-name"
                  autoComplete="off"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="figma-input"
                />
              </div>
            )}

            {/* Email Field with Send/Resend OTP Button */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="figma-input-wrapper" style={{ flex: 1 }}>
                <div className="figma-input-icon">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  name="eval-auth-email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="figma-input"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSendOtp()}
                disabled={otpSending || otpCooldown > 0}
                style={{
                  height: '42px',
                  padding: '0 14px',
                  background: otpCooldown > 0 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid',
                  borderColor: otpCooldown > 0 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(99, 102, 241, 0.4)',
                  borderRadius: '10px',
                  color: otpCooldown > 0 ? '#94a3b8' : '#c7d2fe',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: otpSending || otpCooldown > 0 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {otpSending ? 'Sending...' : otpCooldown > 0 ? `Resend (${otpCooldown}s)` : (otpSent ? 'Resend OTP' : 'Send OTP')}
              </button>
            </div>

            {/* Verification OTP Field */}
            <div className="figma-input-wrapper">
              <div className="figma-input-icon">
                <KeyRound size={16} color={otpSent ? '#818cf8' : '#64748b'} />
              </div>
              <input
                type="text"
                required
                maxLength={6}
                name="eval-auth-otp"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder={otpSent ? "Enter 6-digit code from email" : (tab === 'login' ? "Enter OTP (or click 'Send OTP')" : "Click 'Send OTP' first")}
                className="figma-input"
                style={{
                  letterSpacing: otp ? '4px' : 'normal',
                  fontWeight: otp ? 700 : 400,
                  borderColor: otpSent ? 'rgba(99, 102, 241, 0.4)' : undefined
                }}
              />
            </div>

            {/* Password Field */}
            <div className="figma-input-wrapper">
              <div className="figma-input-icon">
                <Lock size={16} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                name="qa-auth-secret-key"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'forgot' ? 'New Password (min. 6 chars)' : 'Password'}
                className="figma-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: '14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#cbd5e1')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>

            {/* Confirm Password Field (Only on Forgot Password tab) */}
            {tab === 'forgot' && (
              <div className="figma-input-wrapper">
                <div className="figma-input-icon">
                  <Lock size={16} />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  name="eval-auth-confirm-pass"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  className="figma-input"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: '14px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#cbd5e1')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                >
                  {showConfirmPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            )}

            {/* Forgot Password Link (Only on Login tab) */}
            {tab === 'login' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                <button
                  type="button"
                  onClick={() => switchTab('forgot')}
                  style={{
                    fontSize: '11px',
                    color: '#818cf8',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 500,
                    padding: '2px 0',
                    transition: 'color 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#c7d2fe')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#818cf8')}
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={loading}
              className="figma-primary-btn"
              style={{ marginTop: '4px' }}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <span>{tab === 'login' ? 'Sign In' : tab === 'register' ? 'Create Account' : 'Reset Password'}</span>
              )}
            </button>
          </form>

        </div>

      </div>
    </div>
  );
};
