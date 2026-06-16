// components/sales/SalesOrders.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getSalesOrders, saveSalesOrder, confirmSalesOrder, convertSalesOrderToInvoice,
  getQuotations, getCompanies, getInvoices, getCurrentUser, hasPermission,
  CURRENCIES, getSystemConfig, saveInvoice, subscribeToEvents,
  recordSalesOrderFulfillment, getNextInvoiceNumber
} from '../../data/store';

function fmtCur(amount, currency) {
  const cur = (currency && CURRENCIES[currency]) ? currency : 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch {
    return `${CURRENCIES[cur]?.symbol || '$'}${Number(amount || 0).toFixed(2)}`;
  }
}

export default function SalesOrders() {
  const [salesOrders, setSalesOrders] = useState([]);
  const [quotations,  setQuotations]  = useState([]);
  const [companies,   setCompanies]   = useState([]);
  const [invoices,    setInvoices]    = useState([]);
  const [viewOrder,   setViewOrder]   = useState(null);
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    const p1 = getSalesOrders().then(setSalesOrders).catch(()=>{});
    const p2 = getQuotations().then(setQuotations).catch(()=>{});
    const p3 = getCompanies().then(setCompanies).catch(()=>{});
    const p4 = getInvoices().then(setInvoices).catch(()=>{});
    return Promise.all([p1, p2, p3, p4]);
  };

  useEffect(() => {
    const unsub = subscribeToEvents((event) => {
      if (['salesOrder_confirmed', 'salesOrder_converted', 'invoice_updated',
           'invoice_confirmed', 'payment_saved'].includes(event.type)) loadData();
    });
    return unsub;
  }, []);

  const filterByQuotation = location.state?.filterByQuotation;
  const displayedOrders = filterByQuotation
    ? salesOrders.filter(o => o.quotationId === filterByQuotation)
    : salesOrders;

  const canConfirm = hasPermission(user?.role, 'salesOrders', 'confirm') || user?.role === 'head_of_accounting';
  const canConvert = hasPermission(user?.role, 'salesOrders', 'write') || user?.role === 'operation' || user?.role === 'head_of_operation';
  const isOperation = user?.role === 'operation' || user?.role === 'head_of_operation';

  const handleConfirm = async (id) => {
    try {
      await confirmSalesOrder(id, user?.role);
      await loadData();
    } catch (err) {
      alert('Failed to confirm order: ' + err.message);
    }
  };

  const [fulfillOrder, setFulfillOrder] = useState(null);
  const [fulfillQtys, setFulfillQtys] = useState({});
  const [fulfillNotes, setFulfillNotes] = useState('');

  const handleOpenFulfill = (order) => {
    const initial = {};
    (order.lineItems || []).forEach((li, i) => {
      initial[i] = li.remainingQty ?? (li.quantity || 1) - (li.fulfilledQty || 0);
    });
    setFulfillQtys(initial);
    setFulfillNotes('');
    setFulfillOrder(order);
  };

  const handleSubmitFulfillment = async () => {
    if (!fulfillOrder) return;
    const fulfillments = Object.entries(fulfillQtys)
      .map(([idx, qty]) => ({ lineItemIndex: Number(idx), qty: Number(qty) || 0 }))
      .filter(f => f.qty > 0);
    try {
      await recordSalesOrderFulfillment(fulfillOrder.id, fulfillments, fulfillNotes);
      await loadData();
      setFulfillOrder(null);
    } catch (err) {
      alert('Failed to record fulfillment: ' + err.message);
    }
  };

  const handleConvertToInvoice = async (id) => {
    try {
      await convertSalesOrderToInvoice(id);
      await loadData();
    } catch (err) {
      alert('Failed to convert to invoice: ' + err.message);
    }
  };

  // Create invoice directly from sales order (auto-filled from quotation data)
  const handleCreateInvoiceFromOrder = async (order) => {
    try {
      const defaultCur = order.totalCurrency || order.currency || 'USD';
      const lineItems = (order.lineItems || []).map(item => ({
        ...item,
        id: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        currency: item.currency || defaultCur
      }));

      // Build per-currency totals
      const taxRate = Number(order.taxRate) || 0;
      const currencyGroups = {};
      for (const item of lineItems) {
        const cur = item.currency || defaultCur;
        if (!currencyGroups[cur]) currencyGroups[cur] = 0;
        currencyGroups[cur] += Number(item.amount) || 0;
      }
      const currencyTotals = {};
      for (const [cur, subtotal] of Object.entries(currencyGroups)) {
        const taxAmount = subtotal * (taxRate / 100);
        currencyTotals[cur] = { subtotal, taxAmount, total: subtotal + taxAmount };
      }

      const totalCurrency = defaultCur;
      let grandTotal = 0;
      for (const [cur, t] of Object.entries(currencyTotals)) {
        const fromRate = CURRENCIES[cur]?.rate || 1;
        const toRate = CURRENCIES[totalCurrency]?.rate || 1;
        grandTotal += (t.total / fromRate) * toRate;
      }

      const today = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const invoiceNumber = await getNextInvoiceNumber();

      const invoicePayload = {
        number: invoiceNumber,
        companyId: order.companyId,
        companyName: order.companyName,
        companyEmail: order.companyEmail || '',
        companyPhone: order.companyPhone || '',
        companyAddress: order.companyAddress || order.billingAddress || '',
        billingAddress: order.companyAddress || order.billingAddress || '',
        companyTaxId: order.companyTaxId || '',
        companyWebsite: order.companyWebsite || '',
        date: today,
        dueDate: dueDate,
        taxRate: taxRate,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        total: order.total,
        currency: totalCurrency,
        totalCurrency: totalCurrency,
        currencyTotals: currencyTotals,
        grandTotal: grandTotal,
        lineItems: lineItems,
        notes: order.notes || '',
        status: 'draft',
        confirmed: false,
        salesOrderId: order.id,
        salesOrderNumber: order.number,
        quotationId: order.quotationId,
        quotationNumber: order.quotationNumber,
        amountPaid: 0,
        balanceDue: grandTotal || order.total,
      };

      const saved = await saveInvoice(invoicePayload);
      // Mark the sales order as invoiced so the UI reflects the conversion
      await saveSalesOrder({
        ...order,
        status: 'invoiced',
        convertedToInvoice: true,
        invoiceId: saved?.id,
        invoiceNumber: saved?.number,
        convertedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await loadData();
      alert(`Invoice ${saved?.number || ''} created successfully from Sales Order!`);
    } catch (err) {
      alert('Failed to create invoice: ' + err.message);
    }
  };

  const config = getSystemConfig();
  const systemCurrency = config.currency || 'USD';

  const getStatusBadge = (order) => {
    if (order.convertedToInvoice)
      return <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">Invoiced</span>;
    if (order.confirmed)
      return <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Confirmed</span>;
    return <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Draft</span>;
  };

  const getInvoiceForOrder = (order) => invoices.find(i => i.id === order.invoiceId || i.salesOrderId === order.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-gray-500">Confirm orders and convert them to invoices</p>
        </div>
        {filterByQuotation && (
          <button
            onClick={() => navigate('/quotations')}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Quotations
          </button>
        )}
      </div>
      {filterByQuotation && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Showing orders linked to selected quotation
          <button onClick={() => navigate('/sales-orders')} className="ml-2 underline text-orange-600 hover:text-orange-800">Clear filter</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Customer / Source</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-5 py-4 text-left text-xs font-medium text-gray-500 uppercase">Expected Delivery</th>
              <th className="px-5 py-4 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-5 py-4 text-center text-xs font-medium text-gray-500 uppercase">Invoice</th>
              <th className="px-5 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-5 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedOrders.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400 text-sm">
                {filterByQuotation ? 'No sales orders found for this quotation.' : 'No sales orders found.'}
              </td></tr>
            )}
            {displayedOrders.map(order => {
              const linkedInvoice = getInvoiceForOrder(order);
              return (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4 text-sm font-mono font-medium text-gray-900">{order.number}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-900">{order.companyName}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {order.opportunityTitle && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded" title="Opportunity">
                          🎯 {order.opportunityTitle}
                        </span>
                      )}
                      {order.quotationNumber && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="Source Quotation">
                          📋 {order.quotationNumber}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">{new Date(order.date).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{new Date(order.expectedDelivery).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-right text-sm font-medium text-gray-900">
                    {fmtCur(order.total, order.currency || systemCurrency)}
                  </td>
                  {/* Linked invoice */}
                  <td className="px-5 py-4 text-center">
                    {linkedInvoice ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {linkedInvoice.number}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-center">{getStatusBadge(order)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center space-x-1">
                      <button onClick={() => setViewOrder({ ...order, linkedInvoice })}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="View">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>

                      {/* Navigate to linked invoice */}
                      <button
                        onClick={() => navigate('/invoices', { state: { filterBySalesOrder: order.id } })}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg relative"
                        title="View Related Invoices"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {linkedInvoice && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">1</span>
                        )}
                      </button>

                      {/* Create Invoice from Sales Order - Operations role only */}
                      {isOperation && !order.convertedToInvoice && (
                        <button onClick={() => handleCreateInvoiceFromOrder(order)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Create Invoice">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      )}

                      {!order.confirmed && canConfirm && (
                        <button onClick={() => handleConfirm(order.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Confirm Order">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}

                      {order.confirmed && !order.convertedToInvoice && canConvert && (
                        <button onClick={() => handleConvertToInvoice(order.id)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Convert to Invoice">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      )}
                      {order.confirmed && order.lineItems?.length > 0 && order.fulfillmentStatus !== 'fulfilled' && (
                        <button onClick={() => handleOpenFulfill(order)}
                          className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg" title="Record Shipment">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewOrder && (
        <SalesOrderViewModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
        />
      )}

      {/* Fulfillment Modal */}
      {fulfillOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Record Shipment</h2>
            <p className="text-sm text-gray-500 mb-4">SO {fulfillOrder.number} — enter quantities shipped in this shipment</p>
            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
              {(fulfillOrder.lineItems || []).map((li, i) => {
                const remaining = li.remainingQty ?? (li.quantity || 1) - (li.fulfilledQty || 0);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{li.description || li.name}</p>
                      <p className="text-xs text-gray-400">Ordered: {li.quantity || 1} · Fulfilled: {li.fulfilledQty || 0} · Remaining: {remaining}</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      value={fulfillQtys[i] ?? remaining}
                      onChange={e => setFulfillQtys({ ...fulfillQtys, [i]: e.target.value })}
                      className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                );
              })}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={fulfillNotes} onChange={e => setFulfillNotes(e.target.value)}
                placeholder="e.g., Courier: DHL, tracking #12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-400" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFulfillOrder(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmitFulfillment}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Save Shipment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────
function SalesOrderViewModal({ order, onClose }) {
  const currency = order.currency || order.totalCurrency || 'USD';

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const getCurrencyForItem = (item) => item.currency || currency;

  // Build per-currency totals from line items if available
  const hasMultiCurrency = (order.lineItems || []).some(i => i.currency && i.currency !== (order.lineItems[0]?.currency || 'USD'));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">

        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{order.number}</h2>
            <p className="text-sm text-gray-500">Created on {fmtDate(order.date)}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Linked invoice banner */}
          {order.linkedInvoice && (
            <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-800">Invoice Created</p>
                <p className="text-xs text-purple-600">
                  This sales order was converted to invoice{' '}
                  <span className="font-bold">{order.linkedInvoice.number}</span>
                  {' '}on {order.convertedAt ? fmtDate(order.convertedAt) : ''}
                  {order.linkedInvoice.totalCurrency && (
                    <span className="ml-1">— Total: {fmtCur(order.linkedInvoice.grandTotal ?? order.linkedInvoice.total, order.linkedInvoice.totalCurrency)}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Company</p>
              <p className="font-semibold text-gray-900 mt-1">{order.companyName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Expected Delivery</p>
              <p className="font-semibold text-gray-900 mt-1">{fmtDate(order.expectedDelivery)}</p>
            </div>
            {order.quotationNumber && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Source Quotation</p>
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  {order.quotationNumber}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Currency</p>
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                {currency} — {CURRENCIES[currency]?.name || currency}
              </span>
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  {hasMultiCurrency && <th className="px-4 py-3 text-left">Currency</th>}
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.lineItems || []).map((item, i) => {
                  const cur = getCurrencyForItem(item);
                  return (
                    <tr key={item.id || i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{item.quantity}</td>
                      {hasMultiCurrency && (
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold">{cur}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-right text-gray-600">{fmtCur(item.unitPrice, cur)}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{fmtCur(item.amount, cur)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">{fmtCur(order.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax ({order.taxRate || 0}%)</span>
                <span className="font-medium">{fmtCur(order.taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-300 pt-2">
                <span>Total</span>
                <span className="text-blue-700">{fmtCur(order.total, currency)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}

          {/* Status timeline */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-3">Order Timeline</p>
            <div className="space-y-2">
              {[
                { done: true,                       label: 'Order Created',          sub: fmtDate(order.createdAt || order.date) },
                { done: !!order.confirmed,           label: `Confirmed by ${order.confirmedBy || '—'}`,      sub: order.confirmedAt ? fmtDate(order.confirmedAt) : 'Pending' },
                { done: !!order.convertedToInvoice, label: `Invoice ${order.invoiceNumber || 'Created'}`,   sub: order.convertedAt ? fmtDate(order.convertedAt) : 'Pending' },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${step.done ? 'bg-green-500' : 'bg-gray-200'}`}>
                    {step.done && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                    <p className="text-xs text-gray-400">{step.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
