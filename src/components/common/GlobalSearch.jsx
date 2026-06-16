// components/common/GlobalSearch.jsx
// Global search overlay — Cmd/Ctrl+K to open, searches across all modules + AI Help.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInvoices, getPayments, getExpenses, getCompanies,
  getOpportunities, getQuotations, getSalesOrders,
  getCurrentUser, hasPermission, ROLE_PERMISSIONS, CURRENCIES
} from '../../data/store';

// ─── AI Assistant ─────────────────────────────────────────────────────────────
const AI_HINTS = {
  invoices: [
    'Search by invoice number, customer name, status (draft/sent/paid), or amount',
    'Type "inv" followed by number to find specific invoices quickly',
    'Filter by status: draft, sent, confirmed, partial, paid, overdue, cancelled'
  ],
  payments: [
    'Search by payment reference, method (bank_transfer/cash/check), or type (inbound/outbound)',
    'Find payments linked to specific invoices by invoice number',
    'Track inbound customer payments vs outbound vendor payments'
  ],
  expenses: [
    'Search by description, category (travel/meals/supplies/other), vendor, or amount',
    'Filter expenses by status: pending, approved, rejected',
    'Expense categories: travel, meals, supplies, utilities, rent, salaries, other'
  ],
  companies: [
    'Search by company name, email, phone, or industry',
    'Distinguish vendors and customers by type field',
    'Add notes and industry tags for better organization'
  ],
  general: [
    'Use arrow keys ↑↓ to navigate results, Enter to open, Esc to close',
    'Type at least 2 characters to start searching',
    'Search covers all modules: invoices, payments, expenses, companies, and more'
  ]
};

// AI response generator based on query
function generateAIResponse(query, results, allData) {
  if (!query || query.length < 2) return null;

  const q = query.toLowerCase();
  const response = {
    type: 'ai_suggestion',
    title: '',
    suggestions: [],
    quickActions: []
  };

  // Check if user is looking for specific help
  const isInvoiceSearch = q.includes('invoice') || q.includes('inv') || q.includes('bill');
  const isPaymentSearch = q.includes('payment') || q.includes('pay') || q.includes('transaction');
  const isExpenseSearch = q.includes('expense') || q.includes('cost') || q.includes('spending');
  const isCompanySearch = q.includes('company') || q.includes('customer') || q.includes('vendor') || q.includes('client');
  const isReportSearch = q.includes('report') || q.includes('summary') || q.includes('analytics');
  const isCurrencySearch = q.includes('currency') || q.includes('exchange') || q.includes('rate') || q.includes('$') || q.includes('€') || q.includes('£');

  if (results.length === 0) {
    response.title = `No results found for "${query}"`;
    response.suggestions.push(`Try different keywords or check your spelling`);

    if (isInvoiceSearch) {
      response.suggestions.push(...AI_HINTS.invoices);
      response.quickActions.push({ label: 'Create New Invoice', path: '/invoices', icon: '🧾' });
    } else if (isPaymentSearch) {
      response.suggestions.push(...AI_HINTS.payments);
      response.quickActions.push({ label: 'Record Payment', path: '/payments', icon: '💳' });
    } else if (isExpenseSearch) {
      response.suggestions.push(...AI_HINTS.expenses);
      response.quickActions.push({ label: 'Add Expense', path: '/expenses', icon: '💸' });
    } else if (isCompanySearch) {
      response.suggestions.push(...AI_HINTS.companies);
      response.quickActions.push({ label: 'Add Company', path: '/companies', icon: '🏢' });
    } else if (isReportSearch) {
      response.suggestions.push('Check Reports section for comprehensive analytics');
      response.quickActions.push({ label: 'View Reports', path: '/reports', icon: '📊' });
    } else if (isCurrencySearch) {
      response.suggestions.push('Currency rates are available in Settings');
      response.quickActions.push({ label: 'Currency Settings', path: '/settings', icon: '💱' });
    } else {
      response.suggestions.push(...AI_HINTS.general);
    }
  } else if (results.length > 0) {
    response.title = `Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query}"`;

    // Group results by type for summary
    const groups = {};
    results.forEach(r => {
      if (!groups[r.type]) groups[r.type] = 0;
      groups[r.type]++;
    });

    const topTypes = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 3);
    topTypes.forEach(([type, count]) => {
      response.suggestions.push(`${count} ${type}${count > 1 ? 's' : ''} found`);
    });

    // Add specific helpful tips based on search context
    if (isInvoiceSearch && results.some(r => r.type === 'Invoice')) {
      response.suggestions.push('Tip: Click an invoice to view details and record payments');
    } else if (isPaymentSearch && results.some(r => r.type === 'Payment')) {
      response.suggestions.push('Tip: Payment records show linked invoices and amounts');
    } else if (isExpenseSearch && results.some(r => r.type === 'Expense')) {
      response.suggestions.push('Tip: Expenses need approval before accounting entry');
    }

    // Add quick action if no direct results
    if (results.length < 3) {
      if (isInvoiceSearch) response.quickActions.push({ label: 'Create Invoice', path: '/invoices', icon: '🧾' });
      if (isPaymentSearch) response.quickActions.push({ label: 'Record Payment', path: '/payments', icon: '💳' });
    }
  }

  return response;
}

