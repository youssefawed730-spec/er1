// src/i18n/index.js
// ────────────────────────────────────────────────────────────────────────
//  Lightweight, dependency-free i18n with English + Arabic (RTL).
//
//  HOW TO ADD A NEW LANGUAGE:
//   1. Add a new entry to TRANSLATIONS below (e.g. fr: { ... }).
//   2. Add it to LANGUAGES with its label and `dir` ('ltr' or 'rtl').
//   3. Done. The Settings page picks it up automatically.
//
//  HOW TO ADD A NEW STRING:
//   1. Add the key to all language objects in TRANSLATIONS.
//   2. Use t('your.key') in any component.
//
//  CUSTOM OVERRIDES (open / flexible):
//   Translations can be overridden at runtime via localStorage key
//   `erp_translation_overrides` so each company can re-label fields
//   (e.g. call "Companies" → "Clients") without touching source code.
// ────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export const LANGUAGES = {
  en: { code: 'en', label: 'English',  nativeLabel: 'English',  dir: 'ltr' },
  ar: { code: 'ar', label: 'Arabic',   nativeLabel: 'العربية',  dir: 'rtl' }
};

export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY  = 'erp_language';
const OVERRIDE_KEY = 'erp_translation_overrides';

// ────────────────────────────────────────────────────────────────────────
//  Base translations
// ────────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.loading': 'Loading...',
    'common.confirm_delete': 'Are you sure you want to delete this?',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.close': 'Close',
    'common.actions': 'Actions',
    'common.status': 'Status',
    'common.name': 'Name',
    'common.email': 'Email',
    'common.phone': 'Phone',
    'common.address': 'Address',
    'common.notes': 'Notes',
    'common.language': 'Language',

    // Auth
    'auth.signIn': 'Sign In',
    'auth.signOut': 'Logout',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.invalid': 'Invalid email or password',
    'auth.title': 'LogisticsERP',
    'auth.subtitle': 'Complete ERP System - All Roles',
    'auth.quickLogin': 'Quick Login - Click to Sign In:',

    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.accountingDashboard': 'Accounting Dashboard',
    'nav.salesDashboard': 'Sales Dashboard',
    'nav.operationsDashboard': 'Operations Dashboard',
    'nav.costItems': 'Cost Items',
    'nav.chartOfAccounts': 'Chart of Accounts',
    'nav.invoices': 'Invoices',
    'nav.payments': 'Payments',
    'nav.expenses': 'Expenses',
    'nav.journalEntries': 'Journal Entries',
    'nav.taxConfig': 'Tax Configuration',
    'nav.reports': 'Reports',
    'nav.vendorsCustomers': 'Vendors & Customers',
    'nav.companies': 'Companies',
    'nav.opportunities': 'Opportunities',
    'nav.quotations': 'Quotations',
    'nav.salesOrders': 'Sales Orders',
    'nav.purchaseCosts': 'Purchase Costs',
    'nav.auditLogs': 'Audit Logs',
    'nav.settings': 'Settings',
    'nav.manageUsers': 'Manage Users',
    'nav.salesTeamTracker': 'Sales Team Tracker',

    // Companies module
    'companies.title': 'Companies & Contacts',
    'companies.subtitle': 'Manage customers, vendors, and company contacts',
    'companies.addCompany': 'Add Company',
    'companies.addPerson': 'Add Person',
    'companies.editCompany': 'Edit Company',
    'companies.editContact': 'Edit Contact',
    'companies.addContact': 'Add Company Contact',
    'companies.addContactShort': '+ Add Contact',
    'companies.noContacts': 'No contacts added yet',
    'companies.contacts': 'Contacts',
    'companies.totalCustomers': 'Total Customers',
    'companies.totalVendors': 'Total Vendors',
    'companies.customerAR': 'Customer AR',
    'companies.vendorAP': 'Vendor AP',
    'companies.kind.customer': 'Customer',
    'companies.kind.vendor': 'Vendor',
    'companies.kind.person': 'Person',
    'companies.kind.company': 'Company',
    'companies.recordKind': 'Record Type',
    'companies.recordKind.help': 'Choose whether this entry is a Company or an individual Person.',
    'companies.companyName': 'Company Name',
    'companies.fullName': 'Full Name',
    'companies.taxId': 'Tax ID',
    'companies.website': 'Website',
    'companies.source': 'Source',
    'companies.industry': 'Industrial Sector',
    'companies.assignTo': 'Assign to Salesman',
    'companies.unassigned': 'Unassigned',
    'companies.position': 'Position/Title',
    'companies.primary': 'Primary',
    'companies.primaryHelp': 'Primary Contact (Main point of contact)',
    'companies.deleteContact': 'Delete this contact?',
    'companies.deleteCompany': 'Are you sure you want to delete this company?',
    'companies.filter.all': 'All',
    'companies.filter.customer': 'Customers',
    'companies.filter.vendor': 'Vendors',
    'companies.filter.person': 'People',
    'companies.filter.company': 'Companies',
    'companies.ownedByYou': 'Owned by you',
    'companies.empty.contact': 'You have not added any companies or persons yet. Click "Add" to create your first one.',

    // Settings
    'settings.title': 'System Settings',
    'settings.subtitle': 'Configure system preferences and company settings',
    'settings.companyInfo': 'Company Information',
    'settings.companyName': 'Company Name',
    'settings.fiscalYear': 'Fiscal Year Start',
    'settings.regional': 'Regional Settings',
    'settings.currency': 'Default Currency',
    'settings.dateFormat': 'Date Format',
    'settings.timezone': 'Timezone',
    'settings.appearance': 'Appearance',
    'settings.darkMode': 'Dark Mode',
    'settings.darkModeHelp': 'Switch between light and dark theme',
    'settings.language': 'Language',
    'settings.languageHelp': 'Switch between English and Arabic (with RTL).',
    'settings.notifications': 'Notifications',
    'settings.emailNotif': 'Email Notifications',
    'settings.emailNotifHelp': 'Receive email alerts for important events',
    'settings.auditLog': 'Audit Logging',
    'settings.auditLogHelp': 'Track all system activities',
    'settings.saveAll': 'Save All Settings',
    'settings.savedOk': 'Settings saved successfully!',
    'settings.rolesTitle': 'Role Permissions (Customizable)',
    'settings.rolesHelp': 'Each company can adapt the role matrix to match its own structure. Toggle a permission and click Save.',
    'settings.resetRoles': 'Reset to defaults',
    'settings.translationsTitle': 'Custom Labels (Open / Flexible)',
    'settings.translationsHelp': 'Override any label without touching code. Useful for renaming "Companies" to "Clients", etc.',
    'settings.addOverride': 'Add override',
    'settings.translationKey': 'Translation key',
    'settings.translationValue': 'Custom label',
    'settings.exchangeRates': 'Currency Exchange Rates',
    'settings.exchangeHelp': 'All amounts are stored in your base currency. Exchange rates are updated daily. Current rates relative to USD:',

    // Dashboard
    'dashboard.welcome': 'Welcome back, {name}',
    'dashboard.role': '{role} Dashboard',
    'dashboard.totalCash': 'Total Cash',
    'dashboard.receivables': 'Receivables',
    'dashboard.payables': 'Payables',
    'dashboard.netIncome': 'Net Income',
    'dashboard.totalInvoices': 'Total Invoices',
    'dashboard.paidInvoices': 'Paid Invoices',
    'dashboard.pendingAmount': 'Pending Amount',
    'dashboard.pendingExpenses': 'Pending Expenses',
    'dashboard.quickActions': 'Quick Actions',
    'dashboard.permissions': 'Your Permissions'
  },
  ar: {
    // Common
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.edit': 'تعديل',
    'common.delete': 'حذف',
    'common.add': 'إضافة',
    'common.search': 'بحث',
    'common.loading': 'جارٍ التحميل...',
    'common.confirm_delete': 'هل أنت متأكد من رغبتك في الحذف؟',
    'common.yes': 'نعم',
    'common.no': 'لا',
    'common.close': 'إغلاق',
    'common.actions': 'الإجراءات',
    'common.status': 'الحالة',
    'common.name': 'الاسم',
    'common.email': 'البريد الإلكتروني',
    'common.phone': 'الهاتف',
    'common.address': 'العنوان',
    'common.notes': 'ملاحظات',
    'common.language': 'اللغة',

    // Auth
    'auth.signIn': 'تسجيل الدخول',
    'auth.signOut': 'تسجيل الخروج',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.invalid': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'auth.title': 'نظام إدارة الخدمات اللوجستية',
    'auth.subtitle': 'نظام تخطيط موارد متكامل - لجميع الأدوار',
    'auth.quickLogin': 'تسجيل دخول سريع - انقر للدخول:',

    // Navigation
    'nav.dashboard': 'لوحة التحكم',
    'nav.accountingDashboard': 'لوحة المحاسبة',
    'nav.salesDashboard': 'لوحة المبيعات',
    'nav.operationsDashboard': 'لوحة العمليات',
    'nav.costItems': 'بنود التكلفة',
    'nav.chartOfAccounts': 'دليل الحسابات',
    'nav.invoices': 'الفواتير',
    'nav.payments': 'المدفوعات',
    'nav.expenses': 'المصروفات',
    'nav.journalEntries': 'القيود اليومية',
    'nav.taxConfig': 'إعدادات الضريبة',
    'nav.reports': 'التقارير',
    'nav.vendorsCustomers': 'الموردون والعملاء',
    'nav.companies': 'الشركات والعملاء',
    'nav.opportunities': 'الفرص',
    'nav.quotations': 'عروض الأسعار',
    'nav.salesOrders': 'أوامر البيع',
    'nav.purchaseCosts': 'تكاليف الشراء',
    'nav.auditLogs': 'سجلات التدقيق',
    'nav.settings': 'الإعدادات',
    'nav.manageUsers': 'إدارة المستخدمين',
    'nav.salesTeamTracker': 'متتبع فريق المبيعات',

    // Companies
    'companies.title': 'الشركات وجهات الاتصال',
    'companies.subtitle': 'إدارة العملاء والموردين وجهات الاتصال',
    'companies.addCompany': 'إضافة شركة',
    'companies.addPerson': 'إضافة شخص',
    'companies.editCompany': 'تعديل الشركة',
    'companies.editContact': 'تعديل جهة الاتصال',
    'companies.addContact': 'إضافة جهة اتصال للشركة',
    'companies.addContactShort': '+ إضافة جهة اتصال',
    'companies.noContacts': 'لم تتم إضافة جهات اتصال بعد',
    'companies.contacts': 'جهات الاتصال',
    'companies.totalCustomers': 'إجمالي العملاء',
    'companies.totalVendors': 'إجمالي الموردين',
    'companies.customerAR': 'ذمم العملاء',
    'companies.vendorAP': 'ذمم الموردين',
    'companies.kind.customer': 'عميل',
    'companies.kind.vendor': 'مورد',
    'companies.kind.person': 'شخص',
    'companies.kind.company': 'شركة',
    'companies.recordKind': 'نوع السجل',
    'companies.recordKind.help': 'اختر ما إذا كان هذا السجل لشركة أم لشخص.',
    'companies.companyName': 'اسم الشركة',
    'companies.fullName': 'الاسم الكامل',
    'companies.taxId': 'الرقم الضريبي',
    'companies.website': 'الموقع الإلكتروني',
    'companies.source': 'المصدر',
    'companies.industry': 'القطاع',
    'companies.assignTo': 'إسناد إلى مندوب',
    'companies.unassigned': 'غير مُسند',
    'companies.position': 'المسمى الوظيفي',
    'companies.primary': 'رئيسي',
    'companies.primaryHelp': 'جهة الاتصال الرئيسية',
    'companies.deleteContact': 'حذف جهة الاتصال؟',
    'companies.deleteCompany': 'هل أنت متأكد من حذف هذه الشركة؟',
    'companies.filter.all': 'الكل',
    'companies.filter.customer': 'العملاء',
    'companies.filter.vendor': 'الموردون',
    'companies.filter.person': 'الأشخاص',
    'companies.filter.company': 'الشركات',
    'companies.ownedByYou': 'ملكك',
    'companies.empty.contact': 'لم تقم بإضافة شركات أو أشخاص بعد. انقر "إضافة" لإنشاء أول سجل.',

    // Settings
    'settings.title': 'إعدادات النظام',
    'settings.subtitle': 'تكوين تفضيلات النظام وإعدادات الشركة',
    'settings.companyInfo': 'بيانات الشركة',
    'settings.companyName': 'اسم الشركة',
    'settings.fiscalYear': 'بداية السنة المالية',
    'settings.regional': 'الإعدادات الإقليمية',
    'settings.currency': 'العملة الافتراضية',
    'settings.dateFormat': 'تنسيق التاريخ',
    'settings.timezone': 'المنطقة الزمنية',
    'settings.appearance': 'المظهر',
    'settings.darkMode': 'الوضع الداكن',
    'settings.darkModeHelp': 'التبديل بين الوضع الفاتح والداكن',
    'settings.language': 'اللغة',
    'settings.languageHelp': 'التبديل بين الإنجليزية والعربية (مع دعم اتجاه الكتابة من اليمين لليسار).',
    'settings.notifications': 'الإشعارات',
    'settings.emailNotif': 'إشعارات البريد الإلكتروني',
    'settings.emailNotifHelp': 'استلام تنبيهات البريد للأحداث المهمة',
    'settings.auditLog': 'سجل التدقيق',
    'settings.auditLogHelp': 'تتبّع جميع نشاطات النظام',
    'settings.saveAll': 'حفظ كل الإعدادات',
    'settings.savedOk': 'تم حفظ الإعدادات بنجاح!',
    'settings.rolesTitle': 'صلاحيات الأدوار (قابلة للتخصيص)',
    'settings.rolesHelp': 'يمكن لكل شركة تكييف مصفوفة الأدوار لتناسب هيكلها. فعّل أو ألغِ الصلاحية ثم احفظ.',
    'settings.resetRoles': 'استعادة الإعدادات الافتراضية',
    'settings.translationsTitle': 'تسميات مخصصة (مرنة ومفتوحة)',
    'settings.translationsHelp': 'يمكنك إعادة تسمية أي حقل دون تعديل الشيفرة (مثلاً: تغيير "الشركات" إلى "العملاء").',
    'settings.addOverride': 'إضافة تعديل',
    'settings.translationKey': 'مفتاح الترجمة',
    'settings.translationValue': 'التسمية المخصصة',
    'settings.exchangeRates': 'أسعار صرف العملات',
    'settings.exchangeHelp': 'يتم تخزين جميع المبالغ بالعملة الأساسية. أسعار الصرف بالنسبة للدولار:',

    // Dashboard
    'dashboard.welcome': 'مرحبًا بعودتك، {name}',
    'dashboard.role': 'لوحة {role}',
    'dashboard.totalCash': 'إجمالي النقد',
    'dashboard.receivables': 'الذمم المدينة',
    'dashboard.payables': 'الذمم الدائنة',
    'dashboard.netIncome': 'صافي الدخل',
    'dashboard.totalInvoices': 'إجمالي الفواتير',
    'dashboard.paidInvoices': 'فواتير مسددة',
    'dashboard.pendingAmount': 'المبالغ المعلّقة',
    'dashboard.pendingExpenses': 'مصروفات معلّقة',
    'dashboard.quickActions': 'إجراءات سريعة',
    'dashboard.permissions': 'صلاحياتك'
  }
};

