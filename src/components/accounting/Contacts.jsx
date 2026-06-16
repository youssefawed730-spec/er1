// components/accounting/Contacts.jsx
// Unified Contacts view: supports both Person and Company kinds,
// with sub-contact persons (with roles) for companies.
// The "contact" role can add either; sub-persons can carry different roles.
import React, { useState, useEffect } from 'react';
import {
  getCompanies, getVisibleCompanies, saveCompany, deleteCompany,
  getCompanyContacts, saveCompanyContact, deleteCompanyContact,
  getUsers, getCurrentUser, hasPermission,
  canManageCompany, canManageCompanyContact, isCompanyOwner,
  getAccounts, getCustomerLedger, getVendorLedger, applyContactPayment,
  getPayments, addNotification
} from '../../data/store';

const CONTACT_PERSON_ROLES = [
  'CEO', 'CFO', 'COO', 'CTO',
  'General Manager', 'Sales Manager', 'Procurement Manager',
  'Finance Manager', 'Operations Manager', 'HR Manager',
  'Account Manager', 'Sales Representative', 'Accountant',
  'Legal Counsel', 'IT Manager', 'Marketing Manager',
  'Logistics Manager', 'Project Manager', 'Other'
];

const industrialSectors = [
  'Technology', 'Manufacturing', 'Retail', 'Healthcare', 'Construction',
  'Transportation', 'Energy', 'Agriculture', 'Finance', 'Education',
  'Hospitality', 'Logistics', 'Real Estate', 'Telecommunications', 'Other'
];

