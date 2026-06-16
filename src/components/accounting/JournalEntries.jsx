import React, { useState, useEffect } from 'react';
import { getJournalEntries, saveJournalEntry, deleteJournalEntry, postJournalEntry, getAccounts, getCurrentUser, hasPermission, subscribeToEvents } from '../../data/store';

export default function JournalEntries() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewEntry, setViewEntry] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const user = getCurrentUser();
  const canWrite  = hasPermission(user?.role, 'journalEntries', 'write');
  const canPost   = hasPermission(user?.role, 'journalEntries', 'post');
  const canDelete = hasPermission(user?.role, 'journalEntries', 'delete') || user?.role === 'admin';

  const loadData = () => {
    getJournalEntries().then(setEntries).catch(() => {});
    getAccounts().then(setAccounts).catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      if (['journal_posted', 'journal_saved', 'invoice_confirmed', 'payment_saved',
           'expense_approved', 'purchaseCost_confirmed'].includes(event.type)) {
        loadData();
      }
    });
    return unsub;
  }, []);

  const handleSave = (entry) => {
    saveJournalEntry(entry).then(() => loadData()).catch(() => {});

    setShowModal(false);
    setEditingEntry(null);
  };

  const handleDelete = (id) => {
    const entry = entries.find(e => e.id === id);
    if (entry?.isPosted) {
      alert('Cannot delete a posted journal entry');
      return;
    }
    if (confirm('Are you sure you want to delete this journal entry?')) {
      deleteJournalEntry(id).then(() => loadData()).catch(() => {});
    }
  };

  const handlePost = (id) => {
    postJournalEntry(id).then(() => loadData()).catch(() => {});
  };

  const handleEdit = (entry) => {
    if (entry.isPosted) {
      alert('Cannot edit a posted journal entry');
      return;
    }
    setEditingEntry(entry);
    setShowModal(true);
  };

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

  const getTotalDebits = (entry) => entry.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const getTotalCredits = (entry) => entry.entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  const isBalanced = (entry) => Math.abs(getTotalDebits(entry) - getTotalCredits(entry)) < 0.01;

  // Calculate totals
  const postedEntries = entries.filter(e => e.isPosted);
  const draftEntries = entries.filter(e => !e.isPosted);

  const filteredEntries = searchTerm.trim() ? (() => {
    const q = searchTerm.toLowerCase();
    return entries.filter(e =>
      e.reference?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.entries?.some(line => line.accountName?.toLowerCase().includes(q)) ||
      (e.isPosted ? 'posted' : 'draft').includes(q)
    );
  })() : entries;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal Entries</h1>
          <p className="text-gray-500">Double-entry accounting with balanced transactions</p>
        </div>
        {canWrite && (
        <button
          onClick={() => {
            setEditingEntry(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Journal Entry
        </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Entries</p>
          <p className="text-xl font-bold text-gray-900">{entries.length}</p>
          <p className="text-xs text-gray-400 mt-1">All journal entries</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Posted Entries</p>
          <p className="text-xl font-bold text-green-600">{postedEntries.length}</p>
          <p className="text-xs text-gray-400 mt-1">Recorded in ledger</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Draft Entries</p>
          <p className="text-xl font-bold text-yellow-600">{draftEntries.length}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting posting</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search journal entries…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {/* Journal Entries Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Debits</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Credits</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredEntries.map((entry) => {
              const debits = getTotalDebits(entry);
              const credits = getTotalCredits(entry);
              const balanced = isBalanced(entry);
              return (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{formatDate(entry.date)}</td>
                  <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{entry.reference}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{formatCurrency(debits)}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{formatCurrency(credits)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                      entry.isPosted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {entry.isPosted ? 'Posted' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => setViewEntry(entry)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      {!entry.isPosted && (
                        <>
                          {canWrite && (
                          <button
                            onClick={() => handleEdit(entry)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          )}
                          {canPost && (
                          <button
                            onClick={() => handlePost(entry.id)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Post Entry"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          )}
                          {canDelete && (
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <JournalEntryModal
          entry={editingEntry}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingEntry(null);
          }}
        />
      )}

      {/* View Modal */}
      {viewEntry && (
        <JournalEntryViewModal
          entry={viewEntry}
          accounts={accounts}
          onClose={() => setViewEntry(null)}
        />
      )}
    </div>
  );
}

function JournalEntryModal({ entry, accounts, onSave, onClose }) {
  const user = getCurrentUser();
  const [formData, setFormData] = useState(entry || {
    date: new Date().toISOString().split('T')[0],
    description: '',
    entries: [
      { accountId: '', accountName: '', debit: 0, credit: 0 },
      { accountId: '', accountName: '', debit: 0, credit: 0 }
    ],
    createdBy: user?.role,
    isPosted: false
  });

  const [currentEntry, setCurrentEntry] = useState({
    accountId: '',
    debit: 0,
    credit: 0
  });

  const addEntry = () => {
    if (!currentEntry.accountId) return;
    if (currentEntry.debit === 0 && currentEntry.credit === 0) return;

    const account = accounts.find(a => a.id === currentEntry.accountId);
    const newEntry = {
      ...currentEntry,
      accountName: account?.name || ''
    };

    setFormData({
      ...formData,
      entries: [...formData.entries, newEntry]
    });
    setCurrentEntry({ accountId: '', debit: 0, credit: 0 });
  };

  const removeEntry = (index) => {
    const newEntries = formData.entries.filter((_, i) => i !== index);
    setFormData({ ...formData, entries: newEntries });
  };

  const updateEntry = (index, field, value) => {
    const newEntries = [...formData.entries];
    if (field === 'accountId') {
      const account = accounts.find(a => a.id === value);
      newEntries[index] = { ...newEntries[index], accountId: value, accountName: account?.name || '' };
    } else {
      newEntries[index] = { ...newEntries[index], [field]: parseFloat(value) || 0 };
    }
    setFormData({ ...formData, entries: newEntries });
  };

  const handleAccountChange = (accountId) => {
    const account = accounts.find(a => a.id === accountId);
    setCurrentEntry({
      ...currentEntry,
      accountId,
      accountName: account?.name || ''
    });
  };

  const totalDebits = formData.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredits = formData.entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  // Local formatter — `formatCurrency` from the parent component is not in
  // scope inside this child component, so without this the totals row throws.
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isBalanced) {
      alert('Journal entry must be balanced (debits must equal credits)');
      return;
    }
    if (formData.entries.length < 2) {
      alert('Journal entry must have at least 2 entries');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {entry ? 'Edit Journal Entry' : 'Create Journal Entry'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Record invoice revenue"
                required
              />
            </div>
          </div>

          {/* Entry Lines */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Journal Entries</h3>
            <table className="w-full mb-4">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Account</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {formData.entries.map((entry, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 text-sm">{entry.accountName}</td>
                    <td className="px-4 py-2 text-right text-sm">
                      {entry.debit > 0 ? `$${entry.debit.toFixed(2)}` : ''}
                    </td>
                    <td className="px-4 py-2 text-right text-sm">
                      {entry.credit > 0 ? `$${entry.credit.toFixed(2)}` : ''}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-2 font-medium">Total</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(totalDebits)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(totalCredits)}</td>
                  <td></td>
                </tr>
                {!isBalanced && (
                  <tr>
                    <td colSpan="4" className="px-4 py-2 text-red-600 text-sm text-center">
                      Entry is NOT balanced. Debits must equal credits.
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            {/* Add Entry Line */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <select
                  value={currentEntry.accountId}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  placeholder="Debit"
                  value={currentEntry.debit || ''}
                  onChange={(e) => setCurrentEntry({ ...currentEntry, debit: parseFloat(e.target.value) || 0, credit: 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  placeholder="Credit"
                  value={currentEntry.credit || ''}
                  onChange={(e) => setCurrentEntry({ ...currentEntry, credit: parseFloat(e.target.value) || 0, debit: 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  step="0.01"
                  min="0"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={addEntry}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
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
              disabled={!isBalanced}
              className={`flex-1 px-4 py-2 rounded-lg ${
                isBalanced ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {entry ? 'Update Entry' : 'Create Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function JournalEntryViewModal({ entry, accounts, onClose }) {
  const totalDebits = entry.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredits = entry.entries.reduce((sum, e) => sum + (e.credit || 0), 0);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{entry.reference}</h2>
            <p className="text-sm text-gray-500">{formatDate(entry.date)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          <p className="text-lg font-medium text-gray-900 mb-4">{entry.description}</p>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entry.entries.map((e, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm font-medium">{e.accountName}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {e.debit > 0 ? formatCurrency(e.debit) : ''}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {e.credit > 0 ? formatCurrency(e.credit) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-3 font-bold">Total</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(totalDebits)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className={`px-3 py-1 rounded-full ${
              entry.isPosted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {entry.isPosted ? 'Posted' : 'Draft'}
            </span>
            <span className="text-gray-500">Created by: {entry.createdBy}</span>
          </div>
        </div>
      </div>
    </div>
  );
}