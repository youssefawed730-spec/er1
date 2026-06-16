// components/operations/CostItems.jsx
import React, { useState, useEffect } from 'react';
import { 
  getCostItems, saveCostItem, deleteCostItem, approveCostItem,
  getOpportunities, getCurrentUser, hasPermission, subscribeToEvents
} from '../../data/store';

export default function CostItems() {
  const [costItems, setCostItems] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCostItem, setEditingCostItem] = useState(null);
  const user = getCurrentUser();

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      if (['costItem_saved', 'costItem_approved', 'costItem_deleted'].includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    getCostItems().then(setCostItems).catch(()=>{});
    getOpportunities().then(data => setOpportunities(data.filter(o => o.stage !== 'closed_lost'))).catch(()=>{});
  };

  const canCreate = user?.role === 'operation' || user?.role === 'admin';
  const canApprove = hasPermission(user?.role, 'costItems', 'approve') || user?.role === 'head_of_accounting';

  const handleSave = (costItem) => {
    saveCostItem(costItem);
    loadData();
    setShowModal(false);
    setEditingCostItem(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this cost item?')) {
      deleteCostItem(id);
      loadData();
    }
  };

  const handleApprove = (id, status) => {
    approveCostItem(id, status, user?.role);
    loadData();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  const categories = [
    { value: 'transport', label: 'Transportation' },
    { value: 'storage', label: 'Storage/Warehousing' },
    { value: 'labor', label: 'Labor' },
    { value: 'materials', label: 'Materials' },
    { value: 'other', label: 'Other' }
  ];

  const getCategoryLabel = (value) => {
    return categories.find(c => c.value === value)?.label || value;
  };

  const totalPending = costItems.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);
  const totalApproved = costItems.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Items</h1>
          <p className="text-gray-500">Manage project and opportunity costs</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditingCostItem(null);
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Cost Item
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Costs</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPending + totalApproved)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Pending Approval</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Approved</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalApproved)}</p>
        </div>
      </div>

      {/* Cost Items Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Opportunity</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {costItems.map((item) => {
              const opportunity = opportunities.find(o => o.id === item.opportunityId);
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{item.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{opportunity?.title || '-'}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                      {getCategoryLabel(item.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{item.vendor}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(item.amount)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                    {item.approvedBy && (
                      <p className="text-xs text-gray-400 mt-1">by {item.approvedBy}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-1">
                      {item.status === 'pending' && canApprove && (
                        <>
                          <button
                            onClick={() => handleApprove(item.id, 'approved')}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Approve"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleApprove(item.id, 'rejected')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      )}
                      {canCreate && item.status === 'pending' && (
                        <>
                          <button
                            onClick={() => {
                              setEditingCostItem(item);
                              setShowModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
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
        <CostItemModal
          costItem={editingCostItem}
          opportunities={opportunities}
          categories={categories}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingCostItem(null);
          }}
        />
      )}
    </div>
  );
}

function CostItemModal({ costItem, opportunities, categories, onSave, onClose }) {
  const user = getCurrentUser();

  const [formData, setFormData] = useState(costItem || {
    opportunityId: '',
    description: '',
    amount: 0,
    category: 'other',
    vendor: '',
    status: 'pending',
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
          {costItem ? 'Edit Cost Item' : 'Add Cost Item'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opportunity</label>
            <select
              value={formData.opportunityId}
              onChange={(e) => setFormData({ ...formData, opportunityId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select Opportunity</option>
              {opportunities.map((opp) => (
                <option key={opp.id} value={opp.id}>{opp.title} - {opp.customerName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Shipping costs, raw materials"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <input
              type="text"
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Vendor/supplier name"
              required
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
              {costItem ? 'Update' : 'Add Cost Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}