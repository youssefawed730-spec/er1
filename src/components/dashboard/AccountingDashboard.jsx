import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  getInvoices, getPayments, getExpenses, getReportsData,
  getCurrentUser, ROLE_PERMISSIONS, subscribeToEvents, getUsers
} from '../../data/store';
import { useTranslation } from '../../i18n';

const printReport = (reportId, title) => {
  const printContent = document.getElementById(reportId);
  if (!printContent) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: bold; }
          .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
          .print-btn { display: none; }
          @media print { .print-btn { display: none; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
};

export default function AccountingDashboard() {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const role = user?.role || 'accounting';
  const roleName = ROLE_PERMISSIONS[role]?.name || 'Accountant';

  const [reports, setReports] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [users, setUsers] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const loadData = () => {
    getReportsData().then(setReports).catch(() => {});
    getInvoices().then(setInvoices).catch(() => {});
    getPayments().then(setPayments).catch(() => {});
    getExpenses().then(setExpenses).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = ['invoice_updated', 'invoice_confirmed', 'payment_saved', 'payment_deleted', 'expense_approved', 'expense_saved'];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const userById = (id) => users.find(u => u.id === id)?.name || 'Unknown';
  const fmt = (n) => `$${Number(n || 0).toLocaleString()}`;

  // Filter by date range
  const filterByDate = (items, dateField) => {
    if (!dateRange.start && !dateRange.end) return items;
    return items.filter(item => {
      const date = new Date(item[dateField]);
      if (dateRange.start && date < new Date(dateRange.start)) return false;
      if (dateRange.end && date > new Date(dateRange.end)) return false;
      return true;
    });
  };

  const filteredInvoices = filterByDate(invoices, 'date');
  const filteredPayments = filterByDate(payments, 'date');
  const filteredExpenses = filterByDate(expenses, 'date');

  // Calculate summary stats
  const totalRevenue = filteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);
  const totalReceivables = filteredInvoices.filter(i => ['sent', 'partial'].includes(i.status)).reduce((s, i) => s + Number(i.total || 0), 0);
  const totalPayables = filteredPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalExpenses = filteredExpenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount || 0), 0);
  const netIncome = totalRevenue - totalExpenses;

  const recentInvoices = [...filteredInvoices].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const recentPayments = [...filteredPayments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  const pendingExpenses = filteredExpenses.filter(e => e.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Print Report ID - Hidden */}
      <div id="accounting-report" className="print-report" style={{ display: 'none' }}>
        <h1>Accounting Department Report</h1>
        <p className="text-gray-500">Generated on: {new Date().toLocaleDateString()}</p>
        {dateRange.start && <p className="text-gray-500">Period: {dateRange.start} to {dateRange.end || 'Now'}</p>}

        <h2>Financial Summary</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{fmt(totalRevenue)}</div>
            <div className="stat-label">Total Revenue</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalReceivables)}</div>
            <div className="stat-label">Receivables</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalPayables)}</div>
            <div className="stat-label">Payables</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: netIncome >= 0 ? '#059669' : '#dc2626' }}>{fmt(netIncome)}</div>
            <div className="stat-label">Net Income</div>
          </div>
        </div>

        <h2>Recent Invoices</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentInvoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.number}</td>
                <td>{inv.customerName || inv.companyName || '—'}</td>
                <td>{fmt(inv.total)}</td>
                <td>{inv.status}</td>
                <td>{new Date(inv.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Recent Payments</h2>
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentPayments.map(pay => (
              <tr key={pay.id}>
                <td>{pay.invoiceNumber || pay.reference}</td>
                <td>{fmt(pay.amount)}</td>
                <td>{pay.method}</td>
                <td>{new Date(pay.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.welcome', { name: user?.name || '' })} - Accounting
          </h1>
          <p className="text-gray-500">{roleName} Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">{roleName}</span>
          <button
            onClick={() => printReport('accounting-report', 'Accounting Department Report')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
        <span className="text-sm font-medium text-gray-700">Filter by Date:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(dateRange.start || dateRange.end) && (
          <button
            onClick={() => setDateRange({ start: '', end: '' })}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Filter
          </button>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">{fmt(totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <Link to="/invoices" className="text-xs text-blue-500 hover:underline mt-2 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Receivables</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(totalReceivables)}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <Link to="/invoices" className="text-xs text-blue-500 hover:underline mt-2 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Payables</p>
              <p className="text-2xl font-bold text-orange-600">{fmt(totalPayables)}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <Link to="/payments" className="text-xs text-blue-500 hover:underline mt-2 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Net Income</p>
              <p className="text-2xl font-bold" style={{ color: netIncome >= 0 ? '#059669' : '#dc2626' }}>{fmt(netIncome)}</p>
            </div>
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <svg className={`w-6 h-6 ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <Link to="/reports" className="text-xs text-blue-500 hover:underline mt-2 block">View Reports →</Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Invoice Summary</h3>
            <Link to="/invoices" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Invoices</span>
              <span className="font-semibold">{filteredInvoices.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Paid</span>
              <span className="font-semibold text-green-600">{filteredInvoices.filter(i => i.status === 'paid').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending</span>
              <span className="font-semibold text-yellow-600">{filteredInvoices.filter(i => i.status === 'sent').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Overdue</span>
              <span className="font-semibold text-red-600">{filteredInvoices.filter(i => i.status === 'partial').length}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Expense Summary</h3>
            <Link to="/expenses" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Expenses</span>
              <span className="font-semibold">{filteredExpenses.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Approved</span>
              <span className="font-semibold text-green-600">{filteredExpenses.filter(e => e.status === 'approved').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending Approval</span>
              <span className="font-semibold text-yellow-600">{pendingExpenses.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Amount</span>
              <span className="font-semibold">{fmt(totalExpenses)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Payment Summary</h3>
            <Link to="/payments" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Payments</span>
              <span className="font-semibold">{filteredPayments.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Cash Payments</span>
              <span className="font-semibold">{filteredPayments.filter(p => p.method === 'cash').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Bank Transfers</span>
              <span className="font-semibold">{filteredPayments.filter(p => p.method === 'bank_transfer').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Amount</span>
              <span className="font-semibold">{fmt(totalPayables)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Invoices</h3>
            <Link to="/invoices" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                  <th className="pb-3 text-left">Number</th>
                  <th className="pb-3 text-left">Customer</th>
                  <th className="pb-3 text-left">Amount</th>
                  <th className="pb-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentInvoices.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{inv.number}</td>
                    <td className="py-3">{inv.customerName || inv.companyName || '—'}</td>
                    <td className="py-3 font-medium">{fmt(inv.total)}</td>
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
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Payments</h3>
            <Link to="/payments" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                  <th className="pb-3 text-left">Reference</th>
                  <th className="pb-3 text-left">Amount</th>
                  <th className="pb-3 text-left">Method</th>
                  <th className="pb-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentPayments.slice(0, 5).map((pay) => (
                  <tr key={pay.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{pay.invoiceNumber || pay.reference}</td>
                    <td className="py-3 font-medium">{fmt(pay.amount)}</td>
                    <td className="py-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">{pay.method}</span>
                    </td>
                    <td className="py-3">{new Date(pay.date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pending Expenses for Approval */}
      {pendingExpenses.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Pending Expense Approvals</h3>
            <Link to="/expenses" className="text-sm text-blue-600 hover:text-blue-800">View All →</Link>
          </div>
          <div className="space-y-3">
            {pendingExpenses.slice(0, 5).map((exp) => (
              <div key={exp.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{exp.description}</p>
                  <p className="text-sm text-gray-500">{exp.category} — {userById(exp.createdBy)}</p>
                </div>
                <p className="font-bold text-gray-900">{fmt(exp.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/invoices" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">New Invoice</span>
          </Link>
          <Link to="/payments" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm font-medium">Record Payment</span>
          </Link>
          <Link to="/expenses" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-medium">Add Expense</span>
          </Link>
          <Link to="/journal" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm font-medium">Journal Entry</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
