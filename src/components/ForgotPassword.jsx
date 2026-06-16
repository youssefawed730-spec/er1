import React, { useState } from 'react';
import { forgotPassword, resetPassword, getSystemConfig } from '../data/store';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import LanguageSwitcher from './common/LanguageSwitcher';

// Handles two flows on one screen:
//  - /forgot-password            -> request a reset link by email
//  - /reset-password?token=...   -> set a new password using that link
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState(null);   // { type: 'success' | 'error', message }
  const [loading, setLoading] = useState(false);

  const brandConfig = getSystemConfig();

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    const result = await forgotPassword(email);
    setLoading(false);
    if (result.success) {
      setStatus({ type: 'success', message: result.message || t('auth.resetLinkSent') });
    } else {
      setStatus({ type: 'error', message: result.message || t('auth.resetRequestFailed') });
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus({ type: 'error', message: t('auth.passwordTooShort') });
      return;
    }
    if (password !== confirmPassword) {
      setStatus({ type: 'error', message: t('auth.passwordsDontMatch') });
      return;
    }

    setLoading(true);
    const result = await resetPassword(token, password);
    setLoading(false);

    if (result.success) {
      setStatus({ type: 'success', message: t('auth.passwordResetSuccess') });
      setTimeout(() => navigate('/login'), 2000);
    } else {
      setStatus({ type: 'error', message: result.message || t('auth.resetFailed') });
    }
  };

  const isResetMode = Boolean(token);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher compact />
        </div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 10-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isResetMode ? t('auth.resetPasswordTitle') : t('auth.forgotPasswordTitle')}
          </h1>
          <p className="text-gray-500 mt-1">
            {isResetMode ? t('auth.resetPasswordSubtitle') : t('auth.forgotPasswordSubtitle')}
          </p>
        </div>

        {status && (
          <div className={`mb-5 p-3 rounded-lg text-sm flex items-center ${
            status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}>
            <svg className="w-5 h-5 mr-2 rtl:mr-0 rtl:ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {status.type === 'success' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
            {status.message}
          </div>
        )}

        {!isResetMode ? (
          // ── Request reset link ──────────────────────────
          <form onSubmit={handleRequestReset} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg disabled:opacity-60"
            >
              {loading ? t('auth.sending') : t('auth.sendResetLink')}
            </button>
          </form>
        ) : (
          // ── Set new password ────────────────────────────
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.newPassword')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg disabled:opacity-60"
            >
              {loading ? t('auth.resetting') : t('auth.resetPassword')}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