// ────────────────────────────────────────────────────────────────────────
//  Public helpers
// ────────────────────────────────────────────────────────────────────────
export function getLanguage() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE;
}

export function setLanguage(lang) {
  if (!LANGUAGES[lang]) lang = DEFAULT_LANGUAGE;
  localStorage.setItem(STORAGE_KEY, lang);
  applyLanguageToDocument(lang);
  // Notify listeners (LanguageProvider) without a full reload.
  window.dispatchEvent(new CustomEvent('erp:language-changed', { detail: { lang } }));
}

export function applyLanguageToDocument(lang = getLanguage()) {
  const meta = LANGUAGES[lang] || LANGUAGES[DEFAULT_LANGUAGE];
  if (typeof document !== 'undefined') {
    document.documentElement.lang = meta.code;
    document.documentElement.dir  = meta.dir;
  }
}

export function getOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setOverrides(overrides) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides || {}));
  window.dispatchEvent(new CustomEvent('erp:translations-changed'));
}

function format(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

/**
 * Translate a key. Lookup order:
 *  1. Per-company override (localStorage)
 *  2. Active language
 *  3. English fallback
 *  4. The key itself
 */
export function translate(key, params, lang = getLanguage()) {
  const overrides = getOverrides();
  const overrideKey = `${lang}:${key}`;
  const value =
    overrides[overrideKey] ??
    overrides[key] ??
    TRANSLATIONS[lang]?.[key] ??
    TRANSLATIONS[DEFAULT_LANGUAGE][key] ??
    key;
  return format(value, params);
}

// ────────────────────────────────────────────────────────────────────────
//  React hook + provider
// ────────────────────────────────────────────────────────────────────────
const I18nContext = createContext({ lang: DEFAULT_LANGUAGE, t: translate });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLanguage());

  useEffect(() => {
    applyLanguageToDocument(lang);
  }, [lang]);

  useEffect(() => {
    const onChange = (e) => setLangState(e.detail?.lang || getLanguage());
    const onTranslations = () => setLangState((l) => l); // force re-render
    window.addEventListener('erp:language-changed', onChange);
    window.addEventListener('erp:translations-changed', onTranslations);
    return () => {
      window.removeEventListener('erp:language-changed', onChange);
      window.removeEventListener('erp:translations-changed', onTranslations);
    };
  }, []);

  const t = useCallback(
    (key, params) => translate(key, params, lang),
    [lang]
  );

  const value = {
    lang,
    dir: LANGUAGES[lang]?.dir || 'ltr',
    isRTL: (LANGUAGES[lang]?.dir || 'ltr') === 'rtl',
    t,
    setLanguage,
    languages: LANGUAGES
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  return useContext(I18nContext);
}

export default {
  I18nProvider,
  useTranslation,
  translate,
  setLanguage,
  getLanguage,
  applyLanguageToDocument,
  LANGUAGES
};
