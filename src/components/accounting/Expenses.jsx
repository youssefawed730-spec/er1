import React, { useState, useEffect } from 'react';
import Pagination, { usePagination } from '../common/Pagination';
import { getExpenses, saveExpense, deleteExpense, approveExpense, rejectExpense, getAccounts, getCurrentUser, subscribeToEvents } from '../../data/store';

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const user = getCurrentUser();

  const loadData = () => {
    getExpenses().then(setExpenses).catch(() => {});
    getAccounts().then(setAccounts).catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = ['expense_saved', 'expense_approved', 'expense_rejected', 'expense_deleted'];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const categories = [
    { value: 'transportation', label: 'Transportation', icon: '🚚' },
    { value: 'rent', label: 'Rent', icon: '🏢' },
    { value: 'utilities', label: 'Utilities', icon: '💡' },
    { value: 'marketing', label: 'Marketing', icon: '📢' },
    { value: 'professional', label: 'Professional Fees', icon: '⚖️' },
    { value: 'supplies', label: 'Office Supplies', icon: '📎' },
    { value: 'insurance', label: 'Insurance', icon: '🛡️' },
    { value: 'salaries', label: 'Salaries', icon: '👥' },
    { value: 'miscellaneous', label: 'Miscellaneous', icon: '📦' }
  ];

  const canApprove = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'accounting';

  const handleSave = (expense) => {
    saveExpense(expense);
    getExpenses().then(setExpenses).catch(()=>{});
    setShowModal(false);
    setEditingExpense(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      deleteExpense(id);
      getExpenses().then(setExpenses).catch(()=>{});
    }
  };

  const handleApprove = (id) => {
    approveExpense(id, user?.role);
    getExpenses().then(setExpenses).catch(()=>{});
  };

  const handleReject = (id) => {
    rejectExpense(id);
    getExpenses().then(setExpenses).catch(()=>{});
  };

  const handleEdit = (expense) => {
    // Only allow editing draft/pending expenses
    if (expense.status === 'draft' || expense.status === 'pending') {
      setEditingExpense(expense);
      setShowModal(true);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const statusMatch = filterStatus === 'all' || e.status === filterStatus;
    const categoryMatch = filterCategory === 'all' || e.category === filterCategory;
    const searchMatch = !searchTerm.trim() || (() => {
      const q = searchTerm.toLowerCase();
      return (
        e.description?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q) ||
        e.vendor?.toLowerCase().includes(q) ||
        e.status?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q) ||
        String(e.amount || '').includes(q)
      );
    })();
    return statusMatch && categoryMatch && searchMatch;
  });

  const expensePagination = usePagination(filteredExpenses, 50);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700',
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  // Calculate totals
  const totalPending = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);
  const totalRejected = expenses.filter(e => e.status === 'rejected').reduce((sum, e) => sum + e.amount, 0);

  const getCategoryIcon = (category) => {
    const found = categories.find(c => c.value === category);
    return found?.icon || '📦';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-500">Track and manage business expenses</p>
        </div>
        <button
          onClick={() => {
            setEditingExpense(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Pending Approval</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.filter(e => e.status === 'pending').length} expenses</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Approved</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalApproved)}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.filter(e => e.status === 'approved').length} expenses</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Rejected</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalRejected)}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.filter(e => e.status === 'rejected').length} expenses</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total (All)</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalApproved + totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.length} total expenses</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search expenses…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Status:</span>
          {['all', 'pending', 'approved', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Category:</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      </div>


      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expensePagination.paginated.map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{formatDate(expense.date)}</td>
                <td className="px-6 py-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900">{expense.description}</p>
                      {expense.receiptFileName && (
                        <span title={expense.receiptFileName}>
                          {expense.receiptData && expense.receiptData.startsWith('data:image') ? (
                            <img src={expense.receiptData} alt="receipt" className="w-5 h-5 rounded object-cover border border-gray-200 cursor-pointer" onClick={() => window.open(expense.receiptData)} />
                          ) : (
                            <svg className="w-4 h-4 text-green-500 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24" onClick={() => window.open(expense.receiptData)}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                          )}
                        </span>
                      )}
                    </div>
                    {expense.notes && (
                      <p className="text-xs text-gray-500 mt-0.5">{expense.notes}</p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                    <span className="mr-1">{getCategoryIcon(expense.category)}</span>
                    {expense.category}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div>{expense.vendor}</div>
                  {expense.receiptData && (
                    <a href={expense.receiptData} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      Receipt
                    </a>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                  {formatCurrency(expense.amount)}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(expense.status)}`}>
                    {expense.status}
                  </span>
                  {expense.approvedBy && (
                    <p className="text-xs text-gray-400 mt-1">by {expense.approvedBy}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center space-x-1">
                    {expense.status === 'pending' && canApprove && (
                      <>
                        <button
                          onClick={() => handleApprove(expense.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Approve"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleReject(expense.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Reject"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}
                    {(expense.status === 'draft' || expense.status === 'pending') && (
                      <button
                        onClick={() => handleEdit(expense)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                    {expense.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={expensePagination.page}
          pageCount={expensePagination.pageCount}
          onPageChange={expensePagination.setPage}
          total={expensePagination.total}
          pageSize={expensePagination.pageSize}
        />
      </div>

      {/* Modal */}
      {showModal && (
        <ExpenseModal
          expense={editingExpense}
          categories={categories}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingExpense(null);
          }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ expense, categories, accounts, onSave, onClose }) {
  const user = getCurrentUser();
  const expenseAccounts = accounts.filter(a => a.type === 'expense');

  const [formData, setFormData] = useState(expense || {
    description: '',
    category: 'transportation',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    status: 'pending',
    approvedBy: null,
    accountId: expenseAccounts[0]?.id || '',
    receipt: false,
    receiptData: null,
    receiptName: null,
    receiptSize: null,
    notes: '',
    createdBy: user?.role
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {expense ? 'Edit Expense' : 'Add New Expense'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Fuel for delivery trucks"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <input
                type="text"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., PetroFuel Station"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expense Account</label>
            <select
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {expenseAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Attachment</label>
            {formData.receiptFileName ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-sm text-green-700 flex-1 truncate">{formData.receiptFileName}</span>
                <button type="button" onClick={() => setFormData({ ...formData, receiptData: null, receiptFileName: null, receipt: false })}
                  className="text-red-400 hover:text-red-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <div className="text-center">
                  <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-gray-500">Click to upload image or PDF</p>
                </div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { alert('File too large. Max 2 MB.'); return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => setFormData({ ...formData, receiptData: ev.target.result, receiptFileName: file.name, receipt: true });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows="2"
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
              {expense ? 'Update' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}