import React, { useState, useEffect } from 'react';
import { login, ROLE_PERMISSIONS, getSystemConfig, subscribeToEvents } from '../data/store';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import LanguageSwitcher from './common/LanguageSwitcher';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [brandConfig, setBrandConfig] = useState({ companyName: null, companyLogo: null });
  const navigate = useNavigate();

  useEffect(() => {
    const cfg = getSystemConfig();
    setBrandConfig({ companyName: cfg.companyName, companyLogo: cfg.companyLogo });
    const unsub = subscribeToEvents((e) => {
      if (e.type === 'config_changed') {
        setBrandConfig({ companyName: e.data.companyName, companyLogo: e.data.companyLogo });
      }
    });
    return unsub;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.success) navigate('/');
    else setError(result.message || t('auth.invalid'));
  };

  const handleQuickLogin = async (demoEmail, demoPassword) => {
    const result = await login(demoEmail, demoPassword);
    if (result.success) navigate('/');
    else setError(t('auth.invalid'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher compact />
        </div>
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 overflow-hidden ${brandConfig.companyLogo ? 'bg-gray-100 border border-gray-200' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
            {brandConfig.companyLogo ? (
              <img src={brandConfig.companyLogo} alt="Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{brandConfig.companyName || t('auth.title')}</h1>
          <p className="text-gray-500 mt-1">{t('auth.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center">
              <svg className="w-5 h-5 mr-2 rtl:mr-0 rtl:ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.password')}</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end -mt-2">
            <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all shadow-lg"
          >
            {t('auth.signIn')}
          </button>
        </form>

        {/* Demo Accounts by Role */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-4 font-medium">{t('auth.quickLogin')}</p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => handleQuickLogin('admin@logistics.com', 'admin123')}
              className="bg-purple-50 hover:bg-purple-100 p-2 rounded-lg text-start transition-colors border border-purple-200">
              <p className="font-medium text-purple-700 text-xs">Admin</p>
              <p className="text-purple-500 text-xs">Full Access</p>
            </button>
            <button onClick={() => handleQuickLogin('manager@logistics.com', 'manager123')}
              className="bg-indigo-50 hover:bg-indigo-100 p-2 rounded-lg text-start transition-colors border border-indigo-200">
              <p className="font-medium text-indigo-700 text-xs">Manager</p>
              <p className="text-indigo-500 text-xs">Management</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => handleQuickLogin('accounting@logistics.com', 'accounting123')}
              className="bg-blue-50 hover:bg-blue-100 p-2 rounded-lg text-start transition-colors border border-blue-200">
              <p className="font-medium text-blue-700 text-xs">Accounting</p>
              <p className="text-blue-500 text-xs">Finance Team</p>
            </button>
            <button onClick={() => handleQuickLogin('accountant2@logistics.com', 'accounting456')}
              className="bg-cyan-50 hover:bg-cyan-100 p-2 rounded-lg text-start transition-colors border border-cyan-200">
              <p className="font-medium text-cyan-700 text-xs">Accountant 2</p>
              <p className="text-cyan-500 text-xs">Finance Team</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => handleQuickLogin('sales@logistics.com', 'sales123')}
              className="bg-green-50 hover:bg-green-100 p-2 rounded-lg text-start transition-colors border border-green-200">
              <p className="font-medium text-green-700 text-xs">Sales Rep</p>
              <p className="text-green-500 text-xs">Sales Team</p>
            </button>
            <button onClick={() => handleQuickLogin('head.sales@logistics.com', 'head123')}
              className="bg-emerald-50 hover:bg-emerald-100 p-2 rounded-lg text-start transition-colors border border-emerald-200">
              <p className="font-medium text-emerald-700 text-xs">Head of Sales</p>
              <p className="text-emerald-500 text-xs">Sales Manager</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => handleQuickLogin('staff@logistics.com', 'staff123')}
              className="bg-orange-50 hover:bg-orange-100 p-2 rounded-lg text-start transition-colors border border-orange-200">
              <p className="font-medium text-orange-700 text-xs">Staff</p>
              <p className="text-orange-500 text-xs">Operations</p>
            </button>
            <button onClick={() => handleQuickLogin('operation@logistics.com', 'operation123')}
              className="bg-red-50 hover:bg-red-100 p-2 rounded-lg text-start transition-colors border border-red-200">
              <p className="font-medium text-red-700 text-xs">Operations</p>
              <p className="text-red-500 text-xs">Warehouse</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleQuickLogin('contact@logistics.com', 'contact123')}
              className="bg-gray-50 hover:bg-gray-100 p-2 rounded-lg text-start transition-colors border border-gray-200">
              <p className="font-medium text-gray-700 text-xs">Contact</p>
              <p className="text-gray-500 text-xs">External</p>
            </button>
            <button onClick={() => handleQuickLogin('partner@external.com', 'partner123')}
              className="bg-gray-50 hover:bg-gray-100 p-2 rounded-lg text-start transition-colors border border-gray-200">
              <p className="font-medium text-gray-700 text-xs">Partner</p>
              <p className="text-gray-500 text-xs">External</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