// ─── helpers ────────────────────────────────────────────────────────────────
const highlight = (text, query) => {
  if (!query || !text) return text;
  const str = String(text);
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return str;
  return (
    <>
      {str.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">{str.slice(idx, idx + query.length)}</mark>
      {str.slice(idx + query.length)}
    </>
  );
};

const fmtCur = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(Number(amount) || 0);
  } catch {
    return `$${Number(amount || 0).toFixed(0)}`;
  }
};

// ─── result builders ─────────────────────────────────────────────────────────
function buildResults(query, user, data = {}) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const role = user?.role || 'contact';
  const perms = ROLE_PERMISSIONS[role]?.permissions || {};

  const results = [];

  // Invoices
  if (perms.invoices?.length > 0) {
    (data.invoices    || []).forEach(inv => {
      const company = inv.companyName || inv.company || '';
      if (
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        company.toLowerCase().includes(q) ||
        inv.status?.toLowerCase().includes(q) ||
        String(inv.total || '').includes(q)
      ) {
        results.push({
          id: `inv-${inv.id}`,
          type: 'Invoice',
          typeIcon: '🧾',
          typeColor: 'bg-blue-100 text-blue-700',
          title: inv.invoiceNumber || 'Invoice',
          subtitle: company,
          meta: `${inv.status} · ${fmtCur(inv.total, inv.currency)}`,
          path: '/invoices',
          state: { highlightId: inv.id },
          raw: inv,
        });
      }
    });
  }

  // Payments
  if (perms.payments?.length > 0) {
    (data.payments    || []).forEach(pay => {
      if (
        pay.reference?.toLowerCase().includes(q) ||
        pay.invoiceId?.toLowerCase().includes(q) ||
        pay.method?.toLowerCase().includes(q) ||
        pay.type?.toLowerCase().includes(q) ||
        String(pay.amount || '').includes(q)
      ) {
        results.push({
          id: `pay-${pay.id}`,
          type: 'Payment',
          typeIcon: '💳',
          typeColor: 'bg-green-100 text-green-700',
          title: pay.reference || `Payment ${pay.id?.slice(-6)}`,
          subtitle: pay.method ? pay.method.replace('_', ' ') : pay.type,
          meta: `${pay.type} · ${fmtCur(pay.amount)}`,
          path: '/payments',
          state: { highlightId: pay.id },
          raw: pay,
        });
      }
    });
  }

  // Expenses
  if (perms.expenses?.length > 0) {
    (data.expenses    || []).forEach(exp => {
      if (
        exp.description?.toLowerCase().includes(q) ||
        exp.category?.toLowerCase().includes(q) ||
        exp.vendor?.toLowerCase().includes(q) ||
        exp.status?.toLowerCase().includes(q) ||
        String(exp.amount || '').includes(q)
      ) {
        results.push({
          id: `exp-${exp.id}`,
          type: 'Expense',
          typeIcon: '💸',
          typeColor: 'bg-orange-100 text-orange-700',
          title: exp.description || `Expense ${exp.id?.slice(-6)}`,
          subtitle: exp.category ? exp.category.charAt(0).toUpperCase() + exp.category.slice(1) : '',
          meta: `${exp.status} · ${fmtCur(exp.amount)}`,
          path: '/expenses',
          state: { highlightId: exp.id },
          raw: exp,
        });
      }
    });
  }

  // Journal Entries
  if (perms.journalEntries?.length > 0) {
    (data.journalEntries || []).forEach(je => {
      if (
        je.reference?.toLowerCase().includes(q) ||
        je.description?.toLowerCase().includes(q) ||
        je.entries?.some(e => e.accountName?.toLowerCase().includes(q))
      ) {
        results.push({
          id: `je-${je.id}`,
          type: 'Journal Entry',
          typeIcon: '📒',
          typeColor: 'bg-purple-100 text-purple-700',
          title: je.reference || `JE ${je.id?.slice(-6)}`,
          subtitle: je.description || '',
          meta: je.isPosted ? 'Posted' : 'Draft',
          path: '/journal',
          state: { highlightId: je.id },
          raw: je,
        });
      }
    });
  }

  // Chart of Accounts
  if (perms.chartOfAccounts?.length > 0) {
    (data.accounts    || []).forEach(acc => {
      if (
        acc.name?.toLowerCase().includes(q) ||
        acc.code?.toLowerCase().includes(q) ||
        acc.type?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `acc-${acc.id}`,
          type: 'Account',
          typeIcon: '📊',
          typeColor: 'bg-indigo-100 text-indigo-700',
          title: acc.name,
          subtitle: `${acc.code || ''} · ${acc.type}`,
          meta: fmtCur(acc.balance),
          path: '/accounts',
          state: { highlightId: acc.id },
          raw: acc,
        });
      }
    });
  }

  // Companies
  if (perms.companies?.length > 0) {
    (data.companies   || []).forEach(co => {
      if (
        co.name?.toLowerCase().includes(q) ||
        co.email?.toLowerCase().includes(q) ||
        co.phone?.toLowerCase().includes(q) ||
        co.industry?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `co-${co.id}`,
          type: 'Company',
          typeIcon: '🏢',
          typeColor: 'bg-teal-100 text-teal-700',
          title: co.name,
          subtitle: co.industry || co.email || '',
          meta: co.kind === 'person' ? 'Individual' : 'Company',
          path: '/companies',
          state: { highlightId: co.id },
          raw: co,
        });
      }
    });
  }

  // Opportunities
  if (perms.opportunities?.length > 0) {
    (data.opportunities || []).forEach(opp => {
      if (
        opp.title?.toLowerCase().includes(q) ||
        opp.companyName?.toLowerCase().includes(q) ||
        opp.stage?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `opp-${opp.id}`,
          type: 'Opportunity',
          typeIcon: '⚡',
          typeColor: 'bg-yellow-100 text-yellow-700',
          title: opp.title || 'Opportunity',
          subtitle: opp.companyName || '',
          meta: `${opp.stage} · ${fmtCur(opp.value)}`,
          path: '/opportunities',
          state: { highlightId: opp.id },
          raw: opp,
        });
      }
    });
  }

  // Quotations
  if (perms.quotations?.length > 0) {
    (data.quotations  || []).forEach(qt => {
      if (
        qt.quotationNumber?.toLowerCase().includes(q) ||
        qt.companyName?.toLowerCase().includes(q) ||
        qt.status?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `qt-${qt.id}`,
          type: 'Quotation',
          typeIcon: '📄',
          typeColor: 'bg-cyan-100 text-cyan-700',
          title: qt.quotationNumber || 'Quotation',
          subtitle: qt.companyName || '',
          meta: qt.status,
          path: '/quotations',
          state: { highlightId: qt.id },
          raw: qt,
        });
      }
    });
  }

  // Sales Orders
  if (perms.salesOrders?.length > 0) {
    (data.salesOrders || []).forEach(so => {
      if (
        so.orderNumber?.toLowerCase().includes(q) ||
        so.companyName?.toLowerCase().includes(q) ||
        so.status?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `so-${so.id}`,
          type: 'Sales Order',
          typeIcon: '📋',
          typeColor: 'bg-pink-100 text-pink-700',
          title: so.orderNumber || 'Sales Order',
          subtitle: so.companyName || '',
          meta: so.status,
          path: '/sales-orders',
          state: { highlightId: so.id },
          raw: so,
        });
      }
    });
  }

  // Purchase Costs
  if (perms.purchaseCosts?.length > 0) {
    (data.purchaseCosts || []).forEach(pc => {
      if (
        pc.reference?.toLowerCase().includes(q) ||
        pc.vendorName?.toLowerCase().includes(q) ||
        pc.status?.toLowerCase().includes(q) ||
        String(pc.total || '').includes(q)
      ) {
        results.push({
          id: `pc-${pc.id}`,
          type: 'Purchase Cost',
          typeIcon: '🛒',
          typeColor: 'bg-rose-100 text-rose-700',
          title: pc.reference || `PC ${pc.id?.slice(-6)}`,
          subtitle: pc.vendorName || '',
          meta: `${pc.status} · ${fmtCur(pc.total)}`,
          path: '/purchase-costs',
          state: { highlightId: pc.id },
          raw: pc,
        });
      }
    });
  }

  // Cost Items
  if (perms.costItems?.length > 0) {
    (data.costItems   || []).forEach(ci => {
      if (
        ci.name?.toLowerCase().includes(q) ||
        ci.description?.toLowerCase().includes(q) ||
        ci.category?.toLowerCase().includes(q)
      ) {
        results.push({
          id: `ci-${ci.id}`,
          type: 'Cost Item',
          typeIcon: '🔧',
          typeColor: 'bg-gray-100 text-gray-700',
          title: ci.name || `Cost Item`,
          subtitle: ci.category || '',
          meta: fmtCur(ci.amount || ci.unitCost),
          path: '/cost-items',
          state: { highlightId: ci.id },
          raw: ci,
        });
      }
    });
  }

  return results.slice(0, 30);
}

