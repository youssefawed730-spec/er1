// components/crm/Companies.jsx
import React, { useState, useEffect } from 'react';
import Pagination, { usePagination } from '../common/Pagination';
import { useNavigate } from 'react-router-dom';
import {
  getCompanies, getVisibleCompanies, saveCompany, deleteCompany,
  getCompanyContacts, saveCompanyContact, deleteCompanyContact,
  getUsers, getCurrentUser, hasPermission,
  canManageCompany, canManageCompanyContact, isCompanyOwner,
  getCustomContactSources, saveCustomContactSource, deleteCustomContactSource,
  getCompanyAttachments, saveCompanyAttachment, deleteCompanyAttachment,
  getOpportunities, saveOpportunity, subscribeToEvents
} from '../../data/store';
import { useTranslation } from '../../i18n';

const industrialSectors = [
  'Technology', 'Manufacturing', 'Retail', 'Healthcare', 'Construction',
  'Transportation', 'Energy', 'Agriculture', 'Finance', 'Education',
  'Hospitality', 'Logistics', 'Real Estate', 'Telecommunications', 'Other'
];

const contactSources = [
  'Website', 'Referral', 'Trade Show', 'Cold Call', 'Social Media',
  'Email Campaign', 'Partner', 'Existing Customer', 'Other'
];


