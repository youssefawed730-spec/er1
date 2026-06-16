// App.jsx — Updated with i18n + RTL support and language switcher in the header.
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  initializeData, getCurrentUser, logout, hasPermission,
  ROLE_PERMISSIONS, subscribeToEvents, getSystemConfig, fetchSystemConfig,
  updateSystemConfig, formatCurrencyWithRate,
} from './data/store';
import { I18nProvider, useTranslation, applyLanguageToDocument, getLanguage } from './i18n';
import LanguageSwitcher from './components/common/LanguageSwitcher';

// Import components
import Dashboard from './components/Dashboard';
import AccountingDashboard from './components/dashboard/AccountingDashboard';
import SalesDashboard from './components/dashboard/SalesDashboard';
import OperationsDashboard from './components/dashboard/OperationsDashboard';
import ChartOfAccounts from './components/accounting/ChartOfAccounts';
import Invoices from './components/accounting/Invoices';
import Payments from './components/accounting/Payments';
import Expenses from './components/accounting/Expenses';
import JournalEntries from './components/accounting/JournalEntries';
import TaxConfig from './components/accounting/TaxConfig';
import Reports from './components/accounting/Reports';
import Companies from './components/crm/Companies';
import Opportunities from './components/sales/Opportunities';
import Quotations from './components/sales/Quotations';
import SalesOrders from './components/sales/SalesOrders';
import PurchaseCosts from './components/accounting/PurchaseCosts';
import CostItems from './components/operations/CostItems';
import AuditLogs from './components/admin/AuditLogs';
import ManageUsers from './components/admin/ManageUsers';
import Settings from './components/admin/Settings';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import NotificationCenter from './components/common/NotificationCenter';
import GlobalSearch from './components/common/GlobalSearch';
import VendorsCustomers from './components/accounting/VendorsCustomers';
import SalesTeamTracker from './components/sales/SalesTeamTracker';

// Import auto-update currency on startup
import { autoUpdateCurrencyRatesIfNeeded } from './data/store';

// Protected Route component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = getCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (allowedRoles && !allowedRoles.includes(user.role)) {
      navigate('/');
    }
  }, [user, navigate, allowedRoles]);

  if (!user) return null;
  if (allowedRoles && !allowedRoles.includes(user.role)) return null;

  return children;
};

