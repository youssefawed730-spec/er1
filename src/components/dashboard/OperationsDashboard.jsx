import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getOpportunities, getQuotations, getSalesOrders, getInvoices,
  getCostItems, getPurchaseCosts, getExpenses, getCurrentUser,
  ROLE_PERMISSIONS, subscribeToEvents, getUsers, getCompanies
} from '../../data/store';
import { useTranslation } from '../../i18n';

// Print utility function
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
          h1 { color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: bold; }
          .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #dc2626; }
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

export default function OperationsDashboard() {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const role = user?.role || 'operation';
  const roleName = ROLE_PERMISSIONS[role]?.name || 'Operations Manager';

  const [costItems, setCostItems] = useState([]);
  const [purchaseCosts, setPurchaseCosts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const loadData = () => {
    getCostItems().then(setCostItems).catch(() => {});
    getPurchaseCosts().then(setPurchaseCosts).catch(() => {});
    getSalesOrders().then(setSalesOrders).catch(() => {});
    getInvoices().then(setInvoices).catch(() => {});
    getExpenses().then(setExpenses).catch(() => {});
    getQuotations().then(setQuotations).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
    getCompanies().then(setCompanies).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = ['costItem_updated', 'purchaseCost_updated', 'salesOrder_confirmed', 'invoice_updated', 'expense_approved'];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const fmt = (n) => `$${Number(n || 0).toLocaleString()}`;
  const userById = (id) => users.find(u => u.id === id)?.name || 'Unknown';

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

  const filteredCostItems = filterByDate(costItems, 'createdAt');
  const filteredPurchaseCosts = filterByDate(purchaseCosts, 'date');
  const filteredSalesOrders = filterByDate(salesOrders, 'date');
  const filteredInvoices = filterByDate(invoices, 'date');
  const filteredExpenses = filterByDate(expenses, 'date');
  const filteredQuotations = filterByDate(quotations, 'date');

  // Calculate summary stats
  const totalCostItems = filteredCostItems.length;
  const activeCostItems = filteredCostItems.filter(c => c.status === 'active').length;
  const totalPurchaseValue = filteredPurchaseCosts.reduce((s, p) => s + Number(p.total || 0), 0);
  const pendingPurchases = filteredPurchaseCosts.filter(p => p.status === 'pending' || p.status === 'draft').length;
  const confirmedPurchases = filteredPurchaseCosts.filter(p => p.status === 'confirmed').length;
  const confirmedOrders = filteredSalesOrders.filter(o => o.status === 'confirmed').length;
  const totalOrderValue = filteredSalesOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const pendingExpenses = filteredExpenses.filter(e => e.status === 'pending');
  const approvedExpenses = filteredExpenses.filter(e => e.status === 'approved');
  const totalExpenseValue = [...pendingExpenses, ...approvedExpenses].reduce((s, e) => s + Number(e.amount || 0), 0);

  // Pending orders that need processing
  const ordersAwaitingProcessing = filteredSalesOrders.filter(o => o.status === 'pending');
  const quotationsAwaitingConversion = filteredQuotations.filter(q => q.status === 'approved');

  const recentCostItems = [...filteredCostItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const recentPurchases = [...filteredPurchaseCosts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentOrders = [...filteredSalesOrders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Print Report ID - Hidden */}
      <div id="operations-report" className="print-report" style={{ display: 'none' }}>
        <h1>Operations Department Report</h1>
        <p className="text-gray-500">Generated on: {new Date().toLocaleDateString()}</p>
        {dateRange.start && <p className="text-gray-500">Period: {dateRange.start} to {dateRange.end || 'Now'}</p>}

        <h2>Operations Summary</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{totalCostItems}</div>
            <div className="stat-label">Cost Items</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalPurchaseValue)}</div>
            <div className="stat-label">Purchase Costs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{confirmedOrders}</div>
            <div className="stat-label">Confirmed Orders</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmt(totalExpenseValue)}</div>
            <div className="stat-label">Expenses</div>
          </div>
        </div>

        <h2>Purchase Costs Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentPurchases.map(p => (
              <tr key={p.id}>
                <td>{p.reference}</td>
                <td>{p.vendorName || '—'}</td>
                <td>{fmt(p.total)}</td>
                <td>{p.status}</td>
                <td>{new Date(p.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Sales Orders Summary</h2>
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
            {recentOrders.map(o => (
              <tr key={o.id}>
                <td>{o.number}</td>
                <td>{o.customerName || '—'}</td>
                <td>{fmt(o.total)}</td>
                <td>{o.status}</td>
                <td>{new Date(o.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Cost Items</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentCostItems.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.category}</td>
                <td>{fmt(c.unitPrice)}</td>
                <td>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('dashboard.welcome', { name: user?.name || '' })} - Operations
          </h1>
          <p className="text-gray-500">{roleName} Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">{roleName}</span>
          <button
            onClick={() => printReport('operations-report', 'Operations Department Report')}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
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
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
          />
        </div>
        {(dateRange.start || dateRange.end) && (
          <button
            onClick={() => setDateRange({ start: '', end: '' })}
            className="text-sm text-red-600 hover:text-red-800"
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
              <p className="text-sm text-gray-500 mb-1">Cost Items</p>
              <p className="text-2xl font-bold text-red-600">{totalCostItems}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{activeCostItems} active items</p>
          <Link to="/cost-items" className="text-xs text-red-500 hover:underline mt-1 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Purchase Costs</p>
              <p className="text-2xl font-bold text-orange-600">{fmt(totalPurchaseValue)}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{pendingPurchases} pending</p>
          <Link to="/purchase-costs" className="text-xs text-orange-500 hover:underline mt-1 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Sales Orders</p>
              <p className="text-2xl font-bold text-blue-600">{filteredSalesOrders.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{confirmedOrders} confirmed</p>
          <Link to="/sales-orders" className="text-xs text-blue-500 hover:underline mt-1 block">View Details →</Link>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Pending Expenses</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingExpenses.length}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{fmt(totalExpenseValue)} total</p>
          <Link to="/expenses" className="text-xs text-yellow-500 hover:underline mt-1 block">View Details →</Link>
        </div>
      </div>

      {/* Operations Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Purchase Costs Summary */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Purchase Costs</h3>
            <Link to="/purchase-costs" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Purchases</span>
              <span className="font-semibold">{filteredPurchaseCosts.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Confirmed</span>
              <span className="font-semibold text-green-600">{confirmedPurchases}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending</span>
              <span className="font-semibold text-yellow-600">{pendingPurchases}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Value</span>
              <span className="font-semibold">{fmt(totalPurchaseValue)}</span>
            </div>
          </div>
        </div>

        {/* Sales Orders Summary */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sales Orders</h3>
            <Link to="/sales-orders" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Orders</span>
              <span className="font-semibold">{filteredSalesOrders.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Confirmed</span>
              <span className="font-semibold text-green-600">{confirmedOrders}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pending Processing</span>
              <span className="font-semibold text-yellow-600">{ordersAwaitingProcessing.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Value</span>
              <span className="font-semibold">{fmt(totalOrderValue)}</span>
            </div>
          </div>
        </div>

        {/* Cost Items Summary */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Cost Items</h3>
            <Link to="/cost-items" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Total Items</span>
              <span className="font-semibold">{totalCostItems}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Active</span>
              <span className="font-semibold text-green-600">{activeCostItems}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Inactive</span>
              <span className="font-semibold text-gray-600">{totalCostItems - activeCostItems}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Categories</span>
              <span className="font-semibold">{[...new Set(filteredCostItems.map(c => c.category))].length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Actions */}
      {(ordersAwaitingProcessing.length > 0 || quotationsAwaitingConversion.length > 0 || pendingExpenses.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders Awaiting Processing */}
          {ordersAwaitingProcessing.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Orders Awaiting Processing</h3>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                  {ordersAwaitingProcessing.length}
                </span>
              </div>
              <div className="space-y-3">
                {ordersAwaitingProcessing.slice(0, 3).map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{order.number}</p>
                      <p className="text-sm text-gray-500">{order.customerName || '—'}</p>
                    </div>
                    <p className="font-bold text-gray-900">{fmt(order.total)}</p>
                  </div>
                ))}
              </div>
              {ordersAwaitingProcessing.length > 3 && (
                <Link to="/sales-orders" className="text-sm text-yellow-600 hover:text-yellow-800 mt-2 block">View all {ordersAwaitingProcessing.length} orders →</Link>
              )}
            </div>
          )}

          {/* Quotations Ready for Conversion */}
          {quotationsAwaitingConversion.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Approved Quotations</h3>
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  {quotationsAwaitingConversion.length}
                </span>
              </div>
              <div className="space-y-3">
                {quotationsAwaitingConversion.slice(0, 3).map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{quote.number}</p>
                      <p className="text-sm text-gray-500">{quote.customerName || '—'}</p>
                    </div>
                    <p className="font-bold text-gray-900">{fmt(quote.total)}</p>
                  </div>
                ))}
              </div>
              {quotationsAwaitingConversion.length > 3 && (
                <Link to="/quotations" className="text-sm text-green-600 hover:text-green-800 mt-2 block">View all →</Link>
              )}
            </div>
          )}

          {/* Pending Expenses for Approval */}
          {pendingExpenses.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Pending Expenses</h3>
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  {pendingExpenses.length}
                </span>
              </div>
              <div className="space-y-3">
                {pendingExpenses.slice(0, 3).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{exp.description}</p>
                      <p className="text-sm text-gray-500">{userById(exp.createdBy)}</p>
                    </div>
                    <p className="font-bold text-gray-900">{fmt(exp.amount)}</p>
                  </div>
                ))}
              </div>
              {pendingExpenses.length > 3 && (
                <Link to="/expenses" className="text-sm text-red-600 hover:text-red-800 mt-2 block">View all →</Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchase Costs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Purchase Costs</h3>
            <Link to="/purchase-costs" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                  <th className="pb-3 text-left">Reference</th>
                  <th className="pb-3 text-left">Vendor</th>
                  <th className="pb-3 text-left">Amount</th>
                  <th className="pb-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {recentPurchases.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{p.reference}</td>
                    <td className="py-3">{p.vendorName || '—'}</td>
                    <td className="py-3 font-medium">{fmt(p.total)}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        p.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Sales Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Sales Orders</h3>
            <Link to="/sales-orders" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
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
                {recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 font-medium">{o.number}</td>
                    <td className="py-3">{o.customerName || '—'}</td>
                    <td className="py-3 font-medium">{fmt(o.total)}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        o.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        o.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Cost Items */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Cost Items</h3>
          <Link to="/cost-items" className="text-sm text-red-600 hover:text-red-800">View All →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentCostItems.map((item) => (
            <div key={item.id} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">{item.name}</p>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>{item.status}</span>
              </div>
              <p className="text-sm text-gray-500 mb-2">{item.category}</p>
              <p className="text-lg font-bold text-red-600">{fmt(item.unitPrice)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-red-500 to-orange-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/cost-items" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M4 7h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
            </svg>
            <span className="text-sm font-medium">Manage Cost Items</span>
          </Link>
          <Link to="/purchase-costs" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span className="text-sm font-medium">New Purchase</span>
          </Link>
          <Link to="/sales-orders" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-medium">View Orders</span>
          </Link>
          <Link to="/expenses" className="bg-white/20 hover:bg-white/30 p-4 rounded-lg text-center transition-colors">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-sm font-medium">Add Expense</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