export default function Companies() {
  const { t, isRTL } = useTranslation();
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [filterType, setFilterType] = useState('all');     // all | customer | vendor
  const [filterKind, setFilterKind] = useState('all');     // all | company | person
  const [searchTerm, setSearchTerm] = useState('');        // text search
  const [defaultKind, setDefaultKind] = useState('company'); // for the modal
  const [salesmen, setSalesmen] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [customContactSources, setCustomContactSources] = useState([]);
  const [companyAttachments, setCompanyAttachments] = useState([]);
  const [allOpportunities, setAllOpportunities] = useState([]);
  const [allContactsMap, setAllContactsMap] = useState({});  // { [companyId]: contact[] }
  const navigate = useNavigate();
  // Quick-action for salesmen clicking a company card
  const [quickActionCompany, setQuickActionCompany] = useState(null);
  // Bulk-assign state (contact role)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkSalesmanId, setBulkSalesmanId] = useState('');
  // View mode: 'cards' | 'list' | 'table'
  const [viewMode, setViewMode] = useState('cards');
  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [pendingCompany, setPendingCompany] = useState(null);
  const user = getCurrentUser();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      if (['company_created', 'company_updated', 'company_deleted',
           'invoice_confirmed', 'payment_saved', 'payment_deleted',
           'opportunity_saved', 'opportunity_deleted'].includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    getVisibleCompanies(user).then(setCompanies).catch(()=>{});
    getUsers().then(users => {
      setSalesmen(users.filter(u => u.role === 'sales'));
      setAllEmployees(users.filter(u => u.role !== 'contact'));
    }).catch(()=>{});
    getCustomContactSources().then(setCustomContactSources).catch(()=>{});
    getOpportunities().then(setAllOpportunities).catch(()=>{});
    getVisibleCompanies(user).then(visibleCompanies => {
      Promise.all(visibleCompanies.map(c =>
        getCompanyContacts(c.id).then(contacts => ({ id: c.id, contacts })).catch(() => ({ id: c.id, contacts: [] }))
      )).then(results => {
        const map = {};
        results.forEach(({ id, contacts }) => { map[id] = contacts; });
        setAllContactsMap(map);
      });
    }).catch(()=>{});
  };

  const canCreate = hasPermission(user?.role, 'companies', 'write');

  const _commitSaveCompany = (company) => {
    saveCompany(company);
    loadData();
    setShowCompanyModal(false);
    setEditingCompany(null);
    setDuplicateWarning(null);
    setPendingCompany(null);
  };

  const handleSaveCompany = (company) => {
    if (!company.id) {
      const nameLower = company.name?.toLowerCase().trim();
      const dupes = companies.filter(
        c => c.name?.toLowerCase().trim() === nameLower
      );
      if (dupes.length > 0) {
        setDuplicateWarning(dupes);
        setPendingCompany(company);
        setShowCompanyModal(false);
        return;
      }
    }
    _commitSaveCompany(company);
  };

  const handleDeleteCompany = (id) => {
    if (!canManageCompany(user, id, 'delete') && !canManageCompany(user, id, 'write')) return;
    if (confirm(t('companies.deleteCompany'))) {
      deleteCompany(id);
      loadData();
    }
  };

  // Bulk-assign helpers (for contact role)
  const filteredCompanies = companies.filter((c) => {
    const kindOK   = filterKind === 'all' ? true : (c.kind || 'company') === filterKind;
    const typeOK   = filterType === 'all' ? true : c.type === filterType;
    const searchOK = !searchTerm.trim() || (() => {
      const q = searchTerm.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.country?.toLowerCase().includes(q) ||
        c.taxId?.toLowerCase().includes(q)
      );
    })();
    return kindOK && typeOK && searchOK;
  });

  const companyPagination = usePagination(filteredCompanies, 50);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCompanies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(companyPagination.paginated.map(c => c.id)));
    }
  };

  const handleBulkAssign = () => {
    if (!bulkSalesmanId || selectedIds.size === 0) return;
    selectedIds.forEach(id => {
      const company = companies.find(c => c.id === id);
      if (company) saveCompany({ ...company, assignedTo: bulkSalesmanId });
    });
    setSelectedIds(new Set());
    setBulkSalesmanId('');
    loadData();
  };

  const customers = companies.filter(c => c.type === 'customer');
  const vendors   = companies.filter(c => c.type === 'vendor');

  const totalCustomerBalance = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
  const totalVendorBalance   = vendors.reduce((sum, c) => sum + (c.balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('companies.title')}</h1>
          <p className="text-gray-500">{t('companies.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDefaultKind('company');
                setEditingCompany(null);
                setShowCompanyModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <svg className={`w-5 h-5 ${isRTL ? 'ml-2' : 'mr-2'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('companies.addCompany')}
            </button>
            <button
              onClick={() => {
                setDefaultKind('person');
                setEditingCompany(null);
                setShowCompanyModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center"
            >
              <svg className={`w-5 h-5 ${isRTL ? 'ml-2' : 'mr-2'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {t('companies.addPerson')}
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">{t('companies.totalCustomers')}</p>
          <p className="text-xl font-bold text-blue-600">{customers.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">{t('companies.totalVendors')}</p>
          <p className="text-xl font-bold text-purple-600">{vendors.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">{t('companies.customerAR')}</p>
          <p className="text-xl font-bold text-green-600">${totalCustomerBalance.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">{t('companies.vendorAP')}</p>
          <p className="text-xl font-bold text-red-600">${totalVendorBalance.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('companies.searchPlaceholder') || 'Search companies…'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <span className="mx-1 text-gray-300">|</span>
        {[
          { v: 'all',      label: t('companies.filter.all') },
          { v: 'customer', label: t('companies.filter.customer') },
          { v: 'vendor',   label: t('companies.filter.vendor') }
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setFilterType(opt.v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterType === opt.v
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="mx-2 text-gray-300">|</span>
        {[
          { v: 'all',     label: t('companies.filter.all') },
          { v: 'company', label: t('companies.filter.company') },
          { v: 'person',  label: t('companies.filter.person') }
        ].map((opt) => (
          <button
            key={'k_' + opt.v}
            onClick={() => setFilterKind(opt.v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterKind === opt.v
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Empty-state hint for the contact role */}
      {filteredCompanies.length === 0 && user?.role === 'contact' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 text-sm">
          {t('companies.empty.contact')}
        </div>
      )}

      {/* Bulk-assign toolbar — contact role only */}
      {user?.role === 'contact' && filteredCompanies.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-blue-600 rounded border-gray-300"
            />
            {selectedIds.size === 0
              ? 'Select All'
              : `${selectedIds.size} selected`}
          </label>
          {selectedIds.size > 0 && (
            <>
              <select
                value={bulkSalesmanId}
                onChange={e => setBulkSalesmanId(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">— Assign to salesman —</option>
                {salesmen.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkSalesmanId}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium mr-1">View:</span>
        {[
          { mode: 'cards', label: 'Cards', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
          { mode: 'list',  label: 'List',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg> },
          { mode: 'table', label: 'Table', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></svg> },
        ].map(({ mode, label, icon }) => (
          <button key={mode} onClick={() => setViewMode(mode)} title={label}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors ${
              viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Companies / Persons — Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {user?.role === 'contact' && (
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox"
                      checked={selectedIds.size === filteredCompanies.length && filteredCompanies.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Kind</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Industry</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Phone</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Assigned To</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Balance</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredCompanies.map((company) => {
                const salesman = salesmen.find(s => s.id === company.assignedTo);
                const isPerson = (company.kind || 'company') === 'person';
                const canEditThis = canManageCompany(user, company, 'write');
                const canDeleteThis = canManageCompany(user, company, 'delete') || canEditThis;
                return (
                  <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                    {user?.role === 'contact' && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(company.id)}
                          onChange={() => toggleSelect(company.id)}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer" />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-gray-900">{company.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${isPerson ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                        {isPerson ? t('companies.kind.person') : t('companies.kind.company')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${company.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {t('companies.kind.' + (company.type || 'customer'))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{company.industrialSector || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{company.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{company.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{salesman?.name || t('companies.unassigned')}</td>
                    <td className="px-4 py-3 font-medium text-gray-700">${(company.balance || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEditThis && (
                          <button onClick={() => { setEditingCompany(company); setDefaultKind(company.kind || 'company'); setShowCompanyModal(true); }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title={t('common.edit')}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                        )}
                        {canDeleteThis && (
                          <button onClick={() => handleDeleteCompany(company.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title={t('common.delete')}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredCompanies.length === 0 && (
            <p className="text-center text-gray-400 py-10">No companies found.</p>
          )}
        </div>
      )}

      {/* Companies / Persons — List View */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {filteredCompanies.length === 0 && (
            <p className="text-center text-gray-400 py-10">No companies found.</p>
          )}
          {filteredCompanies.map((company) => {
            const salesman = salesmen.find(s => s.id === company.assignedTo);
            const isPerson = (company.kind || 'company') === 'person';
            const ownsThis = isCompanyOwner(user, company);
            const canEditThis = canManageCompany(user, company, 'write');
            const canDeleteThis = canManageCompany(user, company, 'delete') || canEditThis;
            const listOppCount = allOpportunities.filter(o => o.companyId === company.id || o.customerId === company.id).length;
            return (
              <div key={company.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-4">
                {user?.role === 'contact' && (
                  <input type="checkbox" checked={selectedIds.has(company.id)}
                    onChange={() => toggleSelect(company.id)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 flex-shrink-0 cursor-pointer" />
                )}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${isPerson ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                  {company.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    {user?.role === 'sales' ? (
                      <button onClick={() => setQuickActionCompany(company)} className="font-semibold text-blue-700 hover:underline truncate">{company.name}</button>
                    ) : (
                      <span className="font-semibold text-gray-900 truncate">{company.name}</span>
                    )}
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${company.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {t('companies.kind.' + (company.type || 'customer'))}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${isPerson ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                      {isPerson ? t('companies.kind.person') : t('companies.kind.company')}
                    </span>
                    {ownsThis && user?.role === 'contact' && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 flex-shrink-0">{t('companies.ownedByYou')}</span>
                    )}
                    {listOppCount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate('/opportunities', { state: { filterCompanyId: company.id, filterCompanyName: company.name } }); }}
                        className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0 hover:bg-indigo-200 transition-colors cursor-pointer flex items-center gap-1"
                        title={`View opportunities for ${company.name}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        {listOppCount} opp{listOppCount > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-500 flex-wrap">
                    {company.email && <span>{company.email}</span>}
                    {company.phone && <span>{company.phone}</span>}
                    {company.industrialSector && <span>{company.industrialSector}</span>}
                    {salesman && <span>→ {salesman.name}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right hidden sm:block">
                  <p className="text-xs text-gray-400">Balance</p>
                  <p className="font-semibold text-gray-700">${(company.balance || 0).toLocaleString()}</p>
                </div>
                {(canEditThis || canDeleteThis) && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {canEditThis && (
                      <button onClick={() => { setEditingCompany(company); setDefaultKind(company.kind || 'company'); setShowCompanyModal(true); }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title={t('common.edit')}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                    {canDeleteThis && (
                      <button onClick={() => handleDeleteCompany(company.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title={t('common.delete')}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Companies / Persons Grid — Cards View */}
      {viewMode === 'cards' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredCompanies.map((company) => {
          const companyContacts = allContactsMap[company.id] || [];
          const salesman = salesmen.find(s => s.id === company.assignedTo);
          const isPerson = (company.kind || 'company') === 'person';
          const ownsThis = isCompanyOwner(user, company);
          const canEditThis = canManageCompany(user, company, 'write');
          const canDeleteThis = canManageCompany(user, company, 'delete') || canEditThis;
          const canManageContactsHere = canManageCompanyContact(user, company.id);
          const companyOppCount = allOpportunities.filter(o => o.companyId === company.id || o.customerId === company.id).length;

          return (
            <div key={company.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Checkbox for bulk-assign (contact role only) */}
                    {user?.role === 'contact' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(company.id)}
                        onChange={() => toggleSelect(company.id)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 flex-shrink-0 cursor-pointer"
                      />
                    )}
                  <div className="flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      {user?.role === 'sales' ? (
                        <button
                          onClick={() => setQuickActionCompany(company)}
                          className="text-lg font-bold text-blue-700 hover:text-blue-900 hover:underline text-left"
                        >
                          {company.name}
                        </button>
                      ) : (
                        <h3 className="text-lg font-bold text-gray-900">{company.name}</h3>
                      )}
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        company.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {t('companies.kind.' + (company.type || 'customer'))}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        isPerson ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {isPerson ? t('companies.kind.person') : t('companies.kind.company')}
                      </span>
                      {ownsThis && user?.role === 'contact' && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          {t('companies.ownedByYou')}
                        </span>
                      )}
                      {companyOppCount > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate('/opportunities', { state: { filterCompanyId: company.id, filterCompanyName: company.name } }); }}
                          className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1 hover:bg-indigo-200 transition-colors cursor-pointer"
                          title={`View all opportunities for ${company.name}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                          {companyOppCount} {companyOppCount === 1 ? 'opportunity' : 'opportunities'}
                        </button>
                      )}
                    </div>
                    {!isPerson && <p className="text-sm text-gray-500 mt-1">{company.industrialSector}</p>}
                  </div>
                  </div>
                  {(canEditThis || canDeleteThis) && (
                    <div className="flex space-x-1 rtl:space-x-reverse">
                      {canEditThis && (
                        <button
                          onClick={() => {
                            setEditingCompany(company);
                            setDefaultKind(company.kind || 'company');
                            setShowCompanyModal(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title={t('common.edit')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={() => handleDeleteCompany(company.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title={t('common.delete')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">{t('common.email')}</p>
                    <p className="text-gray-700">{company.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('common.phone')}</p>
                    <p className="text-gray-700">{company.phone}</p>
                  </div>
                  {!isPerson && (
                    <>
                      <div>
                        <p className="text-xs text-gray-500">{t('companies.taxId')}</p>
                        <p className="text-gray-700">{company.taxId || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">{t('companies.website')}</p>
                        <p className="text-gray-700">{company.website || '-'}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">{t('companies.source')}</p>
                    <p className="text-gray-700">{company.source || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('companies.assignTo')}</p>
                    <p className="text-gray-700">{salesman?.name || t('companies.unassigned')}</p>
                  </div>
                </div>

                <div className="mt-3 text-sm">
                  <p className="text-xs text-gray-500">{t('common.address')}</p>
                  <p className="text-gray-700">{company.address}</p>
                </div>
              </div>

              {/* Company Contacts Section — only shown for companies, not persons */}
              {!isPerson && (
                <div className="bg-gray-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">{t('companies.contacts')}</h4>
                    {canManageContactsHere && (
                      <button
                        onClick={() => {
                          setSelectedCompany(company);
                          setEditingContact(null);
                          setShowContactModal(true);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {t('companies.addContactShort')}
                      </button>
                    )}
                  </div>

                  {companyContacts.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('companies.noContacts')}</p>
                  ) : (
                    <div className="space-y-2">
                      {companyContacts.map((contact) => (
                        <div key={contact.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{contact.name}</p>
                              {contact.isPrimary && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                  {t('companies.primary')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">{contact.position}</p>
                            <p className="text-xs text-gray-400">{contact.email} | {contact.phone}</p>
                          </div>
                          <div className="flex space-x-1 rtl:space-x-reverse items-center">
                            {/* WhatsApp button — shown when contact has a phone number */}
                            {(contact.whatsappPhone || contact.phone) && (
                              <a
                                href={`https://wa.me/${(contact.whatsappPhone || contact.phone).replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                title={`WhatsApp ${contact.name}`}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </a>
                            )}
                            {canManageContactsHere && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingContact(contact);
                                    setSelectedCompany(company);
                                    setShowContactModal(true);
                                  }}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title={t('common.edit')}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(t('companies.deleteContact'))) {
                                      deleteCompanyContact(contact.id);
                                      loadData();
                                    }
                                  }}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  title={t('common.delete')}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Attachments Section — visible to all employees; contact role can upload */}
              <CompanyAttachmentsSection
                company={company}
                attachments={companyAttachments.filter(a => a.companyId === company.id)}
                user={user}
                onAttachmentAdded={(att) => { saveCompanyAttachment(att); loadData(); }}
                onAttachmentDeleted={(id) => { deleteCompanyAttachment(id); loadData(); }}
              />
            </div>
          );
        })}
      </div>
      )}

      {/* Quick Action Modal — for sales clicking on a customer */}
      {quickActionCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setQuickActionCompany(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                {quickActionCompany.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{quickActionCompany.name}</h3>
                <p className="text-xs text-gray-500">{quickActionCompany.industrialSector || quickActionCompany.type}</p>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { setQuickActionCompany(null); setEditingCompany(quickActionCompany); setDefaultKind(quickActionCompany.kind || 'company'); setShowCompanyModal(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left transition-colors"
              >
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">View Details</p>
                  <p className="text-xs text-gray-500">See full company profile & contacts</p>
                </div>
              </button>
              <button
                onClick={() => { setQuickActionCompany(null); navigate('/opportunities', { state: { createForCompany: { id: quickActionCompany.id, name: quickActionCompany.name } } }); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 text-left transition-colors"
              >
                <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Create Opportunity</p>
                  <p className="text-xs text-gray-500">Start a new sales opportunity</p>
                </div>
              </button>
            </div>
            <button onClick={() => setQuickActionCompany(null)} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 py-1">Cancel</button>
          </div>
        </div>
      )}

      {/* Company / Person Modal */}
      {showCompanyModal && (
        <CompanyModal
          company={editingCompany}
          defaultKind={defaultKind}
          salesmen={salesmen}
          allEmployees={allEmployees}
          industrialSectors={industrialSectors}
          contactSources={contactSources}
          customContactSources={customContactSources}
          onAddCustomSource={(label) => {
            saveCustomContactSource(label);
            getCustomContactSources().then(setCustomContactSources).catch(()=>{});
          }}
          onDeleteCustomSource={(id) => {
            deleteCustomContactSource(id);
            getCustomContactSources().then(setCustomContactSources).catch(()=>{});
          }}
          user={user}
          onSave={handleSaveCompany}
          onClose={() => {
            setShowCompanyModal(false);
            setEditingCompany(null);
          }}
          t={t}
        />
      )}

      {/* Duplicate Company Warning Modal */}
      {duplicateWarning && pendingCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Possible Duplicate</h3>
                <p className="text-sm text-gray-500 mt-1">
                  A company with a similar name already exists:
                </p>
              </div>
            </div>
            <ul className="mb-5 space-y-1">
              {duplicateWarning.map(c => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-gray-700 bg-yellow-50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
                  </svg>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-400">({c.type})</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => { setDuplicateWarning(null); setPendingCompany(null); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={() => _commitSaveCompany(pendingCompany)}
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm">
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <ContactModal
          contact={editingContact}
          companyId={selectedCompany?.id}
          onSave={(contact) => {
            const toSave = {
              ...contact,
              company_id: contact.company_id || selectedCompany?.id
            };

            saveCompanyContact(toSave);
            loadData();
            setShowContactModal(false);
            setEditingContact(null);
          }}
          onClose={() => {
            setShowContactModal(false);
            setEditingContact(null);
          }}
          t={t}
        />
      )}

    </div>
  );
}

// ─── Attachments Section ──────────────────────────────────────────────────────
function CompanyAttachmentsSection({ company, attachments, user, onAttachmentAdded, onAttachmentDeleted }) {
  const canUpload = user?.role === 'contact';
  const canDelete = (att) => user?.role === 'contact' && att.uploadedBy === user.id;
  const fileInputRef = React.useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onAttachmentAdded({
        companyId: company.id,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: ev.target.result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type = '') => {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '📊';
    return '📎';
  };

  return (
    <div className="border-t border-gray-100 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          Attachments
          {attachments.length > 0 && (
            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{attachments.length}</span>
          )}
        </h4>
        {canUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add file
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No attachments yet.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
              <span className="text-base flex-shrink-0">{getFileIcon(att.type)}</span>
              <div className="flex-1 min-w-0">
                <a
                  href={att.dataUrl}
                  download={att.name}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 truncate block"
                  title={att.name}
                >
                  {att.name}
                </a>
                <p className="text-xs text-gray-400">
                  {formatSize(att.size)} · by {att.uploaderName} · {new Date(att.uploadedAt).toLocaleDateString()}
                </p>
              </div>
              {canDelete(att) && (
                <button
                  onClick={() => { if (confirm('Delete this attachment?')) onAttachmentDeleted(att.id); }}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                  title="Delete attachment"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompanyModal({ company, defaultKind, salesmen, allEmployees, industrialSectors, contactSources, customContactSources, onAddCustomSource, onDeleteCustomSource, user, onSave, onClose, t }) {
  const [formData, setFormData] = useState(company || {
    kind: defaultKind || 'company',
    type: 'customer',
    name: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    website: '',
    source: '',
    industrialSector: '',
    assignedTo: salesmen[0]?.id || '',
    balance: 0
  });

  const isPerson = formData.kind === 'person';
  const [newSourceInput, setNewSourceInput] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const titleKey = company
    ? (isPerson ? 'companies.editContact' : 'companies.editCompany')
    : (isPerson ? 'companies.addPerson'   : 'companies.addCompany');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">{t(titleKey)}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Record kind toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('companies.recordKind')}
            </label>
            <div className="flex gap-2">
              {['company', 'person'].map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setFormData({ ...formData, kind: k })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    formData.kind === k
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t('companies.kind.' + k)}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">{t('companies.recordKind.help')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.kind.customer')} / {t('companies.kind.vendor')}</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="customer">{t('companies.kind.customer')}</option>
                <option value="vendor">{t('companies.kind.vendor')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isPerson ? t('companies.fullName') : t('companies.companyName')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.address')}</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {!isPerson && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.taxId')}</label>
                <input
                  type="text"
                  value={formData.taxId}
                  onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.website')}</label>
                <input
                  type="text"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.source')}</label>
              {user?.role === 'contact' ? (
                <>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— —</option>
                    {/* Employees group */}
                    {(allEmployees || []).length > 0 && (
                      <optgroup label="Employees">
                        {(allEmployees || []).map((emp) => (
                          <option key={emp.id} value={emp.name}>{emp.name} ({emp.role})</option>
                        ))}
                      </optgroup>
                    )}
                    {/* Built-in sources */}
                    {(contactSources || []).length > 0 && (
                      <optgroup label="Standard Sources">
                        {(contactSources || []).map((src) => (
                          <option key={src} value={src}>{src}</option>
                        ))}
                      </optgroup>
                    )}
                    {/* Custom sources group */}
                    {(customContactSources || []).length > 0 && (
                      <optgroup label="Custom Sources">
                        {(customContactSources || []).map((src) => (
                          <option key={src.id} value={src.label}>{src.label}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {/* Manage custom sources */}
                  <div className="mt-2">
                    {!showAddSource ? (
                      <button
                        type="button"
                        onClick={() => setShowAddSource(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add custom source
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={newSourceInput}
                          onChange={(e) => setNewSourceInput(e.target.value)}
                          placeholder="e.g. LinkedIn, Exhibition…"
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newSourceInput.trim()) {
                                onAddCustomSource(newSourceInput.trim());
                                setNewSourceInput('');
                                setShowAddSource(false);
                              }
                            }
                            if (e.key === 'Escape') { setShowAddSource(false); setNewSourceInput(''); }
                          }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newSourceInput.trim()) {
                              onAddCustomSource(newSourceInput.trim());
                              setNewSourceInput('');
                              setShowAddSource(false);
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowAddSource(false); setNewSourceInput(''); }}
                          className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-xs rounded-lg"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* List of custom sources with delete */}
                    {(customContactSources || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(customContactSources || []).map((src) => (
                          <span key={src.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                            {src.label}
                            <button
                              type="button"
                              onClick={() => {
                                if (formData.source === src.label) setFormData({ ...formData, source: '' });
                                onDeleteCustomSource(src.id);
                              }}
                              className="text-gray-400 hover:text-red-500 leading-none ml-0.5"
                              title="Remove this source"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <select
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— —</option>
                  {(contactSources || []).map((src) => (
                    <option key={src} value={src}>{src}</option>
                  ))}
                  {(customContactSources || []).length > 0 && (
                    <optgroup label="Custom Sources">
                      {(customContactSources || []).map((src) => (
                        <option key={src.id} value={src.label}>{src.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>
            {!isPerson && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.industry')}</label>
                <select
                  value={formData.industrialSector}
                  onChange={(e) => setFormData({ ...formData, industrialSector: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— —</option>
                  {industrialSectors.map((sector) => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {formData.type === 'customer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.assignTo')}</label>
              <select
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">{t('companies.unassigned')}</option>
                {salesmen.map((salesman) => (
                  <option key={salesman.id} value={salesman.id}>{salesman.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex space-x-3 rtl:space-x-reverse pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactModal({ contact, companyId, onSave, onClose, t }) {
  const [formData, setFormData] = useState(contact || {
    companyId: companyId,
    name: '',
    position: '',
    email: '',
    phone: '',
    whatsappPhone: '',
    isPrimary: false
  });

  // Sync companyId in case it arrives after initial render
  useEffect(() => {
    if (!formData.companyId && companyId) {
      setFormData(prev => ({ ...prev, companyId }));
    }
  }, [companyId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          {contact ? t('companies.editContact') : t('companies.addContact')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.fullName')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('companies.position')}</label>
            <input
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., CEO, Procurement Manager"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp Number
                <span className="text-gray-400 font-normal">(optional — if different from phone)</span>
              </span>
            </label>
            <input
              type="tel"
              value={formData.whatsappPhone || ''}
              onChange={(e) => setFormData({ ...formData, whatsappPhone: e.target.value })}
              placeholder="+201012345678"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-gray-400 mt-1">If left empty, the phone number above will be used for WhatsApp.</p>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isPrimary}
                onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                className="mr-2 rtl:mr-0 rtl:ml-2"
              />
              <span className="text-sm">{t('companies.primaryHelp')}</span>
            </label>
          </div>

          <div className="flex space-x-3 rtl:space-x-reverse pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

