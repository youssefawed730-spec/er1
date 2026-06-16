import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getReportsData, getInvoices, getPayments, getExpenses,
  getCompanies, getUsers, getOpportunities, getQuotations,
  getCurrentUser, ROLE_PERMISSIONS, hasPermission, getActivities,
  subscribeToEvents
} from '../data/store';
import { useTranslation } from '../i18n';

export default function Dashboard() {
  const { t } = useTranslation();
  const user      = getCurrentUser();
  const [reports,          setReports]          = useState({});
  const [invoices,         setInvoices]         = useState([]);
  const [expenses,         setExpenses]         = useState([]);
  const [companies,        setCompanies]        = useState([]);
  const [users,            setUsers]            = useState([]);
  const [salesActivities,  setSalesActivities]  = useState([]);
  const [allOpps,          setAllOpps]          = useState([]);
  const [allQuotes,        setAllQuotes]        = useState([]);

  const loadData = () => {
    getReportsData().then(setReports).catch(() => {});
    getInvoices().then(setInvoices).catch(() => {});
    getExpenses().then(setExpenses).catch(() => {});
    getCompanies().then(setCompanies).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
    getActivities().then(acts => setSalesActivities(Array.isArray(acts) ? acts : [])).catch(() => {});
    getOpportunities().then(opps => setAllOpps(Array.isArray(opps) ? opps : [])).catch(() => {});
    getQuotations().then(quotes => setAllQuotes(Array.isArray(quotes) ? quotes : [])).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = [
        'invoice_updated', 'invoice_confirmed', 'payment_saved', 'payment_deleted',
        'expense_approved', 'expense_saved', 'company_created', 'company_updated',
        'salesOrder_confirmed', 'purchaseCost_confirmed',
      ];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);
  const role      = user?.role || 'contact';
  const roleName  = ROLE_PERMISSIONS[role]?.name || role;
  const isSales   = role === 'sales';

  const recentInvoices = invoices.slice(-5).reverse();
  const recentExpenses = expenses.slice(-5).reverse();
  const customers      = companies.filter(c => c.type === 'customer' || !c.type);
  const userById       = (id) => users.find(u => u.id === id)?.name || id || 'Unknown';

  const canViewFinancials  = hasPermission(role, 'chartOfAccounts', 'read') || hasPermission(role, 'invoices', 'read');
  const canApprove         = hasPermission(role, 'expenses', 'approve');
  const canManageContacts  = hasPermission(role, 'contacts', 'write') || hasPermission(role, 'companies', 'read');
  const isHeadOfSales      = role === 'head_of_sales';

  // ── Sales role: Activities panel ──────────────────────────────────────
  const [activityFilter, setActivityFilter] = useState('all'); // all | call | email | meeting | task | done | pending
  const mySalesActivities = isSales
    ? salesActivities.filter(a => a.createdBy === user?.id || a.refId)
    : [];
  const filteredSalesActivities = mySalesActivities.filter(a => {
    if (activityFilter === 'done') return a.done === true;
    if (activityFilter === 'pending') return !a.done;
    if (['call', 'email', 'meeting', 'task'].includes(activityFilter)) return a.type === activityFilter;
    return true;
  });

  // ── Head of Sales: build per-salesman summary ──────────────────────────
  let salesmanSummary = [];
  if (isHeadOfSales) {
    const salesmen   = users.filter(u => u.role === 'sales');
    const allCompanies = companies;

    salesmanSummary = salesmen.map(sm => {
      const smOpps   = allOpps.filter(o => o.assignedTo === sm.id);
      const smQuotes = allQuotes.filter(q => q.assignedTo === sm.id);
      const smCust   = allCompanies.filter(c => c.assignedTo === sm.id);

      const pipeline       = smOpps.reduce((s, o) => s + (o.value || 0), 0);
      const weighted       = smOpps.reduce((s, o) => s + ((o.value || 0) * (o.probability || 0) / 100), 0);
      const won            = smOpps.filter(o => o.stage === 'closed_won').reduce((s, o) => s + (o.value || 0), 0);
      const lost           = smOpps.filter(o => o.stage === 'closed_lost').length;
      const openOpps       = smOpps.filter(o => !['closed_won','closed_lost'].includes(o.stage)).length;
      const quotesApproved = smQuotes.filter(q => q.status === 'approved').length;

      return {
        id: sm.id, name: sm.name, email: sm.email,
        customers: smCust.length, opportunities: smOpps.length,
        openOpps, won, weighted, pipeline, lost,
        quotes: smQuotes.length, quotesApproved
      };
    });
  }

  const StatCard = ({ title, value, icon, color, link }) => (
    <Link to={link || '#'} className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${link ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
    </Link>
  );

  const fmt = (n) => `$${Number(n).toLocaleString()}`;

  const activityTypeIcon = (type) => {
    if (type === 'call') return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
    if (type === 'email') return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
    if (type === 'meeting') return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>;
    return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.welcome', { name: user?.name || '' })}
          </h1>
          <p className="text-gray-500">{t('dashboard.role', { role: roleName })}</p>
        </div>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">{roleName}</span>
      </div>

      {/* ── SALES role: Quick Stats + Activities ── */}
      {isSales && (() => {
        const myOpps = allOpps.filter(o => o.assignedTo === user?.id);
        const myQuotes = allQuotes.filter(q => q.assignedTo === user?.id);
        const myCustomers = companies.filter(c => c.assignedTo === user?.id);
        return (
          <div className="space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">My Opportunities</p>
                <p className="text-2xl font-bold text-blue-600">{myOpps.length}</p>
                <Link to="/opportunities" className="text-xs text-blue-500 hover:underline mt-1 block">View all →</Link>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">My Quotations</p>
                <p className="text-2xl font-bold text-indigo-600">{myQuotes.length}</p>
                <Link to="/quotations" className="text-xs text-indigo-500 hover:underline mt-1 block">View all →</Link>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">My Customers</p>
                <p className="text-2xl font-bold text-emerald-600">{myCustomers.length}</p>
                <Link to="/companies" className="text-xs text-emerald-500 hover:underline mt-1 block">View all →</Link>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500">Total Activities</p>
                <p className="text-2xl font-bold text-orange-600">{mySalesActivities.length}</p>
                <p className="text-xs text-orange-400 mt-1">{mySalesActivities.filter(a => !a.done).length} pending</p>
              </div>
            </div>

            {/* Activities panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  My Activities
                </h3>
                <Link to="/opportunities" className="text-sm text-blue-600 hover:text-blue-800 font-medium">Manage →</Link>
              </div>
              {/* Activity type filters */}
              <div className="flex flex-wrap gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100">
                {['all', 'call', 'email', 'meeting', 'task', 'pending', 'done'].map(f => (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                      activityFilter === f
                        ? f === 'done' ? 'bg-green-600 text-white'
                          : f === 'pending' ? 'bg-yellow-500 text-white'
                          : 'bg-orange-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {f === 'all' ? `All (${mySalesActivities.length})` : f === 'done' ? `Done (${mySalesActivities.filter(a => a.done).length})` : f === 'pending' ? `Pending (${mySalesActivities.filter(a => !a.done).length})` : f}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {filteredSalesActivities.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">No activities found.</div>
                ) : filteredSalesActivities.slice(0, 20).map(act => (
                  <div key={act.id} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      act.type === 'call' ? 'bg-blue-100 text-blue-600' :
                      act.type === 'email' ? 'bg-purple-100 text-purple-600' :
                      act.type === 'meeting' ? 'bg-indigo-100 text-indigo-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      {activityTypeIcon(act.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${act.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{act.title}</p>
                      {act.notes && <p className="text-xs text-gray-500 truncate mt-0.5">{act.notes}</p>}
                      {act.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due: {new Date(act.dueDate).toLocaleDateString()}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {act.done ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Done</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">Pending</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Head of Sales: salesman performance grid ── */}
      {isHeadOfSales && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-800">Salesman Performance</h2>
          {salesmanSummary.length === 0 ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-sm text-gray-400 text-center">
              No salesmen found. Add users with the Sales Representative role to see summaries here.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {salesmanSummary.map(sm => (
                <div key={sm.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                      {sm.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{sm.name}</p>
                      <p className="text-blue-100 text-xs">{sm.email}</p>
                    </div>
                  </div>
                  {/* Stats grid */}
                  <div className="grid grid-cols-3 divide-x divide-gray-100">
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900">{sm.customers}</p>
                      <p className="text-xs text-gray-500 mt-1">Customers</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-blue-600">{sm.opportunities}</p>
                      <p className="text-xs text-gray-500 mt-1">Opportunities</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-purple-600">{sm.quotes}</p>
                      <p className="text-xs text-gray-500 mt-1">Quotations</p>
                    </div>
                  </div>
                  {/* Financial rows */}
                  <div className="px-6 py-4 space-y-2 border-t border-gray-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Pipeline</span>
                      <span className="font-semibold text-gray-900">{fmt(sm.pipeline)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Weighted Pipeline</span>
                      <span className="font-semibold text-blue-600">{fmt(sm.weighted)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Won Value</span>
                      <span className="font-semibold text-green-600">{fmt(sm.won)}</span>
                    </div>
                  </div>
                  {/* Status badges */}
                  <div className="px-6 pb-4 flex flex-wrap gap-2">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{sm.openOpps} Open</span>
                    <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">{sm.quotesApproved} Approved Quotes</span>
                    {sm.lost > 0 && <span className="px-2 py-1 bg-red-50 text-red-600 text-xs rounded-full">{sm.lost} Lost</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {canViewFinancials && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title={t('dashboard.totalCash')} value={fmt(reports.totalCash)} color="bg-green-500" link="/accounts"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard title={t('dashboard.receivables')} value={fmt(reports.totalReceivables)} color="bg-blue-500" link="/invoices"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            />
            <StatCard title={t('dashboard.payables')} value={fmt(reports.totalPayables)} color="bg-orange-500" link="/payments"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            />
            <StatCard title={t('dashboard.netIncome')} value={fmt(reports.netIncome)} color={reports.netIncome >= 0 ? 'bg-emerald-500' : 'bg-red-500'} link="/reports"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title={t('dashboard.totalInvoices')} value={reports.totalInvoicesCount} color="bg-indigo-500" link="/invoices"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
            />
            <StatCard title={t('dashboard.paidInvoices')} value={reports.paidInvoicesCount} color="bg-green-600" link="/invoices"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard title={t('dashboard.pendingAmount')} value={fmt(reports.totalPendingAmount)} color="bg-yellow-500" link="/invoices"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard title={t('dashboard.pendingExpenses')} value={reports.pendingExpensesCount} color="bg-red-400" link="/expenses"
              icon={<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Sales role specific quick actions */}
          {isSales && (
            <>
              <Link to="/opportunities" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-medium">New Opportunity</span>
              </Link>
              <Link to="/quotations" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium">New Quotation</span>
              </Link>
              <Link to="/companies" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-medium">New Contact</span>
              </Link>
              <Link to="/opportunities" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
                <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium">My Activities</span>
              </Link>
            </>
          )}
          {/* Non-sales quick actions */}
          {!isSales && hasPermission(role, 'companies', 'write') && (
            <Link to="/companies" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-sm">{t('companies.addCompany')}</span>
            </Link>
          )}
          {!isSales && hasPermission(role, 'invoices', 'write') && (
            <Link to="/invoices" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm">{t('nav.invoices')}</span>
            </Link>
          )}
          {!isSales && hasPermission(role, 'expenses', 'write') && (
            <Link to="/expenses" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm">{t('nav.expenses')}</span>
            </Link>
          )}
          {!isSales && hasPermission(role, 'opportunities', 'write') && (
            <Link to="/opportunities" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm">{t('nav.opportunities')}</span>
            </Link>
          )}
          {!isSales && hasPermission(role, 'payments', 'write') && (
            <Link to="/payments" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-sm">{t('nav.payments')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {canViewFinancials && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('nav.invoices')}</h3>
              <Link to="/invoices" className="text-sm text-blue-600 hover:text-blue-800 font-medium">→</Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="pb-3 text-left">#</th>
                  <th className="pb-3 text-left">{t('common.name')}</th>
                  <th className="pb-3 text-left">$</th>
                  <th className="pb-3 text-left">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-3 font-medium">{inv.number}</td>
                    <td className="py-3">{inv.customerName || inv.companyName || '—'}</td>
                    <td className="py-3 font-medium">${(Number(inv.total) || 0).toLocaleString()}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                        inv.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        inv.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                        inv.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('nav.expenses')}</h3>
            <Link to="/expenses" className="text-sm text-blue-600 hover:text-blue-800 font-medium">→</Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="pb-3 text-left">{t('common.notes')}</th>
                <th className="pb-3 text-left">—</th>
                <th className="pb-3 text-left">$</th>
                <th className="pb-3 text-left">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {recentExpenses.map((exp) => (
                <tr key={exp.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-3">{exp.description}</td>
                  <td className="py-3"><span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{exp.category}</span></td>
                  <td className="py-3 font-medium">${(Number(exp.amount) || 0).toLocaleString()}</td>
                  <td className="py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      exp.status === 'approved' ? 'bg-green-100 text-green-700' :
                      exp.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{exp.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManageContacts && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('companies.totalCustomers')}</h3>
              <Link to="/companies" className="text-sm text-blue-600 hover:text-blue-800 font-medium">→</Link>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="pb-3 text-left">{t('common.name')}</th>
                  <th className="pb-3 text-left">{t('common.email')}</th>
                  <th className="pb-3 text-left">{t('common.phone')}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {customers.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-sm text-gray-400">—</td></tr>
                ) : customers.slice(0, 5).map((contact) => (
                  <tr key={contact.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-3 font-medium">{contact.name}</td>
                    <td className="py-3">{contact.email || '—'}</td>
                    <td className="py-3">{contact.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canApprove && reports.pendingExpensesCount > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.pendingExpenses')}</h3>
              <Link to="/expenses" className="text-sm text-blue-600 hover:text-blue-800 font-medium">→</Link>
            </div>
            <div className="space-y-3">
              {expenses.filter(e => e.status === 'pending').slice(0, 5).map((exp) => (
                <div key={exp.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{exp.description}</p>
                    <p className="text-sm text-gray-500">{exp.category} — {userById(exp.createdBy)}</p>
                  </div>
                  <p className="font-bold text-gray-900">${(Number(exp.amount) || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Permissions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('dashboard.permissions')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(ROLE_PERMISSIONS[role]?.permissions || {}).map(([module, actions]) => (
            actions.length > 0 && (
              <div key={module} className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-700 text-sm capitalize">{module.replace(/([A-Z])/g, ' $1').trim()}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {actions.map(action => (
                    <span key={action} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{action}</span>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