// Navigation items — `name` is now a translation key resolved at render time.
const NAV_ITEMS = {
  dashboard:           { key: 'nav.dashboard',           path: '/',                      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  accountingDashboard: { key: 'nav.accountingDashboard', path: '/dashboard/accounting',   icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z' },
  salesDashboard:      { key: 'nav.salesDashboard',      path: '/dashboard/sales',        icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  operationsDashboard: { key: 'nav.operationsDashboard',  path: '/dashboard/operations',   icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  chartOfAccounts: { key: 'nav.chartOfAccounts', path: '/accounts',        icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  invoices:        { key: 'nav.invoices',        path: '/invoices',        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  payments:        { key: 'nav.payments',        path: '/payments',        icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  expenses:        { key: 'nav.expenses',        path: '/expenses',        icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  journalEntries:  { key: 'nav.journalEntries',  path: '/journal',         icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  taxConfig:       { key: 'nav.taxConfig',       path: '/tax-config',      icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
  reports:         { key: 'nav.reports',         path: '/reports',         icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  vendorsCustomers: { key: 'nav.vendorsCustomers', path: '/vendors-customers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0' },
  companies:       { key: 'nav.companies',       path: '/companies',       icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  opportunities:   { key: 'nav.opportunities',   path: '/opportunities',   icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  quotations:      { key: 'nav.quotations',      path: '/quotations',      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  salesOrders:     { key: 'nav.salesOrders',     path: '/sales-orders',    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  salesTeamTracker: { key: 'nav.salesTeamTracker', path: '/sales-tracker', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
  costItems:       { key: 'nav.costItems',       path: '/cost-items',      icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 7h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z' },
  purchaseCosts:   { key: 'nav.purchaseCosts',   path: '/purchase-costs',  icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  auditLogs:       { key: 'nav.auditLogs',       path: '/audit-logs',      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  manageUsers:     { key: 'nav.manageUsers',     path: '/users',           icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  settings:        { key: 'nav.settings',        path: '/settings',        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' }
};

// Sidebar component with dark mode support and live vendor/customer summary
const Sidebar = ({ user, darkMode }) => {
  const location = useLocation();
  const { t, isRTL } = useTranslation();
  const role = user?.role || 'contact';
  const permissions = ROLE_PERMISSIONS[role]?.permissions || {};
  const roleName = ROLE_PERMISSIONS[role]?.name || role;

  const [vcSummary, setVcSummary] = React.useState({ customerCount: 0, vendorCount: 0, totalAR: 0, totalAP: 0 });
  const [sidebarSearch, setSidebarSearch] = React.useState('');
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [brandConfig, setBrandConfig] = React.useState({ companyName: null, companyLogo: null });

  // Activities panel for sales role
  const [sidebarActivities, setSidebarActivities] = React.useState([]);
  const [activityFilter, setActivityFilter] = React.useState('all'); // all | pending | done
  const isSalesRole = role === 'sales' || role === 'head_of_sales';

  useEffect(() => {
    // Load initial brand config
    const cfg = getSystemConfig();
    setBrandConfig({ companyName: cfg.companyName, companyLogo: cfg.companyLogo });
    const unsub = subscribeToEvents((e) => {
      if (e.type === 'config_changed') {
        setBrandConfig({ companyName: e.data.companyName, companyLogo: e.data.companyLogo });
      }
    });
    return unsub;
  }, [isSalesRole]);

  const getNavigation = () => {
    const nav = [];
    nav.push(NAV_ITEMS.dashboard);

    // Department-specific dashboards
    if (['admin', 'manager', 'head_of_accounting', 'accounting'].includes(role)) {
      nav.push(NAV_ITEMS.accountingDashboard);
    }
    if (['admin', 'manager', 'head_of_sales', 'sales', 'head_of_operation', 'operation'].includes(role)) {
      nav.push(NAV_ITEMS.salesDashboard);
    }
    if (['admin', 'manager', 'head_of_operation', 'operation'].includes(role)) {
      nav.push(NAV_ITEMS.operationsDashboard);
    }

    if (permissions.companies?.length      > 0) nav.push(NAV_ITEMS.vendorsCustomers);
    if (permissions.companies?.length      > 0) nav.push(NAV_ITEMS.companies);
    if (permissions.opportunities?.length  > 0) nav.push(NAV_ITEMS.opportunities);
    if (permissions.quotations?.length     > 0) nav.push(NAV_ITEMS.quotations);
    if (permissions.salesOrders?.length    > 0) nav.push(NAV_ITEMS.salesOrders);
    if (['head_of_sales'].includes(role)) nav.push(NAV_ITEMS.salesTeamTracker);
    if (permissions.invoices?.length       > 0) nav.push(NAV_ITEMS.invoices);
    if (permissions.payments?.length       > 0) nav.push(NAV_ITEMS.payments);
    if (permissions.expenses?.length       > 0) nav.push(NAV_ITEMS.expenses);
    if (permissions.costItems?.length      > 0) nav.push(NAV_ITEMS.costItems);
    if (permissions.purchaseCosts?.length  > 0) nav.push(NAV_ITEMS.purchaseCosts);
    if (permissions.chartOfAccounts?.length> 0) nav.push(NAV_ITEMS.chartOfAccounts);
    if (permissions.journalEntries?.length > 0) nav.push(NAV_ITEMS.journalEntries);
    if (permissions.taxConfig?.length      > 0) nav.push(NAV_ITEMS.taxConfig);
    if (permissions.reports?.length        > 0) nav.push(NAV_ITEMS.reports);
    if (permissions.auditLogs?.length      > 0) nav.push(NAV_ITEMS.auditLogs);
    if (permissions.users?.length          > 0) nav.push(NAV_ITEMS.manageUsers);
    if (permissions.settings?.length > 0 || role === 'contact') nav.push(NAV_ITEMS.settings);
    return nav;
  };

  const allNav = getNavigation();

  // Filter navigation by sidebar search
  const navigation = sidebarSearch.trim()
    ? allNav.filter(item => t(item.key).toLowerCase().includes(sidebarSearch.toLowerCase()))
    : allNav;

  const canSeeVC = permissions.companies?.length > 0;

  return (
    <aside className={`${darkMode ? 'bg-gray-900' : 'bg-gray-900'} text-white w-64 min-h-screen p-4 flex flex-col`}>
      <div className="flex items-center mb-4 px-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 ${isRTL ? 'ml-3' : 'mr-3'} ${brandConfig.companyLogo ? 'bg-white border border-gray-700' : 'bg-gradient-to-br from-blue-500 to-purple-600'}`}>
          {brandConfig.companyLogo ? (
            <img src={brandConfig.companyLogo} alt="Logo" className="w-full h-full object-contain p-0.5" />
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          )}
        </div>
        <div>
          <h1 className="text-lg font-bold">{brandConfig.companyName || t('auth.title')}</h1>
          <p className="text-xs text-gray-400">{roleName}</p>
        </div>
      </div>

      {/* Sidebar Search */}
      <div className="relative mb-3">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={sidebarSearch}
          onChange={e => setSidebarSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search menu…"
          className="w-full pl-9 pr-3 py-2 text-sm bg-gray-800 text-gray-200 placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
        />
        {sidebarSearch && (
          <button onClick={() => setSidebarSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Vendor / Customer live summary cards */}
      {canSeeVC && !sidebarSearch && (
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          <SidebarStatCard
            path="/vendors-customers?tab=customer"
            label="Customers"
            count={vcSummary.customerCount}
            amount={formatCurrencyWithRate(vcSummary.totalAR)}
            amountLabel="AR"
            color="blue"
            active={location.pathname === '/vendors-customers'}
          />
          <SidebarStatCard
            path="/vendors-customers?tab=vendor"
            label="Vendors"
            count={vcSummary.vendorCount}
            amount={formatCurrencyWithRate(vcSummary.totalAP)}
            amountLabel="AP"
            color="purple"
            active={location.pathname === '/vendors-customers'}
          />
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {navigation.length === 0 && (
          <p className="text-xs text-gray-500 px-3 py-2">No menu items match</p>
        )}
        {navigation.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${ 
              location.pathname === item.path
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <svg className={`w-5 h-5 ${isRTL ? 'ml-3' : 'mr-3'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {t(item.key)}
          </Link>
        ))}
      </nav>

      {/* ── Activities Panel (sales role only) ── */}
      {isSalesRole && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Activities
            </span>
            <div className="flex gap-0.5">
              {['all','pending','done'].map(f => (
                <button
                  key={f}
                  onClick={() => setActivityFilter(f)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors capitalize ${
                    activityFilter === f
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
            {(() => {
              const filtered = sidebarActivities.filter(a =>
                activityFilter === 'all' ? true :
                activityFilter === 'done' ? a.done :
                !a.done
              );
              if (filtered.length === 0) {
                return (
                  <p className="text-xs text-gray-500 italic px-1 py-2">
                    {activityFilter === 'all' ? 'No activities yet.' : `No ${activityFilter} activities.`}
                  </p>
                );
              }
              const typeIcon = {
                call: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
                meeting: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0',
                email: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                task: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
              };
              return filtered.map(act => (
                <div
                  key={act.id}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    act.done
                      ? 'bg-gray-800/40 opacity-60'
                      : 'bg-orange-900/20 hover:bg-orange-900/30'
                  }`}
                >
                  <svg className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${act.done ? 'text-green-400' : 'text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={act.done ? 'M5 13l4 4L19 7' : (typeIcon[act.type] || typeIcon.task)} />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate leading-tight ${act.done ? 'line-through text-gray-400' : 'text-gray-200'}`}>
                      {act.title || act.type}
                    </p>
                    {act.dueDate && (
                      <p className={`text-[10px] mt-0.5 ${
                        !act.done && new Date(act.dueDate) < new Date()
                          ? 'text-red-400'
                          : 'text-gray-500'
                      }`}>
                        {new Date(act.dueDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] px-1 py-0.5 rounded capitalize flex-shrink-0 ${
                    act.done ? 'bg-green-800/40 text-green-400' : 'bg-orange-800/40 text-orange-400'
                  }`}>
                    {act.type}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* Summary counts */}
          <div className="flex justify-between mt-2 px-1 text-[10px] text-gray-500">
            <span>{sidebarActivities.filter(a => !a.done).length} pending</span>
            <span>{sidebarActivities.filter(a => a.done).length} done</span>
            <span>{sidebarActivities.length} total</span>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="px-3 py-2 text-xs text-gray-400">
          <p>Logged in as</p>
          <p className="text-white font-medium truncate">{user?.name}</p>
        </div>
      </div>
    </aside>
  );
};

// Small stat card used inside the sidebar
const SidebarStatCard = ({ path, label, count, amount, amountLabel, color, active }) => {
  const colors = {
    blue:   { bg: 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-700/40', badge: 'bg-blue-500', text: 'text-blue-300' },
    purple: { bg: 'bg-purple-600/20 hover:bg-purple-600/30 border-purple-700/40', badge: 'bg-purple-500', text: 'text-purple-300' },
  };
  const c = colors[color];
  return (
    <Link to={path} className={`rounded-lg border p-2 block transition-colors ${c.bg} ${active ? 'ring-1 ring-blue-500' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-300 font-medium">{label}</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full text-white ${c.badge}`}>{count}</span>
      </div>
      <p className={`text-xs font-semibold ${c.text}`}>{amount}</p>
      <p className="text-xs text-gray-500">{amountLabel} due</p>
    </Link>
  );
};

// Header component with notification center, language switcher, dark-mode toggle, logout.
const Header = ({ darkMode, onToggleDarkMode }) => {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const user = getCurrentUser();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm border-b`}>
      <div className="flex justify-between items-center px-6 py-4">
        <div>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            {new Date().toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          {/* Global Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              darkMode
                ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
            title="Search (Ctrl+K)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden md:inline">Search</span>
            <kbd className={`hidden md:inline text-xs border rounded px-1 ${darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-400'}`}>⌘K</kbd>
          </button>

          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
          <LanguageSwitcher compact />

          {/* Dark Mode Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('settings.darkMode')}
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <NotificationCenter />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block text-right rtl:text-left">
              <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user?.name}</p>
              <p className="text-xs text-gray-500">{ROLE_PERMISSIONS[user?.role]?.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t('auth.signOut')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

// Main Layout
const Layout = ({ children }) => {
  const user = getCurrentUser();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const config = getSystemConfig();
    setDarkMode(config.darkMode);
    if (config.darkMode) document.documentElement.classList.add('dark');
  }, []);

  const handleToggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (newDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    updateSystemConfig({ darkMode: newDarkMode });
  };

  if (!user) return null;

  return (
    <div className={`flex min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <Sidebar user={user} darkMode={darkMode} />
      <div className="flex-1 flex flex-col">
        <Header darkMode={darkMode} onToggleDarkMode={handleToggleDarkMode} />
        <main className={`flex-1 p-6 overflow-auto ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
          {children}
        </main>
      </div>
    </div>
  );
};


// 404 Page
const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 mb-2">Page Not Found</h2>
        <p className="text-gray-500 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm mb-4">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// App Routes
const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ForgotPassword />} />
      <Route path="/"               element={<ProtectedRoute allowedRoles={Object.keys(ROLE_PERMISSIONS)}><Layout><Dashboard /></Layout></ProtectedRoute>} />

      {/* Department Dashboards */}
      <Route path="/dashboard/accounting"  element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting']}><Layout><AccountingDashboard /></Layout></ProtectedRoute>} />
      <Route path="/dashboard/sales"       element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_sales', 'sales', 'head_of_operation', 'operation']}><Layout><SalesDashboard /></Layout></ProtectedRoute>} />
      <Route path="/dashboard/operations"  element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_operation', 'operation']}><Layout><OperationsDashboard /></Layout></ProtectedRoute>} />

      {/* Standard Routes */}
      <Route path="/accounts"       element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting']}><Layout><ChartOfAccounts /></Layout></ProtectedRoute>} />
      <Route path="/invoices"       element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting', 'operation']}><Layout><Invoices /></Layout></ProtectedRoute>} />
      <Route path="/payments"       element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting']}><Layout><Payments /></Layout></ProtectedRoute>} />
      <Route path="/expenses"       element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting', 'operation']}><Layout><Expenses /></Layout></ProtectedRoute>} />
      <Route path="/journal"        element={<ProtectedRoute allowedRoles={['admin', 'head_of_accounting', 'accounting']}><Layout><JournalEntries /></Layout></ProtectedRoute>} />
      <Route path="/tax-config"     element={<ProtectedRoute allowedRoles={['admin', 'head_of_accounting', 'accounting']}><Layout><TaxConfig /></Layout></ProtectedRoute>} />
      <Route path="/reports"        element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'head_of_sales']}><Layout><Reports /></Layout></ProtectedRoute>} />
      <Route path="/companies"      element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting', 'head_of_sales', 'sales', 'operation', 'contact']}><Layout><Companies /></Layout></ProtectedRoute>} />
      <Route path="/vendors-customers" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_accounting', 'accounting', 'head_of_sales', 'head_of_operation', 'sales', 'operation']}><Layout><VendorsCustomers /></Layout></ProtectedRoute>} />
      <Route path="/opportunities"  element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_sales', 'head_of_operation', 'sales', 'operation']}><Layout><Opportunities /></Layout></ProtectedRoute>} />
      <Route path="/quotations"     element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_sales', 'head_of_operation', 'sales', 'operation', 'head_of_accounting', 'accounting']}><Layout><Quotations /></Layout></ProtectedRoute>} />
      <Route path="/sales-orders"   element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_sales', 'head_of_operation', 'sales', 'operation', 'head_of_accounting', 'accounting']}><Layout><SalesOrders /></Layout></ProtectedRoute>} />
      <Route path="/sales-tracker"  element={<ProtectedRoute allowedRoles={['admin', 'manager', 'head_of_sales']}><Layout><SalesTeamTracker /></Layout></ProtectedRoute>} />
      <Route path="/cost-items"      element={<ProtectedRoute allowedRoles={['admin', 'manager', 'operation', 'head_of_operation', 'head_of_accounting', 'accounting']}><Layout><CostItems /></Layout></ProtectedRoute>} />
      <Route path="/purchase-costs" element={<ProtectedRoute allowedRoles={['admin', 'head_of_accounting', 'accounting']}><Layout><PurchaseCosts /></Layout></ProtectedRoute>} />
      <Route path="/audit-logs"     element={<ProtectedRoute allowedRoles={['admin']}><Layout><AuditLogs /></Layout></ProtectedRoute>} />
      <Route path="/users"           element={<ProtectedRoute allowedRoles={['admin']}><Layout><ManageUsers /></Layout></ProtectedRoute>} />
      <Route path="/settings"       element={<ProtectedRoute allowedRoles={['admin', 'contact']}><Layout><Settings /></Layout></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

// Main App Component
export default function App() {
  const [appReady, setAppReady] = React.useState(false);

  useEffect(() => {
    // initializeData is now async — checks /api/auth/me to restore session
    initializeData().then(() => {
      setAppReady(true);
      autoUpdateCurrencyRatesIfNeeded();
      fetchSystemConfig().then(config => {
        applyLanguageToDocument(config.language || getLanguage());
      });
    });

    // Handle server-signalled session expiry (refresh token rotated out)
    const unsub = subscribeToEvents((e) => {
      if (e.type === 'session_expired') {
        // Avoid redirect loops: do nothing if we're already on a public auth page
        const publicPaths = ['/login', '/forgot-password', '/reset-password'];
        if (!publicPaths.includes(window.location.pathname)) {
          window.location.href = '/login';
        }
      }
    });
    return unsub;
  }, []);

  if (!appReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <I18nProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </I18nProvider>
  );
}
