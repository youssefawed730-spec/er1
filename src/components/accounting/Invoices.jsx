// components/accounting/Invoices.jsx
import React, { useState, useEffect, useRef } from 'react';
import Pagination, { usePagination } from '../common/Pagination';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getInvoices, saveInvoice, updateInvoiceStatus, confirmInvoice,
  getSalesOrders, getCompanies, getCurrentUser, hasPermission,
  CURRENCIES, getSystemConfig,
  getPurchaseCosts, savePurchaseCost,
  savePayment, getAccounts, applyPaymentToInvoice,
  getNextInvoiceNumber, isInvoiceNumberUnique,
  sendInvoiceEmail, subscribeToEvents,
  getCustomerWalletBalance, useFromCustomerWallet,
  issueCreditNote
} from '../../data/store';

const CURRENCY_LIST = Object.values(CURRENCIES);

// ─── helpers ────────────────────────────────────────────────────────────────
function fmtCur(amount, currency) {
  const cur = (currency && CURRENCIES[currency]) ? currency : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: cur, minimumFractionDigits: 2
    }).format(Number(amount) || 0);
  } catch {
    const sym = CURRENCIES[cur]?.symbol || '$';
    return `${sym}${Number(amount || 0).toFixed(2)}`;
  }
}

/**
 * Given an array of lineItems (each with .currency), returns a map:
 * { USD: { subtotal, taxAmount, total }, EUR: { ... }, ... }
 */
function buildCurrencyTotals(lineItems, taxRate) {
  const groups = {};
  for (const item of lineItems) {
    const cur = item.currency || 'USD';
    if (!groups[cur]) groups[cur] = 0;
    groups[cur] += Number(item.amount) || 0;
  }
  const result = {};
  for (const [cur, subtotal] of Object.entries(groups)) {
    const taxAmount = subtotal * (Number(taxRate) / 100);
    result[cur] = { subtotal, taxAmount, total: subtotal + taxAmount };
  }
  return result;
}

/** Format a currencyTotals map as a compact list for the table cell */
function formatTotalsCell(currencyTotals) {
  if (!currencyTotals) return '—';
  const entries = Object.entries(currencyTotals);
  if (entries.length === 0) return '—';
  return entries.map(([cur, v]) => fmtCur(v.total, cur)).join(' + ');
}

