import React, { useState, useMemo, useEffect } from 'react';
import { getAccounts, saveAccount, deleteAccount, getARBreakdown, getAPBreakdown, subscribeToEvents } from '../../data/store';

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [arBreakdown, setArBreakdown] = useState([]);
  const [apBreakdown, setApBreakdown] = useState([]);
  const [expandedAccount, setExpandedAccount] = useState(null);

  const refreshAll = () => {
    getAccounts().then(setAccounts).catch(() => {});
    getARBreakdown().then(setArBreakdown).catch(() => {});
    getAPBreakdown().then(setApBreakdown).catch(() => {});
  };

  useEffect(() => { refreshAll(); }, []);

  // Auto-refresh whenever a payment is saved/deleted or an account balance changes
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      const refreshEvents = [
        'payment_saved', 'payment_deleted',
        'account_balance_updated',
        'invoice_updated', 'purchaseCost_updated',
        'journal_posted',
      ];
      if (refreshEvents.includes(event.type)) {
        refreshAll();
      }
    });
    return unsubscribe;
  }, []);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const accountTypes = [
    { value: 'asset', label: 'Asset', color: 'bg-blue-500' },
    { value: 'liability', label: 'Liability', color: 'bg-red-500' },
    { value: 'equity', label: 'Equity', color: 'bg-purple-500' },
    { value: 'revenue', label: 'Revenue', color: 'bg-green-500' },
    { value: 'expense', label: 'Expense', color: 'bg-orange-500' }
  ];

  const handleSave = (account) => {
    saveAccount(account);
    refreshAll();
    setShowModal(false);
    setEditingAccount(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this account?')) {
      deleteAccount(id);
      refreshAll();
    }
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setShowModal(true);
  };

  const filteredAccounts = (() => {
    let list = filterType === 'all' ? accounts : accounts.filter(a => a.type === filterType);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.code?.toLowerCase().includes(q) ||
        a.type?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q)
      );
    }
    return list;
  })();

  const getTypeColor = (type) => {
    const found = accountTypes.find(t => t.value === type);
    return found ? found.color : 'bg-gray-500';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  // For AR (1200) and AP (2000) accounts return the live computed balance;
  // for all other accounts return the stored balance field.
  const isARAccount = (a) => a.code === '1200' || a.name?.toLowerCase().includes('receivable');
  const isAPAccount = (a) => a.code === '2000' || a.name?.toLowerCase().includes('payable');

  const getEffectiveBalance = (account) => {
    if (isARAccount(account)) return arBreakdown.total;
    if (isAPAccount(account)) return apBreakdown.total;
    return account.balance || 0;
  };

  const totalsByType = accountTypes.reduce((acc, type) => {
    const typeAccounts = accounts.filter(a => a.type === type.value);
    const total = typeAccounts.reduce((sum, a) => sum + getEffectiveBalance(a), 0);
    acc[type.value] = total;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
          <p className="text-gray-500">Manage your organization's accounts</p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {accountTypes.map((type) => (
          <div
            key={type.value}
            className={`${type.color} rounded-xl p-4 text-white cursor-pointer hover:opacity-90 transition-opacity`}
            onClick={() => setFilterType(filterType === type.value ? 'all' : type.value)}
          >
            <p className="text-sm opacity-80 capitalize">{type.label}</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalsByType[type.value] || 0)}</p>
          </div>
        ))}
      </div>

      {/* Filter Badge */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search accounts…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      {filterType !== 'all' && (
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
            Filtered by: {filterType}
          </span>
          <button
            onClick={() => setFilterType('all')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear filter
          </button>
        </div>
      )}
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredAccounts.map((account) => {
              const isAR = isARAccount(account);
              const isAP = isAPAccount(account);
              const effectiveBalance = getEffectiveBalance(account);
              const isExpanded = expandedAccount === account.id;
              const breakdown = isAR ? arBreakdown : isAP ? apBreakdown : null;

              return (
                <React.Fragment key={account.id}>
                  <tr className={`hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{account.code}</td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{account.name}</p>
                          {(isAR || isAP) && (
                            <span className="px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded font-medium">
                              {isAR ? 'Live from Invoices' : 'Live from Purchase Costs'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{account.description}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full text-white ${getTypeColor(account.type)}`}>
                        {account.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(effectiveBalance)}
                        </span>
                        {(isAR || isAP) && breakdown?.rows?.length > 0 && (
                          <button
                            onClick={() => setExpandedAccount(isExpanded ? null : account.id)}
                            className={`p-1 rounded transition-colors ${isExpanded ? 'text-indigo-600 bg-indigo-100' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                            title={isExpanded ? 'Collapse breakdown' : 'Show breakdown'}
                          >
                            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(account)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expandable breakdown row */}
                  {isExpanded && breakdown && (
                    <tr>
                      <td colSpan={5} className="px-6 pb-4 bg-gray-50 border-b border-gray-200">
                        <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                          {/* Header */}
                          <div className="bg-white px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {isAR
                                ? `Customers with outstanding balances (${breakdown.rows.length})`
                                : `Vendors with outstanding balances (${breakdown.rows.length})`}
                            </span>
                            <span className="text-xs font-bold text-gray-700">{formatCurrency(breakdown.total)} total outstanding</span>
                          </div>
                          <table className="w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">{isAR ? 'Customer' : 'Vendor'}</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">{isAR ? 'Invoices' : 'Purchase Costs'}</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount Due</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">% of Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {breakdown.rows.map((row) => {
                                const pct = breakdown.total > 0 ? (row.totalDue / breakdown.total * 100).toFixed(1) : '0.0';
                                const name = isAR ? row.companyName : row.vendorName;
                                const count = isAR ? row.invoiceCount : row.costCount;
                                return (
                                  <tr key={isAR ? row.companyId : row.vendorId} className="hover:bg-blue-50">
                                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{name}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">{count}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">{formatCurrency(row.totalDue)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50 border-t border-gray-200">
                              <tr>
                                <td className="px-4 py-2 text-sm font-bold text-gray-700">Total</td>
                                <td />
                                <td className="px-4 py-2 text-right text-sm font-bold text-red-700">{formatCurrency(breakdown.total)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <AccountModal
          account={editingAccount}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingAccount(null);
          }}
        />
      )}
    </div>
  );
}

function AccountModal({ account, onSave, onClose }) {
  const [formData, setFormData] = useState(account || {
    code: '',
    name: '',
    type: 'asset',
    balance: 0,
    description: '',
    isActive: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {account ? 'Edit Account' : 'Add New Account'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Balance</label>
            <input
              type="number"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}