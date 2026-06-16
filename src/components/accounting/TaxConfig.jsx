import React, { useState, useEffect } from 'react';
import { getTaxConfigs, saveTaxConfig, deleteTaxConfig, getCurrentUser, hasPermission } from '../../data/store';

export default function TaxConfig() {
  const [configs, setConfigs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const user = getCurrentUser();
  const canWrite  = hasPermission(user?.role, 'taxConfig', 'write');
  const canDelete = hasPermission(user?.role, 'taxConfig', 'delete') || user?.role === 'admin';

  const loadData = () => { getTaxConfigs().then(setConfigs).catch(() => {}); };
  useEffect(() => { loadData(); }, []);

  const handleSave = (config) => {
    saveTaxConfig(config).then(() => loadData()).catch(() => {});
    setShowModal(false);
    setEditingConfig(null);
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this tax configuration?')) {
      deleteTaxConfig(id).then(() => loadData()).catch(() => {});
    }
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setShowModal(true);
  };

  const handleSetDefault = (id) => {
    const updatedConfigs = configs.map(c => ({
      ...c,
      isDefault: c.id === id
    }));
    Promise.all(updatedConfigs.map(c => saveTaxConfig(c))).then(() => loadData()).catch(() => {});
  };

  const getTypeColor = (type) => {
    return type === 'percentage' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Configurations</h1>
          <p className="text-gray-500">Manage tax rates and configurations</p>
        </div>
        {canWrite && (
        <button
          onClick={() => {
            setEditingConfig(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Tax Config
        </button>
        )}
      </div>

      {/* Tax Configs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {configs.map((config) => (
          <div
            key={config.id}
            className={`bg-white rounded-xl shadow-sm border-2 ${
              config.isDefault ? 'border-blue-500' : 'border-gray-100'
            } p-6`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getTypeColor(config.type)}`}>
                  {config.type}
                </span>
                {config.isDefault && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                    Default
                  </span>
                )}
              </div>
              <div className="flex space-x-1">
                {canWrite && (
                <button
                  onClick={() => handleEdit(config)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                )}
                {canDelete && (
                <button
                  onClick={() => handleDelete(config.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                )}
              </div>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">{config.name}</h3>
            <p className="text-gray-500 text-sm mb-4">{config.description}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-gray-500">Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {config.type === 'percentage' ? `${config.rate}%` : `$${config.rate}`}
                </p>
              </div>
              {!config.isDefault && canWrite && (
                <button
                  onClick={() => handleSetDefault(config.id)}
                  className="px-3 py-1.5 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Set as Default
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-900">How Tax Configuration Works</h4>
            <p className="text-sm text-blue-700 mt-1">
              Tax configurations are used when creating invoices. The default tax rate will be automatically applied to new invoices.
              You can have multiple tax rates for different items or regions.
            </p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <TaxConfigModal
          config={editingConfig}
          onSave={handleSave}
          onClose={() => {
            setShowModal(false);
            setEditingConfig(null);
          }}
        />
      )}
    </div>
  );
}

function TaxConfigModal({ config, onSave, onClose }) {
  const [formData, setFormData] = useState(config || {
    name: '',
    type: 'percentage',
    rate: 10,
    isDefault: false,
    description: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {config ? 'Edit Tax Configuration' : 'Add Tax Configuration'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Sales Tax (10%)"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="percentage"
                  checked={formData.type === 'percentage'}
                  onChange={() => setFormData({ ...formData, type: 'percentage' })}
                  className="mr-2"
                />
                <span className="text-sm">Percentage (%)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="fixed"
                  checked={formData.type === 'fixed'}
                  onChange={() => setFormData({ ...formData, type: 'fixed' })}
                  className="mr-2"
                />
                <span className="text-sm">Fixed ($)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate ({formData.type === 'percentage' ? '%' : '$'})
            </label>
            <input
              type="number"
              value={formData.rate}
              onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              step={formData.type === 'percentage' ? '0.1' : '1'}
              min="0"
              required
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm">Set as default tax rate</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows="2"
              placeholder="Brief description of this tax configuration"
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