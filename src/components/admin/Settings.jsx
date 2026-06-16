// components/admin/Settings.jsx
import React, { useState, useEffect } from 'react';
import {
  getSystemConfig, updateSystemConfig, CURRENCIES,
  getCurrentUser, hasPermission,
  getEffectiveRolePermissions, getRolePermissionOverrides,
  saveRolePermissionOverrides, resetRolePermissions, DEFAULT_ROLE_PERMISSIONS,
  fetchLatestExchangeRates, getCurrencyRatesLastUpdated, updateCurrencyRate,
  subscribeToEvents, startQuotationExpiryChecker, stopQuotationExpiryChecker,
  getCustomContactSources, saveCustomContactSource, deleteCustomContactSource
} from '../../data/store';
import { useTranslation, LANGUAGES, setLanguage as setI18nLanguage, getOverrides, setOverrides } from '../../i18n';

const ALL_MODULES = Array.from(new Set(
  Object.values(DEFAULT_ROLE_PERMISSIONS).flatMap(r => Object.keys(r.permissions || {}))
)).sort();
const ALL_ACTIONS = ['read', 'write', 'delete', 'approve', 'confirm', 'post', 'export'];

export default function Settings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [rolesDraft, setRolesDraft] = useState(null);
  const [overrides, setOverridesDraft] = useState({});
  const [currencyUpdating, setCurrencyUpdating] = useState(false);
  const [currencyLastUpdated, setCurrencyLastUpdated] = useState(null);
  const [currencyUpdateError, setCurrencyUpdateError] = useState(null);
  const [customRates, setCustomRates] = useState({});
  const [emailSettings, setEmailSettings] = useState({});
  const [quotationExpiryEnabled, setQuotationExpiryEnabled] = useState(true);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [customSources, setCustomSources] = useState([]);
  const [newSourceInput, setNewSourceInput] = useState('');
  const [sourceError, setSourceError] = useState('');
  const user = getCurrentUser();
  const canEditRoles = hasPermission(user?.role, 'settings', 'write');

  useEffect(() => {
    loadConfig();
    // Subscribe to currency rate updates
    const unsub = subscribeToEvents((e) => {
      if (e.type === 'currency_rates_updated') {
        setCurrencyLastUpdated(e.data.timestamp);
      }
    });
    return unsub;
  }, []);

  const loadConfig = () => {
    const freshConfig = getSystemConfig();
    setConfig(freshConfig);
    setRolesDraft(getEffectiveRolePermissions());
    setOverridesDraft(getOverrides());
    setCurrencyLastUpdated(getCurrencyRatesLastUpdated());
    // Load current rates
    const rates = {};
    Object.keys(CURRENCIES).forEach(code => {
      rates[code] = CURRENCIES[code].rate;
    });
    setCustomRates(rates);
    // Load email settings from freshConfig (config state is still null at this point)
    setEmailSettings({
      enabled: freshConfig.emailNotifications || false,
      smtpHost: freshConfig.smtpHost || '',
      smtpPort: freshConfig.smtpPort || 587,
      smtpUser: freshConfig.smtpUser || '',
      smtpPassword: freshConfig.smtpPassword || '',
      fromEmail: freshConfig.fromEmail || '',
      fromName: freshConfig.fromName || '',
      smtpWebhookUrl: freshConfig.smtpWebhookUrl || ''
    });
    setLogoPreview(freshConfig.companyLogo || null);
    getCustomContactSources().then(setCustomSources).catch(()=>{});
    setLoading(false);
  };

  const handleUpdateCurrencyRates = async () => {
    setCurrencyUpdating(true);
    setCurrencyUpdateError(null);
    const result = await fetchLatestExchangeRates();
    setCurrencyUpdating(false);
    if (result.success) {
      setCurrencyLastUpdated(result.timestamp);
      // Refresh displayed rates
      const rates = {};
      Object.keys(CURRENCIES).forEach(code => {
        rates[code] = CURRENCIES[code].rate;
      });
      setCustomRates(rates);
    } else {
      setCurrencyUpdateError(result.message);
    }
  };

  const handleCurrencyRateChange = (code, value) => {
    const newRate = parseFloat(value);
    if (!isNaN(newRate) && newRate > 0) {
      setCustomRates(prev => ({ ...prev, [code]: newRate }));
    }
  };

  const handleSaveCurrencyRates = () => {
    Object.keys(customRates).forEach(code => {
      updateCurrencyRate(code, customRates[code]);
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSave = () => {
    // Merge email settings and logo into config
    const updatedConfig = {
      ...config,
      ...emailSettings,
      companyLogo: logoPreview,
    };
    updateSystemConfig(updatedConfig);

    // Apply dark mode immediately
    if (config.darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    // Apply language immediately
    setI18nLanguage(config.language || 'en');

    // Persist label overrides
    setOverrides(overrides);

    if (canEditRoles && rolesDraft) {
      const diff = {};
      for (const [role, info] of Object.entries(rolesDraft)) {
        const def = DEFAULT_ROLE_PERMISSIONS[role];
        if (!def) {
          diff[role] = info;
          continue;
        }
        const changed = JSON.stringify(def.permissions) !== JSON.stringify(info.permissions || {});
        if (changed) diff[role] = { name: info.name, permissions: info.permissions };
      }
      saveRolePermissionOverrides(diff);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChange = (key, value) => {
    setConfig({ ...config, [key]: value });
    // Apply visual/locale changes immediately for live preview
    if (key === 'darkMode') {
      if (value) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
    if (key === 'language') {
      setI18nLanguage(value || 'en');
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('Please select an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > 500 * 1024) {
      setLogoError('Logo must be smaller than 500 KB');
      return;
    }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoError('');
  };

  const togglePermission = (role, module, action) => {
    setRolesDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const perms = next[role].permissions[module] || [];
      next[role].permissions[module] = perms.includes(action)
        ? perms.filter(a => a !== action)
        : [...perms, action];
      if (next[role].permissions[module].length === 0) delete next[role].permissions[module];
      return next;
    });
  };

  const handleResetRoles = () => {
    resetRolePermissions();
    setRolesDraft(getEffectiveRolePermissions());
  };

  const addOverrideRow = () => {
    setOverridesDraft({ ...overrides, '': '' });
  };

  const updateOverride = (oldKey, newKey, newValue) => {
    const next = { ...overrides };
    if (oldKey && oldKey !== newKey) delete next[oldKey];
    if (newKey) next[newKey] = newValue;
    setOverridesDraft(next);
  };

  const removeOverride = (key) => {
    const next = { ...overrides };
    delete next[key];
    setOverridesDraft(next);
  };

  const handleAddSource = () => {
    const trimmed = newSourceInput.trim();
    if (!trimmed) return;
    const ok = saveCustomContactSource(trimmed);
    if (!ok) {
      setSourceError('هذا المصدر موجود بالفعل / This source already exists.');
      return;
    }
    setSourceError('');
    setNewSourceInput('');
    getCustomContactSources().then(setCustomSources).catch(()=>{});
  };

  const handleDeleteSource = (id) => {
    deleteCustomContactSource(id);
    getCustomContactSources().then(setCustomSources).catch(()=>{});
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">{t('common.loading')}</div>;
  }

  const isContact = user?.role === 'contact';

  // ── Contact Sources Panel ──────────────────────────────────────────────────
  const ContactSourcesPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Contact Sources</h2>
          <p className="text-xs text-gray-500">مصادر جهات الاتصال — تظهر تلقائياً في قائمة المصدر عند إضافة شركة أو شخص</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSourceInput}
            onChange={(e) => { setNewSourceInput(e.target.value); setSourceError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSource(); } }}
            placeholder="e.g. LinkedIn, Exhibition, WhatsApp…"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleAddSource}
            disabled={!newSourceInput.trim()}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {sourceError && <p className="text-xs text-red-500">{sourceError}</p>}

        {customSources.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <p className="text-sm text-gray-400">لا توجد مصادر مخصصة بعد</p>
            <p className="text-xs text-gray-300 mt-0.5">No custom sources yet — add one above</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
            {customSources.map((src, idx) => (
              <div key={src.id} className="flex items-center justify-between px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{src.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSource(src.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete source"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-400 pt-1">
          {customSources.length} custom source{customSources.length !== 1 ? 's' : ''} — these appear automatically in the Source dropdown when adding a company or person.
        </p>
      </div>
    </div>
  );

  // Contact role: only show the sources panel
  if (isContact) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">إعدادات مصادر جهات الاتصال — Contact Role Settings</p>
        </div>
        {ContactSourcesPanel}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-gray-500">{t('settings.subtitle')}</p>
      </div>

      {saved && (
        <div className="bg-green-100 text-green-700 p-4 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-2 rtl:mr-0 rtl:ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t('settings.savedOk')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.companyInfo')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.companyName')}</label>
              <input
                type="text"
                value={config.companyName || ''}
                onChange={(e) => handleChange('companyName', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Company Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-1" />
                  ) : (
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                {/* Controls */}
                <div className="flex-1">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Logo
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {logoPreview && (
                    <button
                      onClick={handleRemoveLogo}
                      className="ml-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-gray-400 mt-2">PNG, JPG or SVG · Max 500 KB · Recommended 200×200 px</p>
                  {logoError && <p className="text-xs text-red-600 mt-1">{logoError}</p>}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.fiscalYear')}</label>
              <input
                type="date"
                value={config.fiscalYearStart || ''}
                onChange={(e) => handleChange('fiscalYearStart', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Regional Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.regional')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.language')}</label>
              <select
                value={config.language || 'en'}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {Object.values(LANGUAGES).map(l => (
                  <option key={l.code} value={l.code}>{l.nativeLabel} ({l.label})</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('settings.languageHelp')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.currency')}</label>
              <select
                value={config.currency || 'USD'}
                onChange={(e) => handleChange('currency', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(CURRENCIES).map(([code, info]) => (
                  <option key={code} value={code}>{info.symbol} - {info.name} ({code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.dateFormat')}</label>
              <select
                value={config.dateFormat || 'MM/DD/YYYY'}
                onChange={(e) => handleChange('dateFormat', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.timezone')}</label>
              <select
                value={config.timezone || 'America/New_York'}
                onChange={(e) => handleChange('timezone', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="Europe/London">GMT (London)</option>
                <option value="Asia/Dubai">GST (Dubai)</option>
                <option value="Asia/Riyadh">AST (Riyadh)</option>
                <option value="Africa/Cairo">EET (Cairo)</option>
                <option value="Asia/Tokyo">JST (Tokyo)</option>
                <option value="Australia/Sydney">AEDT (Sydney)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.appearance')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">{t('settings.darkMode')}</p>
                <p className="text-sm text-gray-500">{t('settings.darkModeHelp')}</p>
              </div>
              <button
                onClick={() => handleChange('darkMode', !config.darkMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.darkMode ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.notifications')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">{t('settings.emailNotif')}</p>
                <p className="text-sm text-gray-500">{t('settings.emailNotifHelp')}</p>
              </div>
              <button
                onClick={() => {
                  const newEmailSettings = { ...emailSettings, enabled: !emailSettings.enabled };
                  setEmailSettings(newEmailSettings);
                  handleChange('emailNotifications', newEmailSettings.enabled);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailSettings.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailSettings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">{t('settings.auditLog')}</p>
                <p className="text-sm text-gray-500">{t('settings.auditLogHelp')}</p>
              </div>
              <button
                onClick={() => handleChange('auditLogEnabled', !config.auditLogEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.auditLogEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.auditLogEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-700">Auto-expire Quotations</p>
                <p className="text-sm text-gray-500">Automatically mark quotations as expired when validUntil date passes</p>
              </div>
              <button
                onClick={() => {
                  if (!quotationExpiryEnabled) {
                    startQuotationExpiryChecker();
                  } else {
                    stopQuotationExpiryChecker();
                  }
                  setQuotationExpiryEnabled(!quotationExpiryEnabled);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${quotationExpiryEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${quotationExpiryEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Email Configuration */}
        {emailSettings.enabled && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Configuration</h2>
            <p className="text-sm text-gray-500 mb-4">Configure SMTP settings for customer email notifications</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                <input
                  type="text"
                  value={emailSettings.fromName}
                  onChange={(e) => setEmailSettings({ ...emailSettings, fromName: e.target.value })}
                  placeholder="LogisticsERP"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                <input
                  type="email"
                  value={emailSettings.fromEmail}
                  onChange={(e) => setEmailSettings({ ...emailSettings, fromEmail: e.target.value })}
                  placeholder="noreply@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={emailSettings.smtpHost}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
                  placeholder="smtp.example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={emailSettings.smtpPort}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: e.target.value })}
                  placeholder="587"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                <input
                  type="text"
                  value={emailSettings.smtpUser}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpUser: e.target.value })}
                  placeholder="username"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                <input
                  type="password"
                  value={emailSettings.smtpPassword}
                  onChange={(e) => setEmailSettings({ ...emailSettings, smtpPassword: e.target.value })}
                  placeholder="password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Relay Webhook URL</label>
              <input
                type="url"
                value={emailSettings.smtpWebhookUrl || ''}
                onChange={(e) => setEmailSettings({ ...emailSettings, smtpWebhookUrl: e.target.value })}
                placeholder="https://your-backend.com/api/send-email"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Point this to your backend SMTP relay or email-sending service. The ERP will POST JSON {`{to, subject, body, from}`} to this URL. Leave blank to use in-app notifications only.
              </p>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
              ⚠️ SMTP credentials and the Relay URL are saved and <strong>read</strong> by <code>sendEmail()</code>. Without a Relay URL, emails fall back to in-app notifications.
            </p>
          </div>
        )}
      </div>

      {/* ─────── Custom Labels (translation overrides) ─────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">{t('settings.translationsTitle')}</h2>
          <button onClick={addOverrideRow} className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
            + {t('settings.addOverride')}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t('settings.translationsHelp')}</p>
        <div className="space-y-2">
          {Object.keys(overrides).length === 0 && (
            <p className="text-sm text-gray-400 italic">—</p>
          )}
          {Object.entries(overrides).map(([key, value], idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                type="text"
                value={key}
                placeholder={t('settings.translationKey')}
                onChange={(e) => updateOverride(key, e.target.value, value)}
                className="col-span-5 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <input
                type="text"
                value={value}
                placeholder={t('settings.translationValue')}
                onChange={(e) => updateOverride(key, key, e.target.value)}
                className="col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={() => removeOverride(key)}
                className="col-span-1 px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─────── Role Permissions Editor ─────── */}
      {canEditRoles && rolesDraft && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.rolesTitle')}</h2>
            <button onClick={handleResetRoles} className="text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
              {t('settings.resetRoles')}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('settings.rolesHelp')}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="p-2">Role / Module</th>
                  {ALL_ACTIONS.map(a => <th key={a} className="p-2 text-center">{a}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(rolesDraft).map(([role, info]) => (
                  <React.Fragment key={role}>
                    <tr className="bg-gray-50">
                      <td colSpan={ALL_ACTIONS.length + 1} className="p-2 font-semibold text-gray-700">
                        {info.name || role}
                      </td>
                    </tr>
                    {ALL_MODULES.map(m => (
                      <tr key={role + m} className="border-t border-gray-100">
                        <td className="p-2 text-gray-600">{m}</td>
                        {ALL_ACTIONS.map(a => {
                          const checked = (info.permissions?.[m] || []).includes(a);
                          return (
                            <td key={a} className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(role, m, a)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          {t('settings.saveAll')}
        </button>
      </div>

      {/* Currency Exchange Rates Management */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Currency Exchange Rates</h2>
            <p className="text-sm text-gray-500 mt-1">
              Auto-update from Frankfurter API or set custom rates. Rates are based on 1 USD.
              {currencyLastUpdated && (
                <span className="block mt-1">
                  Last updated: {new Date(currencyLastUpdated).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpdateCurrencyRates}
              disabled={currencyUpdating}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                currencyUpdating
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {currencyUpdating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Updating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Update from API
                </>
              )}
            </button>
          </div>
        </div>

        {currencyUpdateError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Failed to update rates: {currencyUpdateError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b">
                <th className="pb-3 pr-4 font-semibold">Currency</th>
                <th className="pb-3 pr-4 font-semibold">Code</th>
                <th className="pb-3 pr-4 font-semibold">Symbol</th>
                <th className="pb-3 pr-4 font-semibold">Rate (per USD)</th>
                <th className="pb-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CURRENCIES).map(([code, info]) => (
                <tr key={code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-900">{info.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{code}</td>
                  <td className="py-3 pr-4 text-gray-600">{info.symbol}</td>
                  <td className="py-3 pr-4">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={customRates[code] || info.rate}
                      onChange={(e) => handleCurrencyRateChange(code, e.target.value)}
                      className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => {
                        const newRate = customRates[code];
                        if (newRate && newRate !== info.rate) {
                          updateCurrencyRate(code, newRate);
                          setSaved(true);
                          setTimeout(() => setSaved(false), 3000);
                        }
                      }}
                      disabled={!customRates[code] || customRates[code] === info.rate}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        !customRates[code] || customRates[code] === info.rate
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <p>API: Uses Frankfurter API (free, no API key required)</p>
            <p>Rates auto-update when older than 1 hour on app startup</p>
          </div>
          <button
            onClick={handleSaveCurrencyRates}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
          >
            Save All Custom Rates
          </button>
        </div>
      </div>

      {/* Contact Sources — visible to admin too for oversight */}
      {ContactSourcesPanel}

    </div>
  );
}
