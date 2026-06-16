import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getOpportunities, getQuotations, getSalesOrders, getInvoices,
  getCompanies, getCurrentUser, ROLE_PERMISSIONS, subscribeToEvents, getUsers, getActivities
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
          h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: bold; }
          .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #059669; }
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

export default function SalesDashboard() {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const role = user?.role || 'sales';
  const roleName = ROLE_PERMISSIONS[role]?.name || 'Sales Representative';

  const [opportunities, setOpportunities] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedSalesperson, setSelectedSalesperson] = useState(user?.role === 'sales' ? user?.id : 'all');

  const loadData = () => {
    getOpportunities().then(setOpportunities).catch(() => {});
    getQuotations().then(setQuotations).catch(() => {});
    getSalesOrders().then(setSalesOrders).catch(() => {});
    getInvoices().then(setInvoices).catch(() => {});
    getCompanies().then(setCompanies).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
    getActivities().then(setActivities).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = ['opportunity_updated', 'quotation_updated', 'salesOrder_confirmed', 'invoice_updated'];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const isSalesPerson = user?.role === 'sales';
  const isHeadOfSales = user?.role === 'head_of_sales';

  // Filter data by selected salesperson
  const filterBySalesperson = (items, field = 'assignedTo') => {
    if (selectedSalesperson === 'all') return items;
    return items.filter(item => item[field] === selectedSalesperson);
  };

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

  const filteredOpps = filterByDate(filterBySalesperson(opportunities), 'createdAt');
  const filteredQuotes = filterByDate(filterBySalesperson(quotations), 'date');
  const filteredOrders = filterByDate(filterBySalesperson(salesOrders), 'date');
  const filteredInvoices = filterByDate(filterBySalesperson(invoices), 'date');

  // Calculate summary stats
  const totalPipeline = filteredOpps.reduce((s, o) => s + Number(o.value || 0), 0);
  const weightedPipeline = filteredOpps.reduce((s, o) => s + (Number(o.value || 0) * Number(o.probability || 0) / 100), 0);
  const wonValue = filteredOpps.filter(o => o.stage === 'closed_won').reduce((s, o) => s + Number(o.value || 0), 0);
  const totalQuoteValue = filteredQuotes.reduce((s, q) => s + Number(q.total || 0), 0);
  const approvedQuotes = filteredQuotes.filter(q => q.status === 'approved');
  const totalOrderValue = filteredOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalRevenue = filteredInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0);

  const fmt = (n) => `$${Number(n || 0).toLocaleString()}`;
  const userById = (id) => users.find(u => u.id === id)?.name || 'Unknown';
  const salesmen = users.filter(u => u.role === 'sales');

  const recentOpps = [...filteredOpps].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const recentQuotes = [...filteredQuotes].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentOrders = [...filteredOrders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  // Get pending activities for this user
  const myActivities = isSalesPerson
    ? activities.filter(a => a.createdBy === user?.id || a.refId === user?.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Print Report ID - Hidden */}
      <div id="sales-report" className="print-report" style={{ display: 'none' }}>
        <h1>Sales Department Report</h1>
        <p className="text-gray-500">Generated on: {new Date().toLocaleDateString()}</p>
        {dateRange.start && <p className="text-gray-500">Period: {dateRange.start} to {dateRange.end || 'Now'}</p>}
        {selectedSalesperson !== 'all' && <p className="text-gray-500">Salesperson: {userById(selectedSalesperson)}</p>}

        <h2>Sales Summary</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{fmt(totalPipeline)}</div>
            <div className="stat-label">Total Pipeline</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(weightedPipeline)}</div>
            <div className="stat-label">Weighted Pipeline</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(wonValue)}</div>
            <div className="stat-label">Won Value</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalRevenue)}</div>
            <div className="stat-label">Revenue</div>
          </div>
        </div>

        <h2>Pipeline by Status</h2>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'].map(stage => {
              const stageOpps = filteredOpps.filter(o => o.stage === stage);
              return (
                <tr key={stage}>
                  <td>{stage.replace(/_/g, ' ')}</td>
                  <td>{stageOpps.length}</td>
                  <td>{fmt(stageOpps.reduce((s, o) => s + Number(o.value || 0), 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2>Recent Quotations</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentQuotes.map(q => (
              <tr key={q.id}>
                <td>{q.number}</td>
                <td>{q.customerName || '—'}</td>
                <td>{fmt(q.total)}</td>
                <td>{q.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Recent Sales Orders</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map(o => (
              <tr key={o.id}>
                <td>{o.number}</td>
                <td>{o.customerName || '—'}</td>
                <td>{fmt(o.total)}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.welcome', { name: user?.name || '' })} - Sales
          </h1>
          <p className="text-gray-500">{roleName} Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">{roleName}</span>
          <button
            onClick={() => printReport('sales-report', 'Sales Department Report')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
        {/* Salesperson Filter (only for Head of Sales or Admin) */}
        {(isHeadOfSales || user?.role === 'admin' || user?.role === 'manager') && (
          <>
            <span className="text-sm font-medium text-gray-700">Salesperson:</span>
            <select
              value={selectedSalesperson}
              onChange={(e) => setSelectedSalesperson(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Salespeople</option>
              {salesmen.map(sm => (
                <option key={sm.id} value={sm.id}>{sm.name}</option>
              ))}
            </select>
          </>
        )}

        <span className="text-sm font-medium text-gray-700">Date Range:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
          />
        </div>
        {(dateRange.start || dateRange.end || selectedSalesperson !== 'all') && (
          <button
            onClick={() => {
              setDateRange({ start: '', end: '' });
              setSelectedSalesperson(user?.role === 'sales' ? user?.id : 'all');
            }}
            className="text-sm text-green-600 hover:text-green-800"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Pipeline</p>
              <p className="text-2xl font-bold text-green-600">{fmt(totalPipeline)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <Link to="/opportunities" className="text-xs text-green-500 hover:underline mt-2 block">{filteredOpps.length} opportunities</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Weighted Pipeline</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(weightedPipeline)}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Based on probability</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Won Value</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(wonValue)}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{filteredOpps.filter(o => o.stage === 'closed_won').length} deals closed</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Revenue</p>
              <p className="text-2xl font-bold text-purple-600">{fmt(totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">From paid invoices</p>
        </div>
      </div>

      {/* Pipeline Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'].map(stage => {
          const stageOpps = filteredOpps.filter(o => o.stage === stage);
          const colors = {
            prospecting: 'bg-gray-100 text-gray-700',
            qualification: 'bg-blue-100 text-blue-700',
            proposal: 'bg-indigo-100 text-indigo-700',
            negotiation: 'bg-yellow-100 text-yellow-700',
            closed_won: 'bg-green-100 text-green-700',
            closed_lost: 'bg-red-100 text-red-700'
          };
          return (
            <div key={stage} className={`rounded-lg p-4 ${colors[stage]}`}>
              <p className="text-xs font-medium capitalize">{stage.replace(/_/g, ' ')}</p>
              <p className="text-xl font-bold mt-1">{stageOpps.length}</p>
              <p className="text-xs mt-1">{fmt(stageOpps.reduce((s, o) => s + Number(o.value || 0), 0))}</p>
            </div>
          );
        })}
      </div>

      {/* Sales Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quotations</h3>
            <Link to="/quotations" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Quotations</span>
              <span className="font-semibold">{filteredQuotes.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Approved</span>
              <span className="font-semibold text-green-600">{approvedQuotes.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending</span>
              <span className="font-semibold text-yellow-600">{filteredQuotes.filter(q => q.status === 'draft').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Value</span>
              <span className="font-semibold">{fmt(totalQuoteValue)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sales Orders</h3>
            <Link to="/sales-orders" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Orders</span>
              <span className="font-semibold">{filteredOrders.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Confirmed</span>
              <span className="font-semibold text-green-600">{filteredOrders.filter(o => o.status === 'confirmed').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending</span>
              <span className="font-semibold text-yellow-600">{filteredOrders.filter(o => o.status === 'pending').length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Value</span>
              <span className="font-semibold">{fmt(totalOrderValue)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Customers</h3>
            <Link to="/companies" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Customers</span>
              <span className="font-semibold">{companies.filter(c => c.type === 'customer' || !c.type).length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">My Customers</span>
              <span className="font-semibold text-green-600">
                {filteredOpps.length > 0 ? companies.filter(c => c.assignedTo === selectedSalesperson).length : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Active Opportunities</span>
              <span className="font-semibold text-blue-600">{filteredOpps.filter(o => !['closed_won', 'closed_lost'].includes(o.stage)).length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Won This Period</span>
              <span className="font-semibold text-green-600">{fmt(wonValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Opportunities */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Opportunities</h3>
            <Link to="/opportunities" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            {recentOpps.map((opp) => (
              <div key={opp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{opp.name}</p>
                  <p className="text-sm text-gray-500">{userById(opp.assignedTo)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{fmt(opp.value)}</p>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    opp.stage === 'closed_won' ? 'bg-green-100 text-green-700' :
                    opp.stage === 'closed_lost' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{opp.stage.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Quotations */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Quotations</h3>
            <Link to="/quotations" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            {recentQuotes.map((quote) => (
              <div key={quote.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{quote.number}</p>
                  <p className="text-sm text-gray-500">{quote.customerName || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{fmt(quote.total)}</p>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                    quote.status === 'approved' ? 'bg-green-100 text-green-700' :
                    quote.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{quote.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* My Activities (for Sales Rep) */}
      {isSalesPerson && myActivities.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">My Pending Activities</h3>
            <Link to="/opportunities" className="text-sm text-green-600 hover:text-green-800">View All →</Link>
          </div>
          <div className="space-y-3">
            {myActivities.filter(a => !a.done).slice(0, 5).map((act) => (
              <div key={act.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{act.title}</p>
                  <p className="text-sm text-gray-500">{act.type} {act.dueDate ? `• Due: ${new Date(act.dueDate).toLocaleDateString()}` : ''}</p>
                </div>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <span className="text-sm font-medium">New Customer</span>
          </Link>
          <Link to="/sales-orders" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-medium">New Order</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
