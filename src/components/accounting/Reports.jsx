import React, { useState, useEffect } from 'react';
import { getInvoices, getPayments, getExpenses, getJournalEntries, getAccounts, CURRENCIES, convertCurrency, exportToCSV } from '../../data/store';

export default function Reports() {
  const [selectedReport, setSelectedReport] = useState('overview');
  const [selectedCurrency, setSelectedCurrency] = useState('all');
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getInvoices(),
      getPayments(),
      getExpenses(),
      getJournalEntries(),
      getAccounts(),
    ]).then(([inv, pay, exp, je, acc]) => {
      setInvoices(inv);
      setPayments(pay);
      setExpenses(exp);
      setJournalEntries(je);
      setAccounts(acc);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const formatCurrency = (amount, currency = 'USD') => {
    const currencyInfo = CURRENCIES[currency] || CURRENCIES.USD;
    return `${currencyInfo.symbol}${Number(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // Currency breakdown for invoices
  const currencyBreakdown = Object.keys(CURRENCIES).reduce((acc, code) => {
    const currencyInvoices = invoices.filter(inv => (inv.currency || 'USD') === code && (inv.status === 'paid' || inv.status === 'confirmed'));
    acc[code] = {
      count: currencyInvoices.length,
      total: currencyInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0),
      totalUSD: currencyInvoices.reduce((sum, inv) => sum + Number(inv.totalUSD || convertCurrency(inv.total, inv.currency, 'USD')), 0)
    };
    return acc;
  }, {});

  // Account balances by type
  const assets = accounts.filter(a => a.type === 'asset');
  const liabilities = accounts.filter(a => a.type === 'liability');
  const equities = accounts.filter(a => a.type === 'equity');
  const revenues = accounts.filter(a => a.type === 'revenue');
  const expensesList = accounts.filter(a => a.type === 'expense');

  const totalAssets = assets.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + Math.abs(a.balance || 0), 0);
  const totalEquity = equities.reduce((sum, a) => sum + (a.balance || 0), 0);

  // Reports summary derived from loaded data
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.totalUSD || i.total || 0), 0);
  const totalExpensesAmt = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const reportsData = { totalRevenue, totalExpenses: totalExpensesAmt, netIncome: totalRevenue - totalExpensesAmt };

  // Invoice statistics
  const invoiceStats = {
    total: invoices.length,
    paid: invoices.filter(i => i.status === 'paid').length,
    pending: invoices.filter(i => i.status === 'sent' || i.status === 'partial').length,
    cancelled: invoices.filter(i => i.status === 'cancelled').length,
    draft: invoices.filter(i => i.status === 'draft').length,
    totalRevenue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total || 0), 0),
    totalPending: invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled')
      .reduce((sum, i) => {
        const paid = payments.filter(p => p.invoiceId === i.id).reduce((s, p) => s + Number(p.amount || 0), 0);
        return sum + (Number(i.total || 0) - paid);
      }, 0),
    revenueByCurrency: Object.keys(CURRENCIES).reduce((acc, code) => {
      const paidInvoices = invoices.filter(i => (i.currency || 'USD') === code && i.status === 'paid');
      acc[code] = paidInvoices.reduce((sum, i) => sum + Number(i.totalUSD || convertCurrency(i.total, i.currency, 'USD')), 0);
      return acc;
    }, {})
  };

  // Expense statistics
  const expenseStats = {
    total: expenses.length,
    approved: expenses.filter(e => e.status === 'approved'),
    pending: expenses.filter(e => e.status === 'pending'),
    rejected: expenses.filter(e => e.status === 'rejected'),
    totalApproved: expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + Number(e.amount || 0), 0),
    totalPending: expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + Number(e.amount || 0), 0)
  };

  // Payment statistics
  const paymentStats = {
    inbound: payments.filter(p => p.type === 'inbound' || p.invoiceId),
    outbound: payments.filter(p => p.type === 'outbound' && !p.invoiceId),
    totalInbound: payments.filter(p => p.type === 'inbound' || p.invoiceId).reduce((sum, p) => sum + Number(p.amount || 0), 0),
    totalOutbound: payments.filter(p => p.type === 'outbound' && !p.invoiceId).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  };

  // Journal entry statistics
  const jeStats = {
    total: journalEntries.length,
    posted: journalEntries.filter(e => e.isPosted).length,
    draft: journalEntries.filter(e => !e.isPosted).length
  };

  // Export functions
  const exportInvoicesReport = () => {
    const exportData = invoices.map(inv => ({
      'Invoice Number': inv.number,
      'Company': inv.companyName || '',
      'Date': new Date(inv.date).toLocaleDateString(),
      'Due Date': new Date(inv.dueDate).toLocaleDateString(),
      'Currency': inv.currency || 'USD',
      'Subtotal': inv.subtotal || 0,
      'Tax Rate': inv.taxRate || 0,
      'Tax Amount': inv.taxAmount || 0,
      'Total': inv.total || 0,
      'Total USD': inv.totalUSD || inv.total || 0,
      'Amount Paid': inv.amountPaid || 0,
      'Balance Due': inv.balanceDue || inv.total || 0,
      'Status': inv.status,
      'Confirmed': inv.confirmed ? 'Yes' : 'No'
    }));
    exportToCSV(exportData, `invoices_report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportExpensesReport = () => {
    const exportData = expenses.map(exp => ({
      'Date': new Date(exp.date).toLocaleDateString(),
      'Description': exp.description || '',
      'Category': exp.category || '',
      'Amount': exp.amount || 0,
      'Status': exp.status,
      'Approved By': exp.approvedBy || '',
      'Approved At': exp.approvedAt ? new Date(exp.approvedAt).toLocaleDateString() : ''
    }));
    exportToCSV(exportData, `expenses_report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportPaymentsReport = () => {
    const exportData = payments.map(pay => ({
      'Payment Number': pay.number,
      'Date': new Date(pay.date || pay.createdAt).toLocaleDateString(),
      'Type': pay.type,
      'Amount': pay.amount || 0,
      'Invoice ID': pay.invoiceId || '',
      'Reference': pay.reference || '',
      'Notes': pay.notes || ''
    }));
    exportToCSV(exportData, `payments_report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const StatCard = ({ title, value, subtitle, color, icon }) => (
    <div className={`bg-${color}-50 rounded-xl p-5 border border-${color}-100`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold text-${color}-700 mt-1`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className={`text-${color}-400`}>{icon}</div>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-500">Overview of your accounting data with export capabilities</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportInvoicesReport}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Invoices
          </button>
          <button
            onClick={exportExpensesReport}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Expenses
          </button>
          <button
            onClick={exportPaymentsReport}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Payments
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Assets" value={formatCurrency(totalAssets)} subtitle={`${assets.length} accounts`} color="blue" />
        <StatCard title="Total Liabilities" value={formatCurrency(totalLiabilities)} subtitle={`${liabilities.length} accounts`} color="red" />
        <StatCard title="Net Worth" value={formatCurrency(totalAssets - totalLiabilities)} subtitle="Assets - Liabilities" color="green" />
        <StatCard title="Journal Entries" value={jeStats.total.toString()} subtitle={`${jeStats.posted} posted, ${jeStats.draft} draft`} color="purple" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Statement Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Income Statement Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Total Revenue</span>
              <span className="font-semibold text-green-600">{formatCurrency(reportsData.totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Total Expenses</span>
              <span className="font-semibold text-red-600">{formatCurrency(reportsData.totalExpenses)}</span>
            </div>
            <div className="flex justify-between items-center py-3 bg-gray-50 rounded-lg px-4">
              <span className="font-semibold text-gray-900">Net Income</span>
              <span className={`font-bold text-lg ${reportsData.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(reportsData.netIncome)}
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600">Paid Invoices</p>
              <p className="text-xl font-bold text-green-700">{invoiceStats.paid}</p>
              <p className="text-xs text-green-600 mt-1">{formatCurrency(invoiceStats.totalRevenue)}</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-sm text-yellow-600">Pending Invoices</p>
              <p className="text-xl font-bold text-yellow-700">{invoiceStats.pending}</p>
              <p className="text-xs text-yellow-600 mt-1">{formatCurrency(invoiceStats.totalPending)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600">Total Invoices</p>
              <p className="text-xl font-bold text-blue-700">{invoiceStats.total}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-sm text-red-600">Cancelled</p>
              <p className="text-xl font-bold text-red-700">{invoiceStats.cancelled}</p>
            </div>
          </div>
        </div>

        {/* Expense Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Approved Expenses</span>
              <span className="font-semibold text-green-600">{formatCurrency(expenseStats.totalApproved)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Pending Approval</span>
              <span className="font-semibold text-yellow-600">{formatCurrency(expenseStats.totalPending)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Approved Count</span>
              <span className="font-semibold text-gray-900">{expenseStats.approved.length}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Pending Count</span>
              <span className="font-semibold text-gray-900">{expenseStats.pending.length}</span>
            </div>
          </div>
        </div>

        {/* Cash Flow */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Flow</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600">Inbound Payments</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(paymentStats.totalInbound)}</p>
                <p className="text-xs text-green-600 mt-1">{paymentStats.inbound.length} payments</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-red-600">Outbound Payments</p>
                <p className="text-xl font-bold text-red-700">{formatCurrency(paymentStats.totalOutbound)}</p>
                <p className="text-xs text-red-600 mt-1">{paymentStats.outbound.length} payments</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Net Cash Flow</span>
                <span className={`text-xl font-bold ${paymentStats.totalInbound - paymentStats.totalOutbound >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(paymentStats.totalInbound - paymentStats.totalOutbound)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart of Accounts Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Chart of Accounts Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Accounts</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3"><span className="inline-flex px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">Asset</span></td>
                <td className="px-4 py-3 text-right">{assets.length}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(totalAssets)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="inline-flex px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">Liability</span></td>
                <td className="px-4 py-3 text-right">{liabilities.length}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(totalLiabilities)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="inline-flex px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">Equity</span></td>
                <td className="px-4 py-3 text-right">{equities.length}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(totalEquity)}</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="inline-flex px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Revenue</span></td>
                <td className="px-4 py-3 text-right">{revenues.length}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(revenues.reduce((s, a) => s + (a.balance || 0), 0))}</td>
              </tr>
              <tr>
                <td className="px-4 py-3"><span className="inline-flex px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">Expense</span></td>
                <td className="px-4 py-3 text-right">{expensesList.length}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(expensesList.reduce((s, a) => s + Math.abs(a.balance || 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Currency Revenue Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Multi-Currency Revenue Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Symbol</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Invoices</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total (Original)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Object.keys(CURRENCIES).map((code) => {
                const data = currencyBreakdown[code];
                if (!data || data.count === 0) return null;
                const currencyInfo = CURRENCIES[code];
                return (
                  <tr key={code}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{code}</span>
                        <span className="text-sm text-gray-500">{currencyInfo.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm font-medium">{currencyInfo.symbol}</span>
                    </td>
                    <td className="px-4 py-3 text-center">{data.count}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {currencyInfo.symbol}{Number(data.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      ${Number(data.totalUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold">
                <td className="px-4 py-3" colSpan={3}><span className="text-gray-900">Total All Currencies (USD)</span></td>
                <td className="px-4 py-3 text-right"></td>
                <td className="px-4 py-3 text-right text-lg text-blue-700">
                  ${Object.values(currencyBreakdown).reduce((sum, d) => sum + d.totalUSD, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Status Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Status Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-600">Draft</p>
            <p className="text-2xl font-bold text-gray-700">{invoiceStats.draft}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-600">Sent</p>
            <p className="text-2xl font-bold text-blue-700">{invoices.filter(i => i.status === 'sent').length}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 text-center">
            <p className="text-sm text-yellow-600">Partial</p>
            <p className="text-2xl font-bold text-yellow-700">{invoices.filter(i => i.status === 'partial').length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-sm text-green-600">Paid</p>
            <p className="text-2xl font-bold text-green-700">{invoiceStats.paid}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-sm text-red-600">Cancelled</p>
            <p className="text-2xl font-bold text-red-700">{invoiceStats.cancelled}</p>
          </div>
        </div>
      </div>

      {/* Aged Receivable */}
      <AgedReceivable invoices={invoices} payments={payments} formatCurrency={formatCurrency} />

      {/* Aged Payable */}
      <AgedPayable expenses={expenses} formatCurrency={formatCurrency} />
    </div>
  );
}

function AgedReceivable({ invoices, payments, formatCurrency }) {
  const today = new Date();
  const buckets = [
    { label: 'Current (not yet due)', min: -Infinity, max: 0 },
    { label: '1–30 days overdue',     min: 1,        max: 30 },
    { label: '31–60 days overdue',    min: 31,       max: 60 },
    { label: '61–90 days overdue',    min: 61,       max: 90 },
    { label: '90+ days overdue',      min: 91,       max: Infinity },
  ];
  const openInvoices = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled');
  const rows = openInvoices.map(inv => {
    const paidAmt = payments.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const balance = Math.max(Number(inv.total || 0) - paidAmt, 0);
    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.floor((today - dueDate) / 86400000);
    return { ...inv, balance, daysOverdue, paidAmt };
  }).filter(r => r.balance > 0);
  const bucketed = buckets.map(b => ({
    ...b,
    items: rows.filter(r => r.daysOverdue >= b.min && r.daysOverdue <= b.max),
    total: rows.filter(r => r.daysOverdue >= b.min && r.daysOverdue <= b.max).reduce((s, r) => s + r.balance, 0),
  }));
  const grandTotal = rows.reduce((s, r) => s + r.balance, 0);
  const bucketColors = ['bg-green-50 border-green-200 text-green-700','bg-yellow-50 border-yellow-200 text-yellow-700','bg-orange-50 border-orange-200 text-orange-700','bg-red-50 border-red-200 text-red-700','bg-red-100 border-red-300 text-red-800'];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Aged Receivable</h3>
          <p className="text-sm text-gray-500">Outstanding customer invoices grouped by overdue period</p>
        </div>
        <span className="text-xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {bucketed.map((b, i) => (
          <div key={b.label} className={`border rounded-xl p-4 text-center ${bucketColors[i]}`}>
            <p className="text-xs font-medium mb-1">{b.label}</p>
            <p className="text-lg font-bold">{formatCurrency(b.total)}</p>
            <p className="text-xs opacity-70">{b.items.length} invoice{b.items.length !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">No outstanding receivables.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoice Total</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance Due</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(inv => {
                const overdueColor = inv.daysOverdue <= 0 ? 'text-green-600' : inv.daysOverdue <= 30 ? 'text-yellow-600' : inv.daysOverdue <= 60 ? 'text-orange-600' : 'text-red-600';
                return (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{inv.number}</td>
                    <td className="px-4 py-3 text-gray-700">{inv.companyName}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 text-right text-green-600">{formatCurrency(inv.paidAmt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCurrency(inv.balance)}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${overdueColor}`}>
                      {inv.daysOverdue <= 0 ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Not due</span> : `${inv.daysOverdue}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Outstanding:</td>
                <td className="px-4 py-3 text-right text-base font-bold text-blue-700">{formatCurrency(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function AgedPayable({ expenses, formatCurrency }) {
  const today = new Date();
  const buckets = [
    { label: 'Current (not yet due)', min: -Infinity, max: 0 },
    { label: '1–30 days overdue',     min: 1,        max: 30 },
    { label: '31–60 days overdue',    min: 31,       max: 60 },
    { label: '61–90 days overdue',    min: 61,       max: 90 },
    { label: '90+ days overdue',      min: 91,       max: Infinity },
  ];
  const openExpenses = expenses.filter(e => e.status === 'pending' || e.status === 'approved');
  const rows = openExpenses.map(exp => {
    const dueDate = exp.dueDate ? new Date(exp.dueDate) : new Date(exp.date || exp.createdAt || today);
    const daysOverdue = Math.floor((today - dueDate) / 86400000);
    return { ...exp, daysOverdue, balance: Number(exp.amount || 0) };
  });
  const bucketed = buckets.map(b => ({
    ...b,
    items: rows.filter(r => r.daysOverdue >= b.min && r.daysOverdue <= b.max),
    total: rows.filter(r => r.daysOverdue >= b.min && r.daysOverdue <= b.max).reduce((s, r) => s + r.balance, 0),
  }));
  const grandTotal = rows.reduce((s, r) => s + r.balance, 0);
  const bucketColors = ['bg-green-50 border-green-200 text-green-700','bg-yellow-50 border-yellow-200 text-yellow-700','bg-orange-50 border-orange-200 text-orange-700','bg-red-50 border-red-200 text-red-700','bg-red-100 border-red-300 text-red-800'];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Aged Payable</h3>
          <p className="text-sm text-gray-500">Outstanding vendor expenses grouped by overdue period</p>
        </div>
        <span className="text-xl font-bold text-red-700">{formatCurrency(grandTotal)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {bucketed.map((b, i) => (
          <div key={b.label} className={`border rounded-xl p-4 text-center ${bucketColors[i]}`}>
            <p className="text-xs font-medium mb-1">{b.label}</p>
            <p className="text-lg font-bold">{formatCurrency(b.total)}</p>
            <p className="text-xs opacity-70">{b.items.length} item{b.items.length !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">No outstanding payables.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expense</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor / Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(exp => {
                const overdueColor = exp.daysOverdue <= 0 ? 'text-green-600' : exp.daysOverdue <= 30 ? 'text-yellow-600' : exp.daysOverdue <= 60 ? 'text-orange-600' : 'text-red-600';
                const statusBg = exp.status === 'approved' ? 'bg-green-100 text-green-700' : exp.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700';
                return (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{exp.description || exp.title || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{exp.vendor || exp.category || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(exp.date || exp.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBg}`}>{exp.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">{formatCurrency(exp.balance)}</td>
                    <td className={`px-4 py-3 text-center font-semibold ${overdueColor}`}>
                      {exp.daysOverdue <= 0 ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Not due</span> : `${exp.daysOverdue}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total Outstanding:</td>
                <td className="px-4 py-3 text-right text-base font-bold text-red-700">{formatCurrency(grandTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