// ─── component ───────────────────────────────────────────────────────────────
export default function GlobalSearch({ open: openProp, onClose }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (val) => {
    if (onClose && !val) onClose();
    else if (openProp === undefined) setInternalOpen(val);
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiResponse, setAiResponse] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [searchData, setSearchData] = useState({});

  // Load all data when search is opened
  useEffect(() => {
    if (!open) return;
    Promise.all([
          getInvoices(), getPayments(), getExpenses(), getCompanies(),
      getOpportunities(), getQuotations(), getSalesOrders(),
    ]).then(([invoices, payments, expenses, companies, opportunities, quotations, salesOrders]) => {
      setSearchData({ invoices, payments, expenses, companies, opportunities, quotations, salesOrders });
    }).catch(() => {});
  }, [open]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Build results on query change
  useEffect(() => {
    const res = buildResults(query, user, searchData);
    setResults(res);
    setActiveIdx(0);
    // Generate AI response for the query
    if (query.length >= 2) {
      setAiResponse(generateAIResponse(query, res, null));
    } else {
      setAiResponse(null);
    }
  }, [query, searchData]);

  const goToResult = useCallback((result) => {
    navigate(result.path, { state: result.state });
    setOpen(false);
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      goToResult(results[activeIdx]);
    }
  };

  if (!open) return null;

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const flatIndexed = results; // for keyboard nav

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3 border-b border-gray-100">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search invoices, payments, companies…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 ml-3 text-base text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className="ml-3 flex-shrink-0 text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Type at least 2 characters to search across all modules
            </div>
          )}

          {query.length >= 2 && results.length === 0 && aiResponse && (
            <div className="px-4 py-6">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">AI</span>
                  <span className="font-semibold text-gray-800">{aiResponse.title}</span>
                </div>
                <div className="space-y-2">
                  {aiResponse.suggestions.map((suggestion, idx) => (
                    <p key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {suggestion}
                    </p>
                  ))}
                </div>
                {aiResponse.quickActions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-blue-100 flex flex-wrap gap-2">
                    {aiResponse.quickActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => { navigate(action.path); setOpen(false); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-sm text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                      >
                        <span>{action.icon}</span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {query.length >= 2 && !aiResponse && results.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No results found for "<strong className="text-gray-600">{query}</strong>"
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2">
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                    {type}s
                  </div>
                  {items.map(result => {
                    const flatIdx = flatIndexed.indexOf(result);
                    const isActive = flatIdx === activeIdx;
                    return (
                      <button
                        key={result.id}
                        onClick={() => goToResult(result)}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        className={`w-full flex items-center px-4 py-3 text-left transition-colors ${
                          isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-xl flex-shrink-0 w-8">{result.typeIcon}</span>
                        <div className="flex-1 min-w-0 ml-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${result.typeColor}`}>
                              {result.type}
                            </span>
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {highlight(result.title, query)}
                            </span>
                          </div>
                          {result.subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {highlight(result.subtitle, query)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{result.meta}</span>
                        {isActive && (
                          <svg className="w-4 h-4 text-blue-500 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-xs text-gray-400">
          <span><kbd className="border border-gray-300 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-gray-300 rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-gray-300 rounded px-1">Esc</kbd> close</span>
          <span className="ml-auto">{results.length > 0 ? `${results.length} results` : ''}</span>
        </div>
      </div>
    </div>
  );
}