export default function Contacts() {
  const [entries, setEntries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingPerson, setEditingPerson] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [filterKind, setFilterKind] = useState('all');  // all | company | person
  const [filterType, setFilterType] = useState('all');  // all | customer | vendor
  const [defaultKind, setDefaultKind] = useState('company');
  const [salesmen, setSalesmen] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paymentTarget, setPaymentTarget] = useState(null); // { entry, ledger }
  const [txHistory, setTxHistory] = useState(null); // entry to show history for
  const [targetConfirm, setTargetConfirm]  = useState(null); // entry being targeted to HoS
  const user = getCurrentUser();
  const isContactRole = user?.role === 'contact';

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    getVisibleCompanies(user).then(setEntries).catch(()=>{});
    getUsers().then(data => setSalesmen(data.filter(u => u.role === 'sales'))).catch(()=>{});
    getAccounts().then(setAccounts).catch(()=>{});
  };

  const handleTargetToSales = (entry, notes = '') => {
    // Find all head_of_sales users and notify them
    getUsers().then(allUsers => {
    const hosUsers = allUsers.filter(u => u.role === 'head_of_sales');
    if (hosUsers.length === 0) { alert('No Head of Sales found in the system.'); return; }
    hosUsers.forEach(hos => {
      addNotification(
        hos.id,
        `🎯 Customer Lead: ${entry.name}`,
        `Contact person ${user?.name} has flagged "${entry.name}" as a potential customer lead.${entry.phone ? ` Phone: ${entry.phone}.` : ''}${entry.email ? ` Email: ${entry.email}.` : ''}${notes ? ` Notes: ${notes}` : ''}`,
        'info',
        '/opportunities'
      );
    });
    setTargetConfirm(null);
    alert(`✅ "${entry.name}" has been sent to the Head of Sales team.`);
    }).catch(() => {});
  };

  const canCreate = hasPermission(user?.role, 'contacts', 'write') || hasPermission(user?.role, 'companies', 'write');

  const handleSave = (entry) => {
    saveCompany(entry);
    loadData();
    setShowModal(false);
    setEditingEntry(null);
  };

  const handleDelete = (id) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    deleteCompany(id);
    loadData();
  };

  const handleSavePerson = (person) => {
    saveCompanyContact(person);
    loadData();
    setShowPersonModal(false);
    setEditingPerson(null);
    setSelectedCompanyId(null);
  };

  const handleDeletePerson = (id) => {
    if (!confirm('Are you sure you want to remove this contact person?')) return;
    deleteCompanyContact(id);
    loadData();
  };

  const filtered = entries.filter((e) => {
    const kindOK = filterKind === 'all' || (e.kind || 'company') === filterKind;
    const typeOK = filterType === 'all' || e.type === filterType;
    return kindOK && typeOK;
  });

  const customers = entries.filter(e => e.type === 'customer');
  const vendors   = entries.filter(e => e.type === 'vendor');
  // Compute live AR / AP from invoices & purchase costs
  const totalAR = customers.reduce((s, c) => s + getCustomerLedger(c.id).balanceDue, 0);
  const totalAP = vendors.reduce((s, v) => s + getVendorLedger(v.id).balanceDue, 0);

  const formatCurrency = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500">Manage companies and individual contacts</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setDefaultKind('company'); setEditingEntry(null); setShowModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
              Add Company
            </button>
            <button
              onClick={() => { setDefaultKind('person'); setEditingEntry(null); setShowModal(true); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Add Person
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Customers</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{customers.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Vendors</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{vendors.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Accounts Receivable</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalAR)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Outstanding from customers</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Accounts Payable</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totalAP)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Owed to vendors</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center flex-wrap gap-2">
        {['all', 'customer', 'vendor'].map(v => (
          <button key={v} onClick={() => setFilterType(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterType === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
            {v === 'all' ? 'All Types' : v.charAt(0).toUpperCase() + v.slice(1) + 's'}
          </button>
        ))}
        <span className="mx-1 text-gray-300">|</span>
        {['all', 'company', 'person'].map(v => (
          <button key={v} onClick={() => setFilterKind(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterKind === v ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
            {v === 'all' ? 'All Kinds' : v.charAt(0).toUpperCase() + v.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Contact Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-gray-100 shadow-sm">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-gray-500">No contacts found. Add a company or person to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((entry) => {
            const isPerson = (entry.kind || 'company') === 'person';
            const subPersons = isPerson ? [] : getCompanyContacts(entry.id);
            const salesman = salesmen.find(s => s.id === entry.assignedTo);
            const isCustomer = entry.type === 'customer';
            const isVendor   = entry.type === 'vendor';
            const ledger = isCustomer ? getCustomerLedger(entry.id) : isVendor ? getVendorLedger(entry.id) : null;
            const linkedAccount = accounts.find(a => a.id === entry.linkedAccountId);
            const canReceivePayment = isCustomer && hasPermission(user?.role, 'payments', 'write') && ledger?.balanceDue > 0;
            const canEdit = canManageCompany(user, entry, 'write');
            const canDel = canManageCompany(user, entry, 'delete') || canEdit;
            const canAddPerson = !isPerson && canManageCompanyContact(user, entry.id);

            return (
              <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Card Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        {/* Kind icon */}
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${isPerson ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                          {isPerson ? (
                            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          ) : (
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                          )}
                        </span>
                        <h3 className="text-base font-bold text-gray-900 truncate">{entry.name}</h3>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${entry.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {entry.type}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${isPerson ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {isPerson ? 'Person' : 'Company'}
                        </span>
                      </div>
                      {!isPerson && entry.industrialSector && (
                        <p className="text-xs text-gray-500 ml-10">{entry.industrialSector}</p>
                      )}
                      {isPerson && entry.position && (
                        <p className="text-xs text-gray-500 ml-10">{entry.position}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Target to Head of Sales — contact role only, customers only */}
                      {isContactRole && isCustomer && (
                        <button onClick={() => setTargetConfirm(entry)}
                          className="px-2.5 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 flex items-center gap-1 transition-colors" title="Send lead to Head of Sales">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          Target
                        </button>
                      )}
                      {canReceivePayment && (
                        <button onClick={() => setPaymentTarget({ entry, ledger })}
                          className="px-2.5 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 flex items-center gap-1 transition-colors" title="Receive Payment">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1" /></svg>
                          Receive
                        </button>
                      )}
                      {(isCustomer || isVendor) && (
                        <button onClick={() => setTxHistory(entry)}
                          className="px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1 transition-colors" title="Transaction History">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                          History
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => { setEditingEntry(entry); setShowModal(true); }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                      {canDel && (
                        <button onClick={() => handleDelete(entry.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                    {entry.email && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="truncate">{entry.email}</span>
                      </div>
                    )}
                    {entry.phone && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        <span>{entry.phone}</span>
                      </div>
                    )}
                    {entry.address && (
                      <div className="col-span-2 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                        <span className="truncate">{entry.address}</span>
                      </div>
                    )}
                    {salesman && (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span>{salesman.name}</span>
                      </div>
                    )}
                    {/* Live AR/AP balance from ledger */}
                    {ledger && (
                      <div className="col-span-2 mt-1 pt-2 border-t border-gray-50">
                        {isCustomer && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" /></svg>
                              Invoiced
                            </span>
                            <span className="text-xs font-medium text-gray-700">{formatCurrency(ledger.totalInvoiced)}</span>
                          </div>
                        )}
                        {isVendor && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Total Costs</span>
                            <span className="text-xs font-medium text-gray-700">{formatCurrency(ledger.totalCosts)}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-xs text-gray-500">Paid</span>
                          <span className="text-xs font-medium text-gray-500">- {formatCurrency(isCustomer ? ledger.totalPaid : ledger.totalPaid)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`text-xs font-bold ${isCustomer ? 'text-green-700' : 'text-red-700'}`}>
                            {isCustomer ? 'A/R Balance Due' : 'A/P Balance Due'}
                          </span>
                          <span className={`text-sm font-bold ${isCustomer ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(ledger.balanceDue)}
                          </span>
                        </div>
                        {linkedAccount && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">Ledger Account</span>
                            <span className="text-xs text-blue-600 font-medium">{linkedAccount.code} · {linkedAccount.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-persons section (only for Company kind) */}
                {!isPerson && (
                  <div className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Contact Persons ({subPersons.length})
                      </span>
                      {canAddPerson && (
                        <button
                          onClick={() => { setSelectedCompanyId(entry.id); setEditingPerson(null); setShowPersonModal(true); }}
                          className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors font-medium flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          Add Person
                        </button>
                      )}
                    </div>

                    {subPersons.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-1">No contact persons added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {subPersons.map((person) => (
                          <div key={person.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {person.name?.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{person.name}</p>
                                <div className="flex items-center gap-2">
                                  {person.role && (
                                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                                      {person.role}
                                    </span>
                                  )}
                                  {person.email && <span className="text-xs text-gray-500 truncate">{person.email}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {canAddPerson && (
                                <>
                                  <button
                                    onClick={() => { setSelectedCompanyId(entry.id); setEditingPerson(person); setShowPersonModal(true); }}
                                    className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeletePerson(person.id)}
                                    className="p-1 text-red-400 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
              </div>
            );
          })}
        </div>
      )}

      {/* Company/Person Modal */}
      {showModal && (
        <EntryModal
          entry={editingEntry}
          defaultKind={defaultKind}
          salesmen={salesmen}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingEntry(null); }}
        />
      )}

      {/* Contact Person Modal */}
      {showPersonModal && (
        <PersonModal
          person={editingPerson}
          companyId={selectedCompanyId}
          onSave={handleSavePerson}
          onClose={() => { setShowPersonModal(false); setEditingPerson(null); setSelectedCompanyId(null); }}
        />
      )}

      {/* Transaction History Modal */}
      {txHistory && (
        <TransactionHistoryModal
          entry={txHistory}
          onClose={() => setTxHistory(null)}
        />
      )}

      {/* Receive Payment Modal */}
      {/* ── Target to Head of Sales Modal ── */}
      {targetConfirm && <TargetToSalesModal entry={targetConfirm} onConfirm={handleTargetToSales} onClose={() => setTargetConfirm(null)} />}

      {paymentTarget && (
        <ContactPaymentModal
          entry={paymentTarget.entry}
          ledger={paymentTarget.ledger}
          accounts={accounts}
          onSave={(opts) => {
            applyContactPayment(opts);
            loadData();
            setPaymentTarget(null);
          }}
          onClose={() => setPaymentTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Entry Modal (Add/Edit Company or Person) ───────────────────────────────
function EntryModal({ entry, defaultKind, salesmen, accounts = [], onSave, onClose }) {
  const isEditing = !!entry;
  const isPerson = entry ? (entry.kind || 'company') === 'person' : defaultKind === 'person';

  const [formData, setFormData] = useState(entry || {
    kind: defaultKind || 'company',
    type: 'customer',
    name: '',
    email: '',
    phone: '',
    address: '',
    position: '',
    industrialSector: '',
    taxId: '',
    website: '',
    assignedTo: salesmen[0]?.id || '',
    balance: 0
  });

  const [kind, setKind] = useState(formData.kind || defaultKind || 'company');

  const handleKindChange = (k) => {
    setKind(k);
    setFormData(prev => ({ ...prev, kind: k }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, kind });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              {isEditing ? `Edit ${isPerson ? 'Person' : 'Company'}` : 'Add New Contact'}
            </h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Kind selector (only when adding new) */}
            {!isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Kind</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => handleKindChange('company')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${kind === 'company' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                    Company / Organization
                  </button>
                  <button type="button" onClick={() => handleKindChange('person')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${kind === 'person' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Individual Person
                  </button>
                </div>
              </div>
            )}

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {kind === 'person' ? 'Full Name' : 'Company Name'}
              </label>
              <input type="text" value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder={kind === 'person' ? 'John Smith' : 'Acme Corporation'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required />
            </div>

            {/* Position (Person only) */}
            {kind === 'person' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position / Title</label>
                <input type="text" value={formData.position || ''}
                  onChange={e => setFormData({ ...formData, position: e.target.value })}
                  placeholder="e.g. CEO, Procurement Manager"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            )}

            {/* Email & Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email || ''}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={formData.phone || ''}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 555-0000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={formData.address || ''}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Business St, City"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>

            {/* Company-only fields */}
            {kind === 'company' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <select value={formData.industrialSector || ''}
                    onChange={e => setFormData({ ...formData, industrialSector: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="">— Select —</option>
                    {industrialSectors.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                  <input type="text" value={formData.taxId || ''}
                    onChange={e => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
            )}

            {/* Assign to Salesman (customer only) */}
            {formData.type === 'customer' && salesmen.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Salesman</label>
                <select value={formData.assignedTo || ''}
                  onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">— Unassigned —</option>
                  {salesmen.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Linked Ledger Account */}
            {(formData.type === 'customer' || formData.type === 'vendor') && accounts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.type === 'customer' ? 'Linked A/R Account' : 'Linked A/P Account'}
                </label>
                <select value={formData.linkedAccountId || ''}
                  onChange={e => setFormData({ ...formData, linkedAccountId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">— Auto (default account) —</option>
                  {accounts
                    .filter(a => formData.type === 'customer' ? a.type === 'asset' : a.type === 'liability')
                    .map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.type === 'customer'
                    ? 'Defaults to Accounts Receivable (1200) if not set.'
                    : 'Defaults to Accounts Payable (2000) if not set.'}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button type="submit"
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium ${kind === 'person' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {isEditing ? 'Save Changes' : `Add ${kind === 'person' ? 'Person' : 'Company'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Person Modal ───────────────────────────────────────────────────
function PersonModal({ person, companyId, onSave, onClose }) {
  const [formData, setFormData] = useState(person || {
    companyId,
    name: '',
    role: '',
    email: '',
    phone: '',
    isPrimary: false,
    notes: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, companyId });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900">
              {person ? 'Edit Contact Person' : 'Add Contact Person'}
            </h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="John Smith"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role / Position</label>
              <select value={formData.role || ''}
                onChange={e => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <option value="">— Select Role —</option>
                {CONTACT_PERSON_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email || ''}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={formData.phone || ''}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 555-0000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={formData.notes || ''}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                placeholder="Additional notes..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isPrimary}
                onChange={e => setFormData({ ...formData, isPrimary: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-gray-300" />
              <span className="text-sm text-gray-700">Primary contact for this company</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
                {person ? 'Save Changes' : 'Add Person'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Payment Modal ──────────────────────────────────────────────────
// Allows receiving a lump-sum payment from a customer and automatically
// distributes it across all outstanding invoices (oldest first / FIFO).
function ContactPaymentModal({ entry, ledger, accounts, onSave, onClose }) {
  const arAccounts = accounts.filter(a => a.type === 'asset');
  const defaultArId = accounts.find(a => a.code === '1200')?.id || arAccounts[0]?.id || '';

  const [amount, setAmount]   = useState(ledger.balanceDue.toFixed(2));
  const [method, setMethod]   = useState('bank_transfer');
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]     = useState('');
  const [accountId, setAccId] = useState(entry.linkedAccountId || defaultArId);

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return alert('Please enter a valid amount.');
    onSave({
      companyId: entry.id,
      companyName: entry.name,
      amount: amt,
      method,
      date,
      notes,
      accountId,
    });
  };

  // Preview: show how the payment will be distributed
  const preview = (() => {
    let remaining = Number(amount) || 0;
    return ledger.unpaid.map(inv => {
      if (remaining <= 0) return { inv, applying: 0 };
      const due = Number(inv.balanceDue) || 0;
      const applying = Math.min(remaining, due);
      remaining -= applying;
      return { inv, applying };
    }).filter(r => r.applying > 0);
  })();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Receive Payment</h2>
              <p className="text-sm text-gray-500 mt-0.5">{entry.name}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Summary bar */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Outstanding Balance</p>
              <p className="text-2xl font-bold text-green-700">{fmt(ledger.balanceDue)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{ledger.unpaid.length} unpaid invoice{ledger.unpaid.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-gray-400">Invoiced: {fmt(ledger.totalInvoiced)}</p>
              <p className="text-xs text-gray-400">Paid so far: {fmt(ledger.totalPaid)}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount ($)</label>
              <input type="number" step="0.01" min="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                required />
            </div>

            {/* Method & Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={method} onChange={e => setMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  required />
              </div>
            </div>

            {/* Ledger account */}
            {arAccounts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Account (A/R)</label>
                <select value={accountId} onChange={e => setAccId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500">
                  <option value="">— Default A/R (1200) —</option>
                  {arAccounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Reference number, cheque no., etc."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" />
            </div>

            {/* Distribution preview */}
            {preview.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Distribution Preview (oldest first)
                </p>
                <div className="space-y-1.5">
                  {preview.map(({ inv, applying }) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 font-medium">{inv.number}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Due: {fmt(inv.balanceDue)}</span>
                        <span className="text-green-600 font-semibold">- {fmt(applying)}</span>
                      </div>
                    </div>
                  ))}
                  {Number(amount) > ledger.balanceDue && (
                    <div className="text-xs text-amber-600 font-medium pt-1 border-t border-gray-200">
                      ⚠ {fmt(Number(amount) - ledger.balanceDue)} will be recorded as an advance/overpayment.
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                Record Payment
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Target to Head of Sales confirmation modal ──────────────────────────────
function TargetToSalesModal({ entry, onConfirm, onClose }) {
  const [notes, setNotes] = React.useState('');
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Target Customer to Sales</h2>
              <p className="text-sm text-gray-500">Send this customer as a lead to the Head of Sales</p>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-orange-800">{entry.name}</p>
            {entry.phone && <p className="text-xs text-orange-700 mt-0.5">📞 {entry.phone}</p>}
            {entry.email && <p className="text-xs text-orange-700 mt-0.5">✉ {entry.email}</p>}
            {entry.industrialSector && <p className="text-xs text-orange-700 mt-0.5">🏭 {entry.industrialSector}</p>}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Why is this a good lead? Any context for the sales team..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
              Cancel
            </button>
            <button type="button" onClick={() => onConfirm(entry, notes)}
              className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              Send to Head of Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction History Modal ──────────────────────────────────────────────
function TransactionHistoryModal({ entry, onClose }) {
  const isCustomer = entry.type === 'customer';
  const ledger = isCustomer ? getCustomerLedger(entry.id) : getVendorLedger(entry.id);

  // Payments linked to this contact
  const payments = getPayments().filter(p =>
    p.companyId === entry.id || p.vendorId === entry.id
  );

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  // Build unified timeline: invoices/costs + payments, sorted by date
  const invoicesOrCosts = isCustomer
    ? (ledger.invoices || []).map(i => ({ ...i, _kind: 'invoice' }))
    : (ledger.costs || []).map(c => ({ ...c, _kind: 'cost' }));

  const paymentRows = payments.map(p => ({ ...p, _kind: 'payment' }));

  const timeline = [...invoicesOrCosts, ...paymentRows].sort(
    (a, b) => new Date(a.createdAt || a.date || 0) - new Date(b.createdAt || b.date || 0)
  );

  const handlePrint = () => {
    const printContent = document.getElementById('tx-history-print');
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`
      <!DOCTYPE html><html><head><title>Transaction History – ${entry.name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
        h1 { font-size: 20px; font-weight: bold; margin-bottom: 2px; }
        .subtitle { color: #555; font-size: 12px; margin-bottom: 18px; }
        .summary { display: flex; gap: 24px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; background: #f9fafb; }
        .summary-item { flex: 1; }
        .summary-item .label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
        .summary-item .value { font-size: 16px; font-weight: bold; margin-top: 2px; }
        .value.green { color: #16a34a; } .value.red { color: #dc2626; } .value.blue { color: #2563eb; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #e5e7eb; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
        .badge-invoice { background: #dbeafe; color: #1d4ed8; }
        .badge-cost { background: #ede9fe; color: #6d28d9; }
        .badge-payment { background: #dcfce7; color: #15803d; }
        .badge-paid { background: #dcfce7; color: #15803d; }
        .badge-partial { background: #fef3c7; color: #b45309; }
        .badge-unpaid { background: #fee2e2; color: #b91c1c; }
        .badge-draft { background: #f3f4f6; color: #374151; }
        .text-right { text-align: right; }
        .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: right; }
      </style></head><body>
      ${printContent.innerHTML}
      <div class="footer">Printed on ${new Date().toLocaleString()}</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Transaction History</h2>
            <p className="text-sm text-gray-500 mt-0.5">{entry.name} · <span className="capitalize">{entry.type}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6">
          <div id="tx-history-print">
            {/* Print header (only visible in print) */}
            <h1 style={{display:'none'}} className="print-show">Transaction History – {entry.name}</h1>
            <p className="subtitle" style={{display:'none'}}>{entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} · {entry.email || ''}{entry.phone ? ' · ' + entry.phone : ''}</p>

            {/* Summary cards */}
            <div className="summary grid grid-cols-3 gap-4 mb-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
              {isCustomer ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Invoiced</p>
                    <p className="text-xl font-bold text-blue-600 mt-1">{fmt(ledger.totalInvoiced)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</p>
                    <p className="text-xl font-bold text-green-600 mt-1">{fmt(ledger.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Balance Due</p>
                    <p className={`text-xl font-bold mt-1 ${ledger.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(ledger.balanceDue)}</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Costs</p>
                    <p className="text-xl font-bold text-purple-600 mt-1">{fmt(ledger.totalCosts)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</p>
                    <p className="text-xl font-bold text-green-600 mt-1">{fmt(ledger.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Balance Due</p>
                    <p className={`text-xl font-bold mt-1 ${ledger.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(ledger.balanceDue)}</p>
                  </div>
                </>
              )}
            </div>

            {/* Timeline table */}
            {timeline.length === 0 ? (
              <div className="text-center py-10 text-gray-400">No transactions found for this contact.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((row, i) => {
                    const isInvoice = row._kind === 'invoice';
                    const isCost    = row._kind === 'cost';
                    const isPmt     = row._kind === 'payment';
                    const rowDate   = fmtDate(row.date || row.createdAt);
                    const ref       = row.number || row.invoiceNumber || row.id?.slice(-6);
                    const desc      = row.description || row.notes || row.title || (isPmt ? `Payment via ${row.method || ''}` : '—');
                    const amount    = Number(row.total || row.amount || 0);
                    const paid      = isInvoice ? Number(row.amountPaid || 0) : isCost ? Number(row.amountPaid || 0) : null;
                    const balance   = isInvoice || isCost ? Math.max(amount - (paid || 0), 0) : null;

                    let statusBadge = null;
                    if (isInvoice || isCost) {
                      const st = row.status || 'unpaid';
                      const cls = st === 'paid' ? 'bg-green-100 text-green-700' : st === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                      statusBadge = <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${cls}`}>{st}</span>;
                    } else {
                      statusBadge = <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">received</span>;
                    }

                    return (
                      <tr key={row.id || i} className={`border-b border-gray-100 ${isPmt ? 'bg-green-50' : ''}`}>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{rowDate}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${isInvoice ? 'bg-blue-100 text-blue-700' : isCost ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                            {isInvoice ? 'Invoice' : isCost ? 'Cost' : 'Payment'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{ref}</td>
                        <td className="px-3 py-2.5 text-gray-700 max-w-xs truncate" title={desc}>{desc}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmt(amount)}</td>
                        <td className="px-3 py-2.5 text-right text-green-600">{paid !== null ? fmt(paid) : <span className="text-gray-400">—</span>}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${balance > 0 ? 'text-red-600' : balance === 0 && (isInvoice || isCost) ? 'text-green-600' : 'text-gray-400'}`}>
                          {balance !== null ? fmt(balance) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">{statusBadge}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td colSpan={4} className="px-3 py-2.5 text-gray-700 text-sm">Totals</td>
                    <td className="px-3 py-2.5 text-right text-gray-800">{fmt(isCustomer ? ledger.totalInvoiced : ledger.totalCosts)}</td>
                    <td className="px-3 py-2.5 text-right text-green-600">{fmt(ledger.totalPaid)}</td>
                    <td className={`px-3 py-2.5 text-right ${ledger.balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(ledger.balanceDue)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
