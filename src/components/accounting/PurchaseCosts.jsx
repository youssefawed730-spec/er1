// components/accounting/PurchaseCosts.jsx
import React, { useState, useEffect } from 'react';
import { 
  getPurchaseCosts, savePurchaseCost, confirmPurchaseCost, 
  getQuotations, getCurrentUser, hasPermission, getCompanies,
  subscribeToEvents
} from '../../data/store';

export default function PurchaseCosts() {
  const [purchaseCosts, setPurchaseCosts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCost, setEditingCost] = useState(null);
  const user = getCurrentUser();

  useEffect(() => {
    loadData();
    const unsub = subscribeToEvents((e) => {
      if (['purchaseCost_saved','purchaseCost_confirmed','purchaseCost_updated','payment_saved','payment_deleted'].includes(e.type)) {
        loadData();
      }
    });
    return unsub;
  }, []);

  const loadData = () => {
    getPurchaseCosts().then(setPurchaseCosts).catch(()=>{});
    getQuotations().then(setQuotations).catch(()=>{});
    getCompanies().then(data => setVendors(data.filter(c => c.type === 'vendor'))).catch(()=>{});
  };

  const canCreate  = hasPermission(user?.role, 'purchaseCosts', 'write') || user?.role === 'accounting' || user?.role === 'head_of_accounting' || user?.role === 'admin';
  const canConfirm = hasPermission(user?.role, 'purchaseCosts', 'confirm') || user?.role === 'head_of_accounting' || user?.role === 'admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const handleSave = (purchaseCost) => {
    savePurchaseCost(purchaseCost);
    loadData();
    setShowModal(false);
    setEditingCost(null);
  };

  const handleConfirm = (id) => {
    confirmPurchaseCost(id, user?.role);
    loadData();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusColor = (status) => {
    return status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
  };

  const totalPending   = purchaseCosts.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);
  const totalConfirmed = purchaseCosts.filter(c => c.status === 'confirmed').reduce((sum, c) => sum + c.amount, 0);
  const totalProfit    = purchaseCosts.reduce((sum, c) => sum + (Number(c.profit) || 0), 0);

  const filteredCosts = purchaseCosts.filter(c => {
    const statusMatch = filterStatus === 'all' || c.status === filterStatus;
    const searchMatch = !searchTerm.trim() || (() => {
      const q = searchTerm.toLowerCase();
      const quotation = quotations.find(qt => qt.id === c.quotationId);
      return (
        c.description?.toLowerCase().includes(q) ||
        c.vendor?.toLowerCase().includes(q) ||
        c.status?.toLowerCase().includes(q) ||
        quotation?.number?.toLowerCase().includes(q) ||
        String(c.amount || '').includes(q)
      );
    })();
    return statusMatch && searchMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Costs</h1>
          <p className="text-gray-500">Track costs associated with quotations and orders</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setEditingCost(null);
              setShowModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Purchase Cost
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Purchase Costs</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPending + totalConfirmed)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Pending Confirmation</p>
          <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Confirmed</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(totalConfirmed)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Profit</p>
          <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalProfit)}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search purchase costs…"
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
        <div className="flex items-center gap-2">
          {['all', 'pending', 'confirmed'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Purchase Costs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Quotation</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Bill #</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Buy Price</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Sell Price</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCosts.map((cost) => {
              const quotation = quotations.find(q => q.id === cost.quotationId);
              const buyPrice  = Number(cost.buyPrice  || cost.amount || 0);
              const sellPrice = Number(cost.sellPrice || 0);
              const profit    = Number(cost.profit != null ? cost.profit : (sellPrice > 0 ? sellPrice - buyPrice : null));
              return (
                <tr key={cost.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900">{quotation?.number || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{cost.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div>{cost.vendor}</div>
                    {cost.vendorBillNumber && (
                      <div className="text-xs text-blue-600 font-mono mt-0.5" title="Vendor Bill #"># {cost.vendorBillNumber}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{formatCurrency(buyPrice)}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    {sellPrice > 0 ? formatCurrency(sellPrice) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    {sellPrice > 0
                      ? <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(profit)}</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(cost.status)}`}>
                      {cost.status}
                    </span>
                    {cost.confirmedBy && (
                      <p className="text-xs text-gray-400 mt-1">by {cost.confirmedBy}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-1">
                      {canCreate && (
                        <button
                          onClick={() => { setEditingCost(cost); setShowModal(true); }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {cost.status === 'pending' && canConfirm && (
                        <button
                          onClick={() => handleConfirm(cost.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Confirm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredCosts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">No purchase costs found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <PurchaseCostModal
          purchaseCost={editingCost}
          quotations={quotations}
          vendors={vendors}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingCost(null);
          }}
        />
      )}
    </div>
  );
}

function PurchaseCostModal({ purchaseCost, quotations, vendors = [], onSave, onClose }) {
  const user = getCurrentUser();

  const [formData, setFormData] = useState(purchaseCost || {
    quotationId: '',
    description: '',
    amount: 0,
    buyPrice: 0,
    sellPrice: 0,
    profit: 0,
    vendor: '',
    vendorId: '',
    vendorBillNumber: '',
    status: 'pending',
    createdBy: user?.role
  });

  // Auto-compute profit when buyPrice or sellPrice changes
  const handlePriceChange = (field, value) => {
    const numVal = parseFloat(value) || 0;
    const updated = { ...formData, [field]: numVal };
    const buy  = field === 'buyPrice'  ? numVal : (Number(updated.buyPrice)  || 0);
    const sell = field === 'sellPrice' ? numVal : (Number(updated.sellPrice) || 0);
    updated.profit = sell - buy;
    // keep amount in sync with buyPrice (cost to us)
    updated.amount = buy;
    setFormData(updated);
  };

  const handleVendorChange = (vendorId) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setFormData(prev => ({
      ...prev,
      vendorId,
      vendor: vendor ? vendor.name : prev.vendor,
      vendorName: vendor ? vendor.name : prev.vendorName,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const profit = (Number(formData.sellPrice) || 0) - (Number(formData.buyPrice) || 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {purchaseCost ? 'Edit Purchase Cost' : 'Add Purchase Cost'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quotation <span className="text-gray-400 font-normal">(optional)</span></label>
            <select
              value={formData.quotationId}
              onChange={(e) => setFormData({ ...formData, quotationId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">— No Quotation —</option>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>{q.number} - {q.customerName}</option>
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
              placeholder="e.g., Raw materials, shipping costs"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor Bill / Invoice Reference #
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.vendorBillNumber || ''}
              onChange={(e) => setFormData({ ...formData, vendorBillNumber: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., INV-2024-0042"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            {vendors.length > 0 ? (
              <>
                <select
                  value={formData.vendorId || ''}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select Vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                {!formData.vendorId && (
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mt-2"
                    placeholder="Or type vendor name manually"
                  />
                )}
              </>
            ) : (
              <input
                type="text"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Vendor name"
                required
              />
            )}
          </div>

          {/* Buy / Sell / Profit row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buy Price ($)</label>
              <input
                type="number"
                value={formData.buyPrice ?? formData.amount ?? 0}
                onChange={(e) => handlePriceChange('buyPrice', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.01"
                min="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sell Price ($)</label>
              <input
                type="number"
                value={formData.sellPrice ?? 0}
                onChange={(e) => handlePriceChange('sellPrice', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Profit preview */}
          <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${profit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <span className={`text-sm font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>Profit</span>
            <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(profit)}
            </span>
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