// ─── main component ──────────────────────────────────────────────────────────
export default function Invoices() {
  const [invoices, setInvoices]         = useState([]);
  const [companies, setCompanies]       = useState([]);
  const [purchaseCosts, setPurchaseCosts] = useState([]);
  const [accounts, setAccounts]         = useState([]);
  const [showModal, setShowModal]       = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [viewInvoice, setViewInvoice]   = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm]     = useState('');
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      const refreshEvents = [
        'invoice_updated', 'invoice_confirmed',
        'payment_saved', 'payment_deleted',
        'purchaseCost_saved', 'purchaseCost_updated', 'purchaseCost_confirmed',
        'salesOrder_converted', 'company_updated',
      ];
      if (refreshEvents.includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const loadData = () => {
    getInvoices().then(setInvoices).catch(()=>{});
    getCompanies().then(setCompanies).catch(()=>{});
    getPurchaseCosts().then(setPurchaseCosts).catch(()=>{});
    getAccounts().then(setAccounts).catch(()=>{});
  };

  const canWrite   = hasPermission(user?.role, 'invoices', 'write');
  const canConfirm = hasPermission(user?.role, 'invoices', 'confirm') || user?.role === 'head_of_accounting';
  const canPay     = hasPermission(user?.role, 'payments', 'write');

  const handleConfirm = async (id) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) return;

    // confirmInvoice already auto-posts the journal entry (Dr AR / Cr Revenue) internally
    confirmInvoice(id, user?.role);

    // Send email notification to customer (if enabled in settings)
    try {
      await sendInvoiceEmail({ ...invoice, id, number: invoice.number || invoice.number });
    } catch (e) {
      console.log('Email notification skipped:', e.message);
    }

    loadData();
  };
  const handleSave = (invoice) => {
    saveInvoice(invoice);
    setShowModal(false);
    setEditingInvoice(null);
    loadData();
  };

  const handleStatusChange = (id, newStatus) => {
    updateInvoiceStatus(id, newStatus);
    loadData();
  };

  const [creditNoteInvoice, setCreditNoteInvoice] = useState(null);
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');

  const handleIssueCreditNote = () => {
    if (!creditNoteInvoice) return;
    const amt = creditNoteAmount ? parseFloat(creditNoteAmount) : null;
    const result = issueCreditNote(creditNoteInvoice.id, creditNoteReason, amt);
    if (result.success) {
      loadData();
      setCreditNoteInvoice(null);
      setCreditNoteReason('');
      setCreditNoteAmount('');
    } else {
      alert(result.message);
    }
  };

  const getStatusColor = (status, confirmed) => {
    if (confirmed)              return 'bg-green-100 text-green-700';
    if (status === 'paid')      return 'bg-green-100 text-green-700';
    if (status === 'sent')      return 'bg-blue-100 text-blue-700';
    if (status === 'partial')   return 'bg-yellow-100 text-yellow-700';
    if (status === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };
  const getStatusText = (status, confirmed, reversed, type) => {
    if (type === 'credit_note') return 'Credit Note';
    if (reversed) return 'Reversed';
    if (confirmed) return 'Confirmed';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const filterBySalesOrder = location.state?.filterBySalesOrder;

  const filteredInvoices = (() => {
    let list = filterStatus === 'all' ? invoices : invoices.filter(i => i.status === filterStatus);
    if (filterBySalesOrder) list = list.filter(i => i.salesOrderId === filterBySalesOrder);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i =>
        i.invoiceNumber?.toLowerCase().includes(q) ||
        i.companyName?.toLowerCase().includes(q) ||
        i.status?.toLowerCase().includes(q) ||
        String(i.total || '').includes(q) ||
        i.notes?.toLowerCase().includes(q) ||
        i.salesOrderNumber?.toLowerCase().includes(q)
      );
    }
    return list;
  })();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const invoicePagination = usePagination(filteredInvoices, 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500">Create multi-currency invoices, confirm, and track payments</p>
        </div>
        <div className="flex items-center gap-3">
          {filterBySalesOrder && (
            <button
              onClick={() => navigate('/sales-orders')}
              className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Sales Orders
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => { setEditingInvoice(null); setShowModal(true); }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Invoice
            </button>
          )}
        </div>
      </div>
      {filterBySalesOrder && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Showing invoices linked to selected sales order
          <button onClick={() => navigate('/invoices')} className="ml-2 underline text-purple-600 hover:text-purple-800">Clear filter</button>
        </div>
      )}

      {/* Search + Status filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoices…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      <div className="flex flex-wrap gap-2">
        {['all','draft','sent','partial','paid','cancelled','confirmed'].map(s => (
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

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
              <th className="px-5 py-4 text-right text-xs font-medium text-gray-500 uppercase">Total(s)</th>
              <th className="px-5 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-5 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredInvoices.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400 text-sm">No invoices found.</td></tr>
            )}
            {invoicePagination.paginated.map(invoice => (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm font-mono font-medium text-gray-900">{invoice.number}</td>
                <td className="px-5 py-4">
                  <p className="text-sm font-medium text-gray-900">{invoice.companyName}</p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {invoice.opportunityTitle && (
                      <span className="inline-flex items-center text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded" title="Opportunity">
                        🎯 {invoice.opportunityTitle}
                      </span>
                    )}
                    {invoice.quotationNumber && (
                      <span className="inline-flex items-center text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="Source Quotation">
                        📋 {invoice.quotationNumber}
                      </span>
                    )}
                    {invoice.salesOrderNumber && (
                      <span className="inline-flex items-center text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded" title="Source Sales Order">
                        📦 {invoice.salesOrderNumber}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-500">{new Date(invoice.date).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-sm text-gray-500">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-right text-sm font-medium text-gray-900">
                  {invoice.currencyTotals
                    ? formatTotalsCell(invoice.currencyTotals)
                    : fmtCur(invoice.total, invoice.currency)}
                </td>
                <td className="px-5 py-4 text-center">
                  <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status, invoice.confirmed)}`}>
                    {getStatusText(invoice.status, invoice.confirmed, invoice.reversed, invoice.type)}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-center space-x-1">
                    <button onClick={() => setViewInvoice(invoice)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="View & Print">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    {canWrite && invoice.status === 'draft' && (
                      <button onClick={() => { setEditingInvoice(invoice); setShowModal(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {!invoice.confirmed && canConfirm && invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                      <button onClick={() => handleConfirm(invoice.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                    {invoice.status === 'sent' && (
                      <button onClick={() => handleStatusChange(invoice.id, 'paid')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Mark Paid">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                    {canPay && ['sent', 'partial', 'confirmed'].includes(invoice.status) && (Number(invoice.balanceDue ?? invoice.total) || 0) > 0 && (
                      <button onClick={() => setPayingInvoice(invoice)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Pay Invoice">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </button>
                    )}
                    {canConfirm && invoice.confirmed && !invoice.reversed && invoice.type !== 'credit_note' && (
                      <button onClick={() => { setCreditNoteInvoice(invoice); setCreditNoteAmount(String(invoice.total || '')); }} className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg" title="Issue Credit Note">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
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
          page={invoicePagination.page}
          pageCount={invoicePagination.pageCount}
          onPageChange={invoicePagination.setPage}
          total={invoicePagination.total}
          pageSize={invoicePagination.pageSize}
        />
      </div>

      {showModal && (
        <InvoiceFormModal
          invoice={editingInvoice}
          companies={companies}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingInvoice(null); }}
        />
      )}
      {viewInvoice && (
        <InvoiceViewModal
          invoice={viewInvoice}
          purchaseCosts={purchaseCosts.filter(c => c.invoiceId === viewInvoice.id)}
          user={user}
          vendors={companies.filter(c => c.type === 'vendor')}
          accounts={accounts}
          onCostAdded={() => { loadData(); }}
          onPayInvoice={(inv) => { setViewInvoice(null); setPayingInvoice(inv); }}
          onClose={() => setViewInvoice(null)}
        />
      )}
      {payingInvoice && (
        <PayInvoiceModal
          invoice={payingInvoice}
          accounts={accounts}
          onSave={(payment) => {
            savePayment(payment);
            setPayingInvoice(null);
            loadData();
          }}
          onClose={() => setPayingInvoice(null)}
        />
      )}

      {/* Credit Note Modal */}
      {creditNoteInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Issue Credit Note</h2>
            <p className="text-sm text-gray-500 mb-4">
              Reversing invoice <span className="font-mono font-semibold">{creditNoteInvoice.number}</span> for {creditNoteInvoice.customerName || creditNoteInvoice.companyName}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount</label>
                <input
                  type="number"
                  value={creditNoteAmount}
                  onChange={e => setCreditNoteAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="Leave blank to reverse full amount"
                />
                <p className="text-xs text-gray-400 mt-1">Full invoice total: {creditNoteInvoice.total}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  value={creditNoteReason}
                  onChange={e => setCreditNoteReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., Goods returned, billing error..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setCreditNoteInvoice(null); setCreditNoteReason(''); setCreditNoteAmount(''); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleIssueCreditNote}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                Issue Credit Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invoice Form Modal ───────────────────────────────────────────────────────
function InvoiceFormModal({ invoice, companies, onSave, onClose }) {
  const config      = getSystemConfig();
  const defaultCur  = config.currency || 'USD';
  const today       = new Date().toISOString().slice(0, 10);
  const dueDefault  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [companyId,       setCompanyId]       = useState(invoice?.companyId       || '');
  const [companyName,     setCompanyName]     = useState(invoice?.companyName     || '');
  const [companyEmail,    setCompanyEmail]    = useState(invoice?.companyEmail    || '');
  const [companyPhone,    setCompanyPhone]    = useState(invoice?.companyPhone    || '');
  const [companyAddress,  setCompanyAddress]  = useState(invoice?.companyAddress  || invoice?.billingAddress || '');
  const [companyTaxId,    setCompanyTaxId]    = useState(invoice?.companyTaxId    || '');
  const [companyWebsite,  setCompanyWebsite]  = useState(invoice?.companyWebsite  || '');
  const [date,            setDate]            = useState(invoice?.date            || today);
  const [dueDate,         setDueDate]         = useState(invoice?.dueDate         || dueDefault);
  const [taxRate,         setTaxRate]         = useState(invoice?.taxRate         ?? 0);
  const [notes,           setNotes]           = useState(invoice?.notes           || '');
  const [invoiceNumber,   setInvoiceNumber]   = useState(invoice?.number          || '');

  // Auto-generate invoice number on mount for new invoices
  useEffect(() => {
    if (!invoice && !invoiceNumber) {
      getNextInvoiceNumber().then(setInvoiceNumber).catch(()=>{});
    }
  }, [invoice, invoiceNumber]);

  const makeBlankLine = () => ({
    id: Date.now() + Math.random(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    currency: defaultCur,
    amount: 0
  });

  const [lineItems, setLineItems] = useState(
    invoice?.lineItems?.length
      ? invoice.lineItems.map(l => ({ ...l, currency: l.currency || defaultCur }))
      : [makeBlankLine()]
  );

  // ── line-item helpers ───────────────────────────────────────────────────────
  const updateLine = (index, field, value) => {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const qty   = Number(field === 'quantity'  ? value : next[index].quantity);
        const price = Number(field === 'unitPrice' ? value : next[index].unitPrice);
        next[index].amount = qty * price;
      }
      return next;
    });
  };

  const addLine    = () => setLineItems(p => [...p, makeBlankLine()]);
  const removeLine = (i) => { if (lineItems.length > 1) setLineItems(p => p.filter((_, idx) => idx !== i)); };

  // ── derived totals per currency ─────────────────────────────────────────────
  const currencyTotals = buildCurrencyTotals(lineItems, taxRate);
  const currencies     = Object.keys(currencyTotals);

  // "primary" totals for backward-compat invoice.total (use first currency)
  const primaryCur = currencies[0] || defaultCur;
  const primaryTotals = currencyTotals[primaryCur] || { subtotal: 0, taxAmount: 0, total: 0 };

  const handleCompanyChange = (id) => {
    const company = companies.find(c => c.id === id);
    setCompanyId(id);
    setCompanyName(company?.name || '');
    setCompanyEmail(company?.email || '');
    setCompanyPhone(company?.phone || '');
    setCompanyAddress(company?.address || '');
    setCompanyTaxId(company?.taxId || '');
    setCompanyWebsite(company?.website || '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!companyName) return alert('Please select a company.');
    if (!invoiceNumber.trim()) return alert('Please enter an invoice number.');
    // Check for duplicate invoice numbers (exclude current invoice when editing)
    if (!isInvoiceNumberUnique(invoiceNumber.trim(), invoice?.id)) {
      return alert('Invoice number already exists. Please use a unique number or click "Regenerate" to get a new one.');
    }
    onSave({
      ...invoice,
      number: invoiceNumber.trim(),
      companyId,
      companyName,
      companyEmail,
      companyPhone,
      companyAddress,
      billingAddress: companyAddress,
      companyTaxId,
      companyWebsite,
      date,
      dueDate,
      taxRate:        Number(taxRate),
      subtotal:       primaryTotals.subtotal,
      taxAmount:      primaryTotals.taxAmount,
      total:          primaryTotals.total,
      currency:       primaryCur,
      currencyTotals,
      notes,
      lineItems,
      status: invoice?.status || 'draft'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{invoice ? 'Edit Invoice' : 'New Invoice'}</h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* ── Meta fields ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-2024-0001"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  required
                />
                {!invoice && (
                  <button
                    type="button"
                    onClick={() => getNextInvoiceNumber().then(setInvoiceNumber).catch(()=>{})}
                    className="px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg hover:bg-blue-200 font-medium"
                    title="Regenerate new number"
                  >
                    ↻
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Auto-generated. Click ↻ to regenerate.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
              {companies.length > 0 ? (
                <select
                  value={companyId}
                  onChange={e => handleCompanyChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Select customer…</option>
                  {companies.filter(c => c.type !== 'vendor' && !c.isVendor).map(c => <option key={c.id} value={c.id}>{c.name} {c.type ? `(${c.type})` : ''}</option>)}
                </select>
              ) : (
                <input
                  type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                  placeholder="Customer name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  required
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%) — applied to all items</label>
              <input
                type="number" min="0" max="100" step="0.01" value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
              <input
                type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
            </div>
          </div>

          {/* ── Customer Details (autofilled, editable) ── */}
          {companyId && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Customer Details
                <span className="text-xs font-normal text-blue-500">(auto-filled — editable)</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)}
                    placeholder="customer@email.com"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="text" value={companyPhone} onChange={e => setCompanyPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                  <input type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)}
                    placeholder="Street, City, Country"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tax ID / VAT</label>
                  <input type="text" value={companyTaxId} onChange={e => setCompanyTaxId(e.target.value)}
                    placeholder="VAT-12345"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
                  <input type="text" value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white" />
                </div>
              </div>
            </div>
          )}

          {/* ── Line Items ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Line Items</h3>
              <button
                type="button" onClick={addLine}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Line
              </button>
            </div>

            {/* info hint */}
            <p className="text-xs text-gray-400 mb-2">Each item can have its own currency. Totals are grouped by currency below.</p>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-right w-20">Qty</th>
                    <th className="px-3 py-3 text-left w-36">Currency</th>
                    <th className="px-3 py-3 text-right w-36">Unit Price</th>
                    <th className="px-3 py-3 text-right w-36">Amount</th>
                    <th className="px-3 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.map((item, i) => {
                    const cur  = item.currency || 'USD';
                    const sym  = CURRENCIES[cur]?.symbol || '';
                    return (
                      <tr key={item.id || i} className="hover:bg-gray-50">
                        {/* Description */}
                        <td className="px-3 py-2">
                          <input
                            type="text" value={item.description}
                            onChange={e => updateLine(i, 'description', e.target.value)}
                            placeholder="Description of service / product"
                            className="w-full border-0 bg-transparent focus:ring-0 text-sm text-gray-800 placeholder-gray-400"
                            required
                          />
                        </td>
                        {/* Qty */}
                        <td className="px-3 py-2">
                          <input
                            type="number" min="0" step="any" value={item.quantity}
                            onChange={e => updateLine(i, 'quantity', e.target.value)}
                            className="w-full border-0 bg-transparent focus:ring-0 text-sm text-right text-gray-800"
                          />
                        </td>
                        {/* Currency */}
                        <td className="px-3 py-2">
                          <select
                            value={cur}
                            onChange={e => updateLine(i, 'currency', e.target.value)}
                            className="w-full border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                          >
                            {CURRENCY_LIST.map(c => (
                              <option key={c.code} value={c.code}>
                                {c.code} {c.symbol}
                              </option>
                            ))}
                          </select>
                        </td>
                        {/* Unit Price */}
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400 shrink-0">{sym}</span>
                            <input
                              type="number" min="0" step="any" value={item.unitPrice}
                              onChange={e => updateLine(i, 'unitPrice', e.target.value)}
                              className="w-24 border-0 bg-transparent focus:ring-0 text-sm text-right text-gray-800"
                            />
                          </div>
                        </td>
                        {/* Amount */}
                        <td className="px-3 py-2 text-right font-semibold text-gray-800">
                          {fmtCur(item.amount, cur)}
                        </td>
                        {/* Remove */}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button" onClick={() => removeLine(i)}
                            disabled={lineItems.length === 1}
                            className="text-gray-300 hover:text-red-500 disabled:opacity-20 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Totals by currency ── */}
          <div className="flex justify-end">
            <div className="w-80 space-y-3">
              {currencies.length === 0 && (
                <p className="text-sm text-gray-400 text-right">Add items to see totals.</p>
              )}
              {currencies.map(cur => {
                const t = currencyTotals[cur];
                return (
                  <div key={cur} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                        {cur} — {CURRENCIES[cur]?.name}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">{cur}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-medium">{fmtCur(t.subtotal, cur)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Tax ({taxRate}%)</span>
                      <span className="font-medium">{fmtCur(t.taxAmount, cur)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-1.5">
                      <span>Total {cur}</span>
                      <span className="text-blue-700">{fmtCur(t.total, cur)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} placeholder="Payment terms, bank details, special instructions…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              {invoice ? 'Save Changes' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Invoice View + Print Modal ───────────────────────────────────────────────
function InvoiceViewModal({ invoice, purchaseCosts = [], user, vendors = [], accounts = [], onCostAdded, onPayInvoice, onClose }) {
  const printRef = useRef(null);
  const [showAddCost, setShowAddCost] = useState(false);

  const canAddCost = user?.role === 'accounting' || user?.role === 'head_of_accounting' || user?.role === 'admin';
  const canPay     = hasPermission(user?.role, 'payments', 'write');
  const balanceDue = Number(invoice.balanceDue ?? invoice.total) || 0;
  const isPayable  = canPay && ['sent', 'partial', 'confirmed'].includes(invoice.status) && balanceDue > 0;

  const currencyTotals = invoice.currencyTotals || buildCurrencyTotals(invoice.lineItems || [], invoice.taxRate || 0);
  const currencies     = Object.keys(currencyTotals);

  const totalCosts = purchaseCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const handlePrint = () => {
    const contents = printRef.current.innerHTML;
    const w = window.open('', '_blank', 'width=960,height=720');
    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoice.number}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;padding:40px;font-size:13px}
      .inv-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:2px solid #2563eb;margin-bottom:28px}
      .brand h1{font-size:26px;font-weight:800;color:#2563eb}.brand p{color:#6b7280;font-size:12px;margin-top:3px}
      .meta{text-align:right}.meta .num{font-size:20px;font-weight:700}.meta p{font-size:12px;color:#6b7280;margin-top:3px}
      .bill-to{margin-bottom:24px}.bill-to label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600}
      .bill-to p{font-size:15px;font-weight:600;margin-top:3px}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      thead tr{background:#f8fafc}
      th{padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb}
      th.r{text-align:right}
      td{padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:12px}
      td.r{text-align:right}td.bold{font-weight:600}
      .cur-badge{display:inline-block;padding:1px 8px;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:10px;font-weight:700}
      .totals-block{margin-left:auto;width:300px;margin-top:8px}
      .totals-section{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px}
      .totals-section .cur-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f3f4f6}
      .totals-section .cur-header span:first-child{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .totals-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
      .totals-row.total{font-weight:700;font-size:13px;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:4px;color:#2563eb}
      .notes{margin-top:24px;padding:12px;background:#f9fafb;border-radius:8px}
      .notes label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;font-weight:600;display:block;margin-bottom:5px}
      .notes p{font-size:12px;color:#374151}
      .status-bar{display:flex;gap:20px;margin-top:24px;padding:12px;background:#f9fafb;border-radius:8px}
      .s-item{display:flex;align-items:center;gap:7px;font-size:12px}
      .dot{width:9px;height:9px;border-radius:50%}.dot.g{background:#16a34a}.dot.gr{background:#d1d5db}
      @media print{body{padding:20px}}
    </style></head><body>${contents}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">

        {/* Modal header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{invoice.number}</h2>
            <p className="text-sm text-gray-500">Created {formatDate(invoice.date)}</p>
          </div>
          <div className="flex items-center gap-2">
            {isPayable && (
              <button onClick={() => onPayInvoice(invoice)} className="flex items-center px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors font-medium">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Pay Invoice
                <span className="ml-1.5 bg-emerald-500 px-1.5 py-0.5 rounded text-xs font-bold">
                  {fmtCur(balanceDue, invoice.currency || 'USD')} due
                </span>
              </button>
            )}
            <button onClick={handlePrint} className="flex items-center px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable body */}
        <div className="p-6">

          {/* Customer Info Card (on-screen only) */}
          {(invoice.companyEmail || invoice.companyPhone || invoice.companyAddress || invoice.companyTaxId) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Customer</p>
                <p className="text-sm font-semibold text-gray-900">{invoice.companyName}</p>
              </div>
              {invoice.companyEmail && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Email</p>
                  <p className="text-sm text-gray-700">{invoice.companyEmail}</p>
                </div>
              )}
              {invoice.companyPhone && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Phone</p>
                  <p className="text-sm text-gray-700">{invoice.companyPhone}</p>
                </div>
              )}
              {invoice.companyAddress && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Address</p>
                  <p className="text-sm text-gray-700">{invoice.companyAddress}</p>
                </div>
              )}
              {invoice.companyTaxId && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Tax ID</p>
                  <p className="text-sm text-gray-700">{invoice.companyTaxId}</p>
                </div>
              )}
              {invoice.companyWebsite && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Website</p>
                  <a href={invoice.companyWebsite} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">{invoice.companyWebsite}</a>
                </div>
              )}
            </div>
          )}

          {/* Source Chain Banner */}
          {(invoice.opportunityTitle || invoice.quotationNumber || invoice.salesOrderNumber) && (
            <div className="flex items-center gap-2 flex-wrap mb-5 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs">
              <span className="text-gray-400 font-medium uppercase tracking-wide">Source:</span>
              {invoice.opportunityTitle && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                  🎯 {invoice.opportunityTitle}
                </span>
              )}
              {invoice.opportunityTitle && invoice.quotationNumber && (
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {invoice.quotationNumber && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                  📋 {invoice.quotationNumber}
                </span>
              )}
              {invoice.quotationNumber && invoice.salesOrderNumber && (
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {invoice.salesOrderNumber && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                  📦 {invoice.salesOrderNumber}
                </span>
              )}
              {invoice.salesOrderNumber && (
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">
                🧾 {invoice.number}
              </span>
            </div>
          )}

          <div ref={printRef}>

            {/* Print header */}
            <div className="inv-header" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:'20px',borderBottom:'2px solid #2563eb',marginBottom:'28px'}}>
              <div className="brand">
                <h1 style={{fontSize:'26px',fontWeight:'800',color:'#2563eb'}}>INVOICE</h1>
                <p style={{color:'#6b7280',fontSize:'12px',marginTop:'3px'}}>LogisticsERP</p>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'20px',fontWeight:'700'}}>{invoice.number}</div>
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'3px'}}>Date: {formatDate(invoice.date)}</p>
                <p style={{fontSize:'12px',color:'#6b7280'}}>Due: {formatDate(invoice.dueDate)}</p>
                {currencies.length > 1 && (
                  <p style={{fontSize:'11px',color:'#2563eb',marginTop:'5px',fontWeight:'600'}}>
                    Multi-currency: {currencies.join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Bill To */}
            <div style={{marginBottom:'24px'}}>
              <label style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'.05em',color:'#9ca3af',fontWeight:'600'}}>Bill To</label>
              <p style={{fontSize:'16px',fontWeight:'600',marginTop:'4px'}}>{invoice.companyName}</p>
              {(invoice.companyAddress || invoice.billingAddress) && (
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>{invoice.companyAddress || invoice.billingAddress}</p>
              )}
              {invoice.companyEmail && (
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>
                  <span style={{color:'#9ca3af'}}>Email: </span>{invoice.companyEmail}
                </p>
              )}
              {invoice.companyPhone && (
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>
                  <span style={{color:'#9ca3af'}}>Phone: </span>{invoice.companyPhone}
                </p>
              )}
              {invoice.companyTaxId && (
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>
                  <span style={{color:'#9ca3af'}}>Tax ID: </span>{invoice.companyTaxId}
                </p>
              )}
              {invoice.companyWebsite && (
                <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>
                  <span style={{color:'#9ca3af'}}>Web: </span>{invoice.companyWebsite}
                </p>
              )}
            </div>

            {/* Line Items */}
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'20px'}}>
              <thead>
                <tr style={{background:'#f8fafc'}}>
                  {['Description','Qty','Currency','Unit Price','Amount'].map((h, hi) => (
                    <th key={h} style={{padding:'8px 10px',textAlign: hi >= 1 && hi !== 2 ? 'right' : 'left',fontSize:'10px',textTransform:'uppercase',letterSpacing:'.04em',color:'#6b7280',fontWeight:'600',borderBottom:'1px solid #e5e7eb'}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems || []).map((item, i) => {
                  const cur = item.currency || 'USD';
                  return (
                    <tr key={item.id || i}>
                      <td style={{padding:'9px 10px',borderBottom:'1px solid #f3f4f6',fontSize:'12px'}}>{item.description}</td>
                      <td style={{padding:'9px 10px',borderBottom:'1px solid #f3f4f6',fontSize:'12px',textAlign:'right'}}>{item.quantity}</td>
                      <td style={{padding:'9px 10px',borderBottom:'1px solid #f3f4f6',fontSize:'12px'}}>
                        <span style={{display:'inline-block',padding:'1px 8px',background:'#eff6ff',color:'#2563eb',borderRadius:'9999px',fontSize:'10px',fontWeight:'700'}}>
                          {cur}
                        </span>
                      </td>
                      <td style={{padding:'9px 10px',borderBottom:'1px solid #f3f4f6',fontSize:'12px',textAlign:'right'}}>{fmtCur(item.unitPrice, cur)}</td>
                      <td style={{padding:'9px 10px',borderBottom:'1px solid #f3f4f6',fontSize:'12px',textAlign:'right',fontWeight:'600'}}>{fmtCur(item.amount, cur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals per currency */}
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <div style={{width:'300px'}}>
                {currencies.map(cur => {
                  const t = currencyTotals[cur];
                  return (
                    <div key={cur} style={{border:'1px solid #e5e7eb',borderRadius:'8px',padding:'12px',marginBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px',paddingBottom:'6px',borderBottom:'1px solid #f3f4f6'}}>
                        <span style={{fontSize:'10px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'.05em',color:'#6b7280'}}>{cur} — {CURRENCIES[cur]?.name}</span>
                        <span style={{display:'inline-block',padding:'1px 8px',background:'#eff6ff',color:'#2563eb',borderRadius:'9999px',fontSize:'10px',fontWeight:'700'}}>{cur}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',padding:'3px 0'}}>
                        <span style={{color:'#6b7280'}}>Subtotal</span>
                        <span>{fmtCur(t.subtotal, cur)}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',padding:'3px 0'}}>
                        <span style={{color:'#6b7280'}}>Tax ({invoice.taxRate || 0}%)</span>
                        <span>{fmtCur(t.taxAmount, cur)}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',fontWeight:'700',borderTop:'1px solid #e5e7eb',paddingTop:'8px',marginTop:'4px',color:'#2563eb'}}>
                        <span>Total {cur}</span>
                        <span>{fmtCur(t.total, cur)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div style={{marginTop:'24px',padding:'12px',background:'#f9fafb',borderRadius:'8px'}}>
                <label style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'.05em',color:'#9ca3af',fontWeight:'600',display:'block',marginBottom:'5px'}}>Notes</label>
                <p style={{fontSize:'12px',color:'#374151'}}>{invoice.notes}</p>
              </div>
            )}

            {/* Status */}
            <div style={{display:'flex',gap:'20px',marginTop:'24px',padding:'12px',background:'#f9fafb',borderRadius:'8px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'7px',fontSize:'12px'}}>
                <div style={{width:'9px',height:'9px',borderRadius:'50%',background: invoice.confirmed ? '#16a34a' : '#d1d5db'}}></div>
                Confirmed by {invoice.confirmedBy || 'Pending'}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'7px',fontSize:'12px'}}>
                <div style={{width:'9px',height:'9px',borderRadius:'50%',background: invoice.status === 'paid' ? '#16a34a' : '#d1d5db'}}></div>
                Payment {invoice.status === 'paid' ? 'Received' : 'Pending'}
              </div>
            </div>

          </div>

          {/* ── Purchase Costs Panel ── */}
          {canAddCost && (
            <div className="mt-6 border-t border-gray-200 pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Purchase Costs</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Costs associated with fulfilling this invoice</p>
                </div>
                <button
                  onClick={() => setShowAddCost(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Cost
                </button>
              </div>

              {purchaseCosts.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
                  </svg>
                  <p className="text-xs text-gray-400">No purchase costs yet. Add costs linked to this invoice.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {purchaseCosts.map(cost => (
                    <div key={cost.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{cost.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {cost.vendor && (
                            <span className="text-xs text-gray-500">{cost.vendor}</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            cost.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            cost.status === 'approved'  ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{cost.status || 'pending'}</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-orange-600 ml-4">
                        ${Number(cost.amount || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">Total Purchase Costs</span>
                    <span className="text-sm font-bold text-orange-600">${totalCosts.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Purchase Cost sub-modal */}
      {showAddCost && (
        <AddPurchaseCostModal
          invoice={invoice}
          vendors={vendors}
          onSave={(cost) => {
            savePurchaseCost(cost);
            onCostAdded?.();
            setShowAddCost(false);
          }}
          onClose={() => setShowAddCost(false)}
        />
      )}
    </div>
  );
}

// ─── Add Purchase Cost Modal (inline from Invoice view) ──────────────────────
function AddPurchaseCostModal({ invoice, vendors = [], onSave, onClose }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount]           = useState('');
  const [vendorId, setVendorId]       = useState('');
  const [vendorName, setVendorName]   = useState('');
  const [status, setStatus]           = useState('pending');

  const handleVendorChange = (id) => {
    setVendorId(id);
    const v = vendors.find(v => v.id === id);
    setVendorName(v ? v.name : '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim()) return alert('Please enter a description.');
    if (!amount || Number(amount) <= 0) return alert('Please enter a valid amount.');
    onSave({
      invoiceId:      invoice.id,
      invoiceNumber:  invoice.number,
      quotationId:    invoice.quotationId || '',
      description:    description.trim(),
      amount:         Number(amount),
      vendor:         vendorName || vendorId,
      vendorId:       vendorId || null,
      status,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Add Purchase Cost</h2>
              <p className="text-xs text-gray-500 mt-0.5">Linked to invoice {invoice.number}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Raw materials, Shipping, Sub-contractor"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                required
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                required
              />
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              {vendors.length > 0 ? (
                <>
                  <select
                    value={vendorId}
                    onChange={e => handleVendorChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                  >
                    <option value="">— Select vendor —</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {!vendorId && (
                    <input
                      type="text"
                      value={vendorName}
                      onChange={e => setVendorName(e.target.value)}
                      placeholder="Or type vendor name manually"
                      className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    />
                  )}
                </>
              ) : (
                <input
                  type="text"
                  value={vendorName}
                  onChange={e => setVendorName(e.target.value)}
                  placeholder="Vendor name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                />
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </div>

            {/* Invoice info pill */}
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-orange-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              This cost will be linked to <strong className="mx-1">{invoice.number}</strong> ({invoice.companyName})
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium"
              >
                Save Cost
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Pay Invoice Modal ────────────────────────────────────────────────────────
function PayInvoiceModal({ invoice, accounts = [], onSave, onClose }) {
  const balanceDue = Number(invoice.balanceDue ?? invoice.total) || 0;
  const currency   = invoice.currency || 'USD';

  // Wallet balance for this customer
  const walletBalance = invoice.companyId ? getCustomerWalletBalance(invoice.companyId) : 0;
  // How much wallet can cover
  const walletCovers  = Math.min(walletBalance, balanceDue);
  // Remaining cash needed after wallet
  const cashNeeded    = Math.max(balanceDue - walletCovers, 0);

  const [useWallet,  setUseWallet]  = useState(walletCovers > 0.001); // auto-on if wallet available
  const [amount,     setAmount]     = useState(cashNeeded > 0.001 ? cashNeeded.toFixed(2) : '0');
  const [method,     setMethod]     = useState('bank_transfer');
  const [reference,  setReference]  = useState('');
  const [accountId,  setAccountId]  = useState(accounts[0]?.id || '');
  const [date,       setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [notes,      setNotes]      = useState('');

  // Recalculate amount when useWallet toggles
  const handleToggleWallet = (val) => {
    setUseWallet(val);
    if (val) {
      setAmount(cashNeeded > 0.001 ? cashNeeded.toFixed(2) : '0');
    } else {
      setAmount(balanceDue.toFixed(2));
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const effectiveWallet = useWallet ? walletCovers : 0;
  const totalCovering   = effectiveWallet + parsedAmount;
  const remaining       = balanceDue - totalCovering;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (totalCovering < 0.001) return alert('Please enter a valid amount.');
    if (totalCovering > balanceDue + 0.001) {
      if (!window.confirm(`Total ${fmtCur(totalCovering, currency)} exceeds balance due ${fmtCur(balanceDue, currency)}. Record as overpayment?`)) return;
    }

    // 1. Deduct from wallet first
    if (useWallet && effectiveWallet > 0.001) {
      useFromCustomerWallet({
        companyId: invoice.companyId,
        companyName: invoice.companyName,
        amount: effectiveWallet,
        reason: `Applied to invoice ${invoice.number}`,
        relatedInvoiceId: invoice.id,
      });
      // Record wallet deduction as a payment entry
      savePayment({
        type: 'inbound',
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        companyId: invoice.companyId,
        companyName: invoice.companyName,
        amount: effectiveWallet,
        currency,
        method: 'wallet',
        reference: '',
        accountId: accountId || null,
        date,
        notes: `Wallet credit applied to invoice ${invoice.number}`,
        recordedAt: new Date().toISOString(),
        fromWallet: true,
      });
    }

    // 2. Record cash payment if any
    if (parsedAmount > 0.001) {
      onSave({
        type: 'inbound',
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        companyId: invoice.companyId,
        companyName: invoice.companyName,
        amount: parsedAmount,
        currency,
        method,
        reference,
        accountId: accountId || null,
        date,
        notes: notes || `Payment for invoice ${invoice.number}${useWallet && effectiveWallet > 0.001 ? ` (+ ${fmtCur(effectiveWallet, currency)} from wallet)` : ''}`,
        recordedAt: new Date().toISOString(),
      });
    } else {
      // Wallet covered it entirely — still call onSave to trigger loadData/close
      onSave({
        type: 'inbound',
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        companyId: invoice.companyId,
        companyName: invoice.companyName,
        amount: 0,
        currency,
        method: 'wallet',
        reference: '',
        accountId: accountId || null,
        date,
        notes: `Fully paid from wallet for invoice ${invoice.number}`,
        recordedAt: new Date().toISOString(),
        walletOnly: true,
      });
    }
  };

  const methodColors = {
    cash: 'text-green-700', check: 'text-blue-700',
    bank_transfer: 'text-purple-700', credit_card: 'text-orange-700'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Pay Invoice</h2>
              <p className="text-xs text-gray-500 mt-0.5">{invoice.number} · {invoice.companyName}</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Balance summary */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Invoice Total</p>
              <p className="text-base font-bold text-gray-800">{fmtCur(invoice.total, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Already Paid</p>
              <p className="text-base font-bold text-gray-800">{fmtCur(invoice.amountPaid || 0, currency)}</p>
            </div>
            <div className="col-span-2 border-t border-emerald-200 pt-3">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Balance Due</p>
              <p className="text-xl font-extrabold text-emerald-700">{fmtCur(balanceDue, currency)}</p>
            </div>
          </div>

          {/* Wallet banner */}
          {walletCovers > 0.001 && (
            <div className={`rounded-xl p-3 mb-4 border transition-colors ${useWallet ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🪙</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-700">Wallet Credit Available</p>
                    <p className="text-sm font-bold text-amber-800">{fmtCur(walletBalance, currency)} total · covers {fmtCur(walletCovers, currency)} of this invoice</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleWallet(!useWallet)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${useWallet ? 'bg-amber-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${useWallet ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {useWallet && (
                <div className="mt-2 pt-2 border-t border-amber-200 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-amber-600">From Wallet</p>
                    <p className="font-bold text-amber-800">{fmtCur(effectiveWallet, currency)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cash Needed</p>
                    <p className="font-bold text-gray-800">{fmtCur(cashNeeded, currency)}</p>
                  </div>
                  <div>
                    <p className="text-emerald-600">You Save</p>
                    <p className="font-bold text-emerald-700">{fmtCur(effectiveWallet, currency)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
                required
              />
            </div>

            {/* Amount — label changes based on wallet usage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {useWallet && effectiveWallet > 0.001
                  ? cashNeeded < 0.001 ? 'Cash Amount (wallet covers all ✓)' : `Cash Amount Needed (${fmtCur(effectiveWallet, currency)} from wallet)`
                  : `Amount to Pay (${currency}) *`}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                  {CURRENCIES[currency]?.symbol || '$'}
                </span>
                <input
                  type="number" min="0" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-semibold ${useWallet && cashNeeded < 0.001 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300'}`}
                  required={!useWallet || cashNeeded > 0.001}
                  readOnly={useWallet && cashNeeded < 0.001}
                />
              </div>

              {/* Coverage summary */}
              {totalCovering > 0 && (
                <div className={`mt-1.5 text-xs flex items-center gap-1 font-medium ${remaining < -0.001 ? 'text-orange-600' : remaining < 0.001 ? 'text-emerald-600' : 'text-blue-600'}`}>
                  {remaining < -0.001
                    ? `⚠ Overpayment by ${fmtCur(Math.abs(remaining), currency)}`
                    : remaining < 0.001
                    ? `✓ Fully settles this invoice${useWallet && effectiveWallet > 0.001 ? ` (${fmtCur(effectiveWallet, currency)} wallet + ${fmtCur(parsedAmount, currency)} cash)` : ''}`
                    : `Remaining after payment: ${fmtCur(remaining, currency)}`}
                </div>
              )}

              {/* Quick-fill buttons */}
              {(!useWallet || cashNeeded > 0.001) && (
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setAmount(useWallet ? cashNeeded.toFixed(2) : balanceDue.toFixed(2))}
                    className="px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 font-medium">
                    {useWallet ? `Cash needed (${fmtCur(cashNeeded, currency)})` : 'Full amount'}
                  </button>
                  {!useWallet && (
                    <button type="button" onClick={() => setAmount((balanceDue / 2).toFixed(2))}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium">
                      Half
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Method — hidden if wallet covers everything */}
            {!(useWallet && cashNeeded < 0.001) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['cash','check','bank_transfer','credit_card'].map(m => (
                    <button key={m} type="button" onClick={() => setMethod(m)}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium transition-colors capitalize ${method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reference */}
            {!(useWallet && cashNeeded < 0.001) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference / Check #</label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                  placeholder="e.g. TRF-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
                />
              </div>
            )}

            {/* Deposit Account */}
            {accounts.length > 0 && !(useWallet && cashNeeded < 0.001) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deposit Account <span className="text-xs text-gray-400">debited</span>
                </label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm">
                  {accounts.filter(a => a.type === 'asset').map(a => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional note"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold">
                {useWallet && cashNeeded < 0.001 ? '✓ Pay from Wallet' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
