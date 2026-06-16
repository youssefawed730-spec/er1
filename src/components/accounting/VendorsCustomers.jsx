// components/accounting/VendorsCustomers.jsx
// Unified Vendors & Customers ledger page.
// Shows each company's AR (customers) or AP (vendors) balance,
// linked to Accounts Receivable (1200) and Accounts Payable (2000).
import React, { useState, useEffect, useMemo } from 'react';
import {
  getCompanies, getCustomerLedger, getVendorLedger,
  getInvoices, getPurchaseCosts, getPayments,
  formatCurrencyWithRate, subscribeToEvents,
  getCustomerWalletBalance, getCustomerWalletTransactions
} from '../../data/store';
import { useTranslation } from '../../i18n';

const TABS = ['all', 'customer', 'vendor'];

export default function VendorsCustomers() {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState([]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // company for detail panel
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyTab, setHistoryTab] = useState('all'); // 'all' | 'invoices' | 'purchases' | 'payments'

  const reload = () => {
    getCompanies().then(setCompanies).catch(()=>{});
    setRefreshKey(k => k + 1);
  };

  useEffect(() => {
    reload();
    const unsub = subscribeToEvents((e) => {
      if (['invoice_confirmed','payment_saved','company_created','company_updated',
           'company_deleted','invoice_updated','purchaseCost_confirmed',
           'purchaseCost_saved','purchaseCost_updated','wallet_updated'].includes(e.type)) {
        reload();
      }
    });
    return unsub;
  }, []);

  // Compute enriched rows
  const rows = useMemo(() => {
    return companies.map(c => {
      const isVendor   = c.type === 'vendor'   || c.isVendor;
      const isCustomer = c.type === 'customer' || c.isCustomer || (!isVendor);
      const customer = isCustomer ? getCustomerLedger(c.id) : null;
      const vendor   = isVendor   ? getVendorLedger(c.id)   : null;
      const walletBalance = isCustomer ? getCustomerWalletBalance(c.id) : 0;
      return { ...c, isVendor, isCustomer, customer, vendor, walletBalance };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, refreshKey]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === 'customer') list = list.filter(r => r.isCustomer && !r.isVendor);
    if (tab === 'vendor')   list = list.filter(r => r.isVendor);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q) ||
        r.industry?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, tab, search]);

  // Aggregate totals for header cards
  const totals = useMemo(() => {
    const customers = rows.filter(r => r.isCustomer);
    const vendors   = rows.filter(r => r.isVendor);
    const totalAR = customers.reduce((s, r) => s + (r.customer?.balanceDue || 0), 0);
    const totalAP = vendors.reduce((s, r)   => s + (r.vendor?.balanceDue   || 0), 0);
    return { customerCount: customers.length, vendorCount: vendors.length, totalAR, totalAP };
  }, [rows]);

  const selectedRow = selected ? rows.find(r => r.id === selected) : null;

  // Build full transaction history for selected company
  const transactionHistory = useMemo(() => {
    if (!selectedRow) return [];
    const allInvoices = getInvoices()
      .filter(inv => inv.companyId === selectedRow.id)
      .map(inv => ({
        id: inv.id,
        date: inv.date || inv.createdAt,
        type: 'invoice',
        number: inv.number,
        description: inv.notes || 'Invoice',
        amount: Number(inv.total) || 0,
        amountPaid: Number(inv.amountPaid) || 0,
        balanceDue: Number(inv.balanceDue) || 0,
        status: inv.status,
        direction: 'receivable', // money coming in
      }));

    const allPurchaseCosts = getPurchaseCosts()
      .filter(pc => pc.vendorId === selectedRow.id)
      .map(pc => ({
        id: pc.id,
        date: pc.date || pc.createdAt,
        type: 'purchase',
        number: pc.number || pc.id,
        description: pc.description || 'Purchase Cost',
        amount: Number(pc.amount) || 0,
        amountPaid: Number(pc.amountPaid) || 0,
        balanceDue: Math.max((Number(pc.balanceDue ?? pc.amount) || 0) - (Number(pc.amountPaid) || 0), 0),
        status: pc.status,
        direction: 'payable', // money going out
      }));

    const allPayments = getPayments()
      .filter(p =>
        (p.companyId === selectedRow.id || p.vendorId === selectedRow.id)
      )
      .map(p => ({
        id: p.id,
        date: p.date || p.createdAt,
        type: 'payment',
        number: p.number,
        description: p.notes || (p.type === 'inbound' ? 'Payment Received' : 'Payment Sent'),
        amount: Number(p.amount) || 0,
        amountPaid: null,
        balanceDue: null,
        status: 'paid',
        direction: p.type === 'inbound' ? 'received' : 'sent',
        invoiceNumber: p.invoiceNumber,
        purchaseCostNumber: p.purchaseCostNumber,
      }));

    return [...allInvoices, ...allPurchaseCosts, ...allPayments]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow, refreshKey]);

  const filteredHistory = useMemo(() => {
    if (historyTab === 'invoices')  return transactionHistory.filter(t => t.type === 'invoice');
    if (historyTab === 'purchases') return transactionHistory.filter(t => t.type === 'purchase');
    if (historyTab === 'payments')  return transactionHistory.filter(t => t.type === 'payment');
    return transactionHistory;
  }, [transactionHistory, historyTab]);

  const fmt = (v) => formatCurrencyWithRate(v || 0);
  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  const handlePrint = (row, history, fmt, fmtDate) => {
    const isCustomer = row.isCustomer;
    const ledger = isCustomer ? row.customer : row.vendor;
    const typeLabel = isCustomer ? 'Customer' : 'Vendor';
    const trows = history.map(tx => `
      <tr style="border-bottom:1px solid #f0f0f0;${tx.type==='payment'?'background:#f0fdf4':''}">
        <td style="padding:7px 10px;color:#555;">${fmtDate(tx.date)}</td>
        <td style="padding:7px 10px;">
          <span style="padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;
            background:${tx.type==='invoice'?'#dbeafe':tx.type==='purchase'?'#ede9fe':'#dcfce7'};
            color:${tx.type==='invoice'?'#1d4ed8':tx.type==='purchase'?'#6d28d9':'#15803d'}">
            ${tx.type.charAt(0).toUpperCase()+tx.type.slice(1)}
          </span>
        </td>
        <td style="padding:7px 10px;font-family:monospace;font-size:11px;color:#666;">${tx.number||'—'}</td>
        <td style="padding:7px 10px;color:#374151;">${tx.description||'—'}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600;">${fmt(tx.amount)}</td>
        <td style="padding:7px 10px;text-align:right;color:#16a34a;">${tx.amountPaid!=null?fmt(tx.amountPaid):'—'}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600;color:${tx.balanceDue>0?'#dc2626':tx.balanceDue===0&&tx.balanceDue!=null?'#16a34a':'#9ca3af'}">
          ${tx.balanceDue!=null?fmt(tx.balanceDue):'—'}
        </td>
        <td style="padding:7px 10px;text-align:center;">
          <span style="padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;
            background:${tx.status==='paid'?'#dcfce7':tx.status==='partial'?'#fef3c7':tx.type==='payment'?'#dcfce7':'#fee2e2'};
            color:${tx.status==='paid'?'#15803d':tx.status==='partial'?'#b45309':tx.type==='payment'?'#15803d':'#b91c1c'}">
            ${tx.type==='payment'?tx.direction:(tx.status||'—')}
          </span>
        </td>
      </tr>
    `).join('');
    const totalAmount = history.filter(t=>t.type!=='payment').reduce((s,t)=>s+t.amount,0);
    const totalPaid   = ledger?.totalPaid || 0;
    const balanceDue  = ledger?.balanceDue || 0;
    const win = window.open('', '_blank', 'width=1000,height=750');
    win.document.write(`<!DOCTYPE html><html><head><title>Transaction History – ${row.name}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:28px}
      h1{font-size:22px;font-weight:bold;margin-bottom:3px}
      .meta{color:#666;font-size:12px;margin-bottom:20px}
      .summary{display:flex;gap:20px;margin-bottom:24px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px}
      .s-item .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.05em}
      .s-item .val{font-size:18px;font-weight:bold;margin-top:3px}
      .val.green{color:#16a34a}.val.red{color:#dc2626}.val.blue{color:#2563eb}.val.purple{color:#7c3aed}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#555;border-bottom:2px solid #e5e7eb}
      tfoot tr td{background:#f9fafb;font-weight:bold;border-top:2px solid #d1d5db;padding:8px 10px}
      .footer{margin-top:18px;font-size:10px;color:#aaa;text-align:right}
    </style></head><body>
    <h1>Transaction History</h1>
    <p class="meta">${row.name} · ${typeLabel}${row.email?' · '+row.email:''}${row.phone?' · '+row.phone:''}</p>
    <div class="summary">
      ${isCustomer?`
        <div class="s-item"><div class="label">Total Invoiced</div><div class="val blue">${fmt(ledger?.totalInvoiced||0)}</div></div>
        <div class="s-item"><div class="label">Total Paid</div><div class="val green">${fmt(totalPaid)}</div></div>
        <div class="s-item"><div class="label">Balance Due (AR)</div><div class="val ${balanceDue>0?'red':'green'}">${fmt(balanceDue)}</div></div>
      `:`
        <div class="s-item"><div class="label">Total Costs</div><div class="val purple">${fmt(ledger?.totalCosts||0)}</div></div>
        <div class="s-item"><div class="label">Total Paid</div><div class="val green">${fmt(totalPaid)}</div></div>
        <div class="s-item"><div class="label">Balance Due (AP)</div><div class="val ${balanceDue>0?'red':'green'}">${fmt(balanceDue)}</div></div>
      `}
    </div>
    <table>
      <thead><tr>
        <th>Date</th><th>Type</th><th>Reference</th><th>Description</th>
        <th style="text-align:right">Amount</th><th style="text-align:right">Paid</th>
        <th style="text-align:right">Balance</th><th style="text-align:center">Status</th>
      </tr></thead>
      <tbody>${trows}</tbody>
      <tfoot><tr>
        <td colspan="4">Totals (${history.length} transaction${history.length!==1?'s':''})</td>
        <td style="text-align:right">${fmt(totalAmount)}</td>
        <td style="text-align:right;color:#16a34a">${fmt(totalPaid)}</td>
        <td style="text-align:right;color:${balanceDue>0?'#dc2626':'#16a34a'}">${fmt(balanceDue)}</td>
        <td></td>
      </tr></tfoot>
    </table>
    <div class="footer">Printed on ${new Date().toLocaleString()}</div>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vendors & Customers</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Accounts Receivable (1200) · Accounts Payable (2000)
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Customers"
          value={totals.customerCount}
          sub="total"
          color="blue"
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"
        />
        <SummaryCard
          label="Accounts Receivable"
          value={fmt(totals.totalAR)}
          sub="balance due (1200)"
          color="green"
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <SummaryCard
          label="Vendors"
          value={totals.vendorCount}
          sub="total"
          color="purple"
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"
        />
        <SummaryCard
          label="Accounts Payable"
          value={fmt(totals.totalAP)}
          sub="balance due (2000)"
          color="red"
          icon="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Table Panel */}
        <div className={`${selectedRow ? 'md:w-1/2' : 'flex-1'} bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden`}>
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {TABS.map(t2 => (
                <button
                  key={t2}
                  onClick={() => setTab(t2)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors capitalize ${
                    tab === t2
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {t2 === 'all' ? 'All' : t2 === 'customer' ? 'Customers' : 'Vendors'}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, industry…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">They Owe Me (AR)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">🪙 Wallet</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">I Owe Them (AP)</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 dark:text-gray-500">
                      No records found
                    </td>
                  </tr>
                )}
                {filtered.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => { setSelected(selected === row.id ? null : row.id); setHistoryTab('all'); }}
                    className={`cursor-pointer transition-colors ${
                      selected === row.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${row.isVendor ? 'bg-purple-500' : 'bg-blue-500'}`}>
                          {row.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.name}</p>
                          <p className="text-xs text-gray-400">{row.email || row.industry || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {row.isCustomer && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Customer</span>}
                        {row.isVendor   && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">Vendor</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.customer ? (
                        <span className={`font-medium ${row.customer.balanceDue > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                          {fmt(row.customer.balanceDue)}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.isCustomer && row.walletBalance > 0.001 ? (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          🪙 {fmt(row.walletBalance)}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.vendor ? (
                        <span className={`font-medium ${row.vendor.balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                          {fmt(row.vendor.balanceDue)}
                        </span>
                      ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                      {row.customer ? (row.customer.invoices?.length ?? 0) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel — full transaction history */}
        {selectedRow && (
          <div className="md:w-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden self-start">
            {/* Panel Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${selectedRow.isVendor ? 'bg-purple-500' : 'bg-blue-500'}`}>
                    {selectedRow.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">{selectedRow.name}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{selectedRow.industry || selectedRow.kind || (selectedRow.isVendor ? 'Vendor' : 'Customer')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrint(selectedRow, filteredHistory, fmt, fmtDate)}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-1.5"
                    title="Print Transaction History"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Balance Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {selectedRow.isCustomer && selectedRow.customer && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">💰 They Owe Me (AR)</p>
                    <p className={`text-lg font-bold ${selectedRow.customer.balanceDue > 0 ? 'text-green-700 dark:text-green-300' : 'text-gray-400'}`}>
                      {fmt(selectedRow.customer.balanceDue)}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-gray-500">Invoiced: <span className="font-medium">{fmt(selectedRow.customer.totalInvoiced)}</span></p>
                      <p className="text-xs text-gray-500">Paid: <span className="font-medium text-green-600">{fmt(selectedRow.customer.totalPaid)}</span></p>
                    </div>
                  </div>
                )}
                {selectedRow.isVendor && selectedRow.vendor && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">📤 I Owe Them (AP)</p>
                    <p className={`text-lg font-bold ${selectedRow.vendor.balanceDue > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-400'}`}>
                      {fmt(selectedRow.vendor.balanceDue)}
                    </p>
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-gray-500">Total Costs: <span className="font-medium">{fmt(selectedRow.vendor.totalCosts)}</span></p>
                      <p className="text-xs text-gray-500">Paid: <span className="font-medium text-green-600">{fmt(selectedRow.vendor.totalPaid)}</span></p>
                    </div>
                  </div>
                )}
              </div>

              {/* Wallet Card — customers only */}
              {selectedRow.isCustomer && selectedRow.walletBalance > 0.001 && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">🪙 Wallet Credit</p>
                    <span className="text-base font-bold text-amber-700 dark:text-amber-300">{fmt(selectedRow.walletBalance)}</span>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400">This credit will be automatically applied to the customer's next invoices.</p>
                  {/* Mini wallet history */}
                  {(() => {
                    const walletTxs = (getCustomerWalletTransactions(selectedRow.id) || []).slice(0, 5);
                    return walletTxs.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-amber-200 dark:border-amber-700 pt-2">
                        {walletTxs.map(tx => (
                          <div key={tx.id} className="flex justify-between text-xs">
                            <span className={tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}>
                              {tx.type === 'credit' ? '+' : '−'} {tx.reason}
                            </span>
                            <span className="font-medium">{fmt(tx.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Contact Info */}
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
                {selectedRow.email && <span>✉ {selectedRow.email}</span>}
                {selectedRow.phone && <span>📞 {selectedRow.phone}</span>}
                {selectedRow.address && <span>📍 {selectedRow.address}</span>}
              </div>
            </div>

            {/* History Tabs */}
            <div className="px-5 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Transaction History</p>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'invoices', label: 'Invoices' },
                  { key: 'purchases', label: 'Purchases' },
                  { key: 'payments', label: 'Payments' },
                ].map(ht => (
                  <button
                    key={ht.key}
                    onClick={() => setHistoryTab(ht.key)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      historyTab === ht.key
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    {ht.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Transaction List */}
            <div className="overflow-y-auto max-h-96 divide-y divide-gray-100 dark:divide-gray-700">
              {filteredHistory.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">No transactions found</div>
              )}
              {filteredHistory.map(tx => (
                <div key={tx.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Type Icon */}
                      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        tx.type === 'invoice'  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' :
                        tx.type === 'purchase' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' :
                                                 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300'
                      }`}>
                        {tx.type === 'invoice' ? '📄' : tx.type === 'purchase' ? '🛒' : '💵'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{tx.number}</span>
                          <StatusBadge type={tx.type} status={tx.status} direction={tx.direction} />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{tx.description}</p>
                        {tx.invoiceNumber && <p className="text-xs text-gray-400">→ Invoice {tx.invoiceNumber}</p>}
                        {tx.purchaseCostNumber && <p className="text-xs text-gray-400">→ Purchase {tx.purchaseCostNumber}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(tx.date)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {/* Amount */}
                      <p className={`text-sm font-semibold ${
                        tx.type === 'payment' && tx.direction === 'received' ? 'text-green-600 dark:text-green-400' :
                        tx.type === 'payment' && tx.direction === 'sent' ? 'text-red-600 dark:text-red-400' :
                        tx.type === 'invoice' ? 'text-blue-700 dark:text-blue-300' :
                        'text-orange-700 dark:text-orange-300'
                      }`}>
                        {tx.type === 'payment'
                          ? (tx.direction === 'received' ? '+' : '−') + fmt(tx.amount)
                          : fmt(tx.amount)}
                      </p>
                      {/* Balance Due */}
                      {tx.balanceDue != null && (
                        <p className={`text-xs mt-0.5 ${tx.balanceDue > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {tx.balanceDue > 0 ? `Due: ${fmt(tx.balanceDue)}` : 'Fully Paid'}
                        </p>
                      )}
                      {tx.amountPaid != null && tx.amountPaid > 0 && tx.type !== 'payment' && (
                        <p className="text-xs text-gray-400">Paid: {fmt(tx.amountPaid)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* History Footer — totals */}
            {filteredHistory.length > 0 && (
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                {filteredHistory.length} transaction{filteredHistory.length !== 1 ? 's' : ''}
                {historyTab === 'all' && (
                  <span className="ml-2">
                    · Invoiced: {fmt(filteredHistory.filter(t=>t.type==='invoice').reduce((s,t)=>s+t.amount,0))}
                    · Purchases: {fmt(filteredHistory.filter(t=>t.type==='purchase').reduce((s,t)=>s+t.amount,0))}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ type, status, direction }) {
  if (type === 'payment') {
    return direction === 'received'
      ? <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Received</span>
      : <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Sent</span>;
  }
  const map = {
    paid:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    partial:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    sent:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    draft:     'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    pending:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  };
  const cls = map[status] || 'bg-gray-100 text-gray-500';
  return <span className={`px-1.5 py-0.5 rounded text-xs ${cls} capitalize`}>{status}</span>;
}

function SummaryCard({ label, value, sub, color, icon }) {
  const colors = {
    blue:   'from-blue-500 to-blue-600',
    green:  'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    red:    'from-red-500 to-red-600',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center flex-shrink-0`}>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-400">{sub}</p>
      </div>
    </div>
  );
}
