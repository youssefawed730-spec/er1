// components/sales/Quotations.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import InternalChat from '../common/InternalChat';
import {
  getQuotations, saveQuotation, deleteQuotation, confirmQuotation,
  convertQuotationToSalesOrder, getOpportunities, saveOpportunity, getCompanies,
  getCurrentUser, hasPermission, getTaxConfigs, CURRENCIES, getInvoices, saveInvoice,
  getSalesOrders, subscribeToEvents, getNextInvoiceNumber, saveInternalMemo, getInternalMemos,
  getPurchaseCosts, getNextQuotationNumber
} from '../../data/store';

const CURRENCY_LIST = Object.values(CURRENCIES);

function convertAmount(amount, fromCurrency, toCurrency) {
  const from = CURRENCIES[fromCurrency] || CURRENCIES.USD;
  const to   = CURRENCIES[toCurrency]   || CURRENCIES.USD;
  const usd  = amount / from.rate;
  return usd * to.rate;
}

function convertCurrency(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = CURRENCIES[fromCurrency]?.rate || 1;
  const toRate   = CURRENCIES[toCurrency]?.rate   || 1;
  return amount * (toRate / fromRate);
}

function formatAmount(amount, currencyCode) {
  const cur = CURRENCIES[currencyCode] || CURRENCIES.USD;
  return cur.symbol + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [taxConfigs, setTaxConfigs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [viewQuotation, setViewQuotation] = useState(null);
  const user = getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [chatQuote, setChatQuote] = useState(null);
  const [allSalesOrders, setAllSalesOrders] = useState([]);
  const [allInternalMemos, setAllInternalMemos] = useState([]);
  const [viewMemoData, setViewMemoData] = useState(null);
  const [showAggregateMemoModal, setShowAggregateMemoModal] = useState(false);
  const [selectedOpportunityForMemo, setSelectedOpportunityForMemo] = useState(null);
  const isHeadOfOperation = user?.role === 'head_of_operation';

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const unsub = subscribeToEvents((e) => {
      if (['quotations_expired', 'quotation_confirmed', 'quotation_converted',
        'salesOrder_confirmed', 'company_updated', 'opportunity_saved', 'internal_memo_saved'].includes(e.type)) {
        loadData();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (location.state?.fromOpportunity) {
      setSelectedOpportunity(location.state.fromOpportunity);
      setEditingQuotation(null);
      setShowModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const loadData = () => {
    const p1 = getQuotations().then(allQuotations => {
      if (user?.role === 'sales') {
        allQuotations = allQuotations.filter(q => q.assignedTo === user.id || q.createdBy === user.role);
      }
      setQuotations(allQuotations);
    }).catch(() => {});

    const p2 = getOpportunities().then(opps => {
      let allOpps = opps.filter(o => o.stage !== 'closed_lost');
      if (user?.role === 'sales') {
        allOpps = allOpps.filter(o => o.assignedTo === user.id);
      }
      setOpportunities(allOpps);
    }).catch(() => {});

    const p3 = getCompanies().then(setCompanies).catch(()=>{});
    const p4 = getTaxConfigs().then(setTaxConfigs).catch(()=>{});
    const p5 = getSalesOrders().then(setAllSalesOrders).catch(()=>{});
    const p6 = getInternalMemos().then(setAllInternalMemos).catch(()=>{});
    return Promise.all([p1, p2, p3, p4, p5, p6]);
  };

  const filterByOpportunity = location.state?.filterByOpportunity;
  const displayedQuotations = filterByOpportunity
    ? quotations.filter(q => q.opportunityId === filterByOpportunity)
    : quotations;

  const canCreate = hasPermission(user?.role, 'quotations', 'write') && user?.role !== 'sales';
  const isOperation = user?.role === 'operation' || isHeadOfOperation;
  const isSales = user?.role === 'sales' || user?.role === 'head_of_sales';

  const handleSave = async (quotation) => {
    try {
      await saveQuotation(quotation);
      await loadData();
      setShowModal(false);
      setEditingQuotation(null);
      setSelectedOpportunity(null);
    } catch (err) {
      alert('Failed to save quotation: ' + err.message);
    }
  };

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to delete this quotation?')) {
      deleteQuotation(id);
      loadData();
    }
  };

  const handleConfirm = async (id) => {
    try {
      await confirmQuotation(id);
      await loadData();
      if (user?.role === 'operation' || isHeadOfOperation) {
        alert('Quotation approved by Operations!');
      }
    } catch (err) {
      alert('Failed to approve quotation: ' + err.message);
    }
  };

  const handleConvertToSalesOrder = async (id) => {
    try {
      const salesOrder = await convertQuotationToSalesOrder(id);
      if (salesOrder) {
        alert(`Quotation converted to Sales Order ${salesOrder.number}`);
        await loadData();
      }
    } catch (err) {
      alert('Failed to convert: ' + err.message);
    }
  };

  const handleConvertToInvoice = async (quotation) => {
    try {
      const invoice = await directConvertQuotationToInvoice(quotation);
      if (invoice) {
        alert(`Invoice ${invoice.number} created successfully from Quotation!`);
        await loadData();
        setViewQuotation(null);
      }
    } catch (err) {
      alert('Failed to create invoice: ' + err.message);
    }
  };

  const handleCreateInternalMemo = async (quotation) => {
    try {
      const allPurchaseCosts = await getPurchaseCosts();
    const linkedCosts = allPurchaseCosts.filter(c => c.quotationId === quotation.id);
    const totalPurchaseCost = linkedCosts.reduce((sum, c) => sum + (Number(c.buyPrice || c.amount) || 0), 0);

    // Enrich line items with purchase cost breakdown if costs exist
    const enrichedLineItems = (quotation.lineItems || []).map(item => {
      const matchingCost = linkedCosts.find(c => c.description === item.description);
      return {
        ...item,
        buyPrice: item.buyPrice || (matchingCost ? Number(matchingCost.buyPrice || matchingCost.amount) : 0),
        sellPrice: item.sellPrice || 0,
      };
    });

    // Compute profitByCurrency from enriched items (so buyPrice from purchase costs is reflected)
    const profitByCurrency = {};
    enrichedLineItems.forEach(item => {
      const currency = item.currency || 'USD';
      const profit = (item.sellPrice - (item.buyPrice || 0)) * item.quantity;
      if (!profitByCurrency[currency]) profitByCurrency[currency] = 0;
      profitByCurrency[currency] += profit;
    });
    // Add purchase cost profit (sellPrice - buyPrice) into the total
    linkedCosts.forEach(cost => {
      const buy = Number(cost.buyPrice || cost.amount || 0);
      const sell = Number(cost.sellPrice || 0);
      if (sell > 0) {
        if (!profitByCurrency['USD']) profitByCurrency['USD'] = 0;
        profitByCurrency['USD'] += sell - buy;
      }
    });

    const memo = await saveInternalMemo({
      quotationId: quotation.id,
      quotationNumber: quotation.number,
      opportunityId: quotation.opportunityId,
      opportunityTitle: quotation.opportunityTitle,
      companyId: quotation.companyId,
      companyName: quotation.companyName,
      date: new Date().toISOString().split('T')[0],
      lineItems: enrichedLineItems,
      subtotal: quotation.subtotal,
      taxRate: quotation.taxRate,
      taxAmount: quotation.taxAmount,
      total: quotation.total,
      displayCurrency: quotation.displayCurrency || 'USD',
      notes: `Memo for Quotation ${quotation.number}\n${quotation.notes || ''}`,
      status: 'draft',
      createdBy: user?.role,
      profitByCurrency: profitByCurrency,
      quotationIds: [quotation.id],
      isAggregate: false,
      purchaseCosts: linkedCosts,
      totalPurchaseCost: totalPurchaseCost,
    });
    alert(`Internal Memo ${memo?.number || ''} created from Quotation ${quotation.number}`);
    await loadData();
    setViewQuotation(null);
  } catch (err) {
    alert('Failed to create internal memo: ' + err.message);
  }
};

  const handleCreateAggregateInternalMemo = async (opportunityId) => {
    try {
    const opportunity = opportunities.find(o => o.id === opportunityId);
    if (!opportunity) {
      alert('Opportunity not found');
      return;
    }

    const relatedQuotations = quotations.filter(q => q.opportunityId === opportunityId);
    if (relatedQuotations.length === 0) {
      alert('No quotations found for this opportunity');
      return;
    }

    const allPurchaseCosts = await getPurchaseCosts();
    const allLinkedCosts = allPurchaseCosts.filter(c =>
      relatedQuotations.some(q => q.id === c.quotationId)
    );
    const totalPurchaseCost = allLinkedCosts.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    const allLineItems = [];
    const profitByCurrency = {};
    let totalSubtotalUSD = 0;
    let totalTaxAmountUSD = 0;
    let totalTotalUSD = 0;
    const quotationIds = [];

    relatedQuotations.forEach(quotation => {
      quotationIds.push(quotation.id);
      const quotCosts = allLinkedCosts.filter(c => c.quotationId === quotation.id);
      (quotation.lineItems || []).forEach(item => {
        const matchingCost = quotCosts.find(c => c.description === item.description);
        const lineItemWithSource = {
          ...item,
          buyPrice: item.buyPrice || (matchingCost ? Number(matchingCost.buyPrice || matchingCost.amount) : 0),
          sellPrice: item.sellPrice || 0,
          sourceQuotation: quotation.number,
          sourceQuotationId: quotation.id
        };
        allLineItems.push(lineItemWithSource);

        const currency = item.currency || 'USD';
        const profit = (item.sellPrice - (item.buyPrice || 0)) * item.quantity;
        if (!profitByCurrency[currency]) profitByCurrency[currency] = 0;
        profitByCurrency[currency] += profit;
      });
      totalSubtotalUSD += quotation.subtotal || 0;
      totalTaxAmountUSD += quotation.taxAmount || 0;
      totalTotalUSD += quotation.total || 0;
    });

    // Add purchase cost profit into profitByCurrency totals
    allLinkedCosts.forEach(cost => {
      const buy = Number(cost.buyPrice || cost.amount || 0);
      const sell = Number(cost.sellPrice || 0);
      if (sell > 0) {
        if (!profitByCurrency['USD']) profitByCurrency['USD'] = 0;
        profitByCurrency['USD'] += sell - buy;
      }
    });

    const avgTaxRate = relatedQuotations.reduce((sum, q) => sum + (q.taxRate || 0), 0) / relatedQuotations.length;

    const memo = await saveInternalMemo({
      quotationId: null,
      quotationNumber: `AGG-${opportunity.blNumber || opportunity.id.slice(0, 8)}`,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      companyId: opportunity.companyId || opportunity.customerId,
      companyName: opportunity.customerName,
      date: new Date().toISOString().split('T')[0],
      lineItems: allLineItems,
      subtotal: totalSubtotalUSD,
      taxRate: avgTaxRate,
      taxAmount: totalTaxAmountUSD,
      total: totalTotalUSD,
      displayCurrency: 'USD',
      notes: `Aggregate Internal Memo for Opportunity: ${opportunity.title}\nBL Number: ${opportunity.blNumber || 'N/A'}\nIncludes ${relatedQuotations.length} quotation(s): ${relatedQuotations.map(q => q.number).join(', ')}`,
      status: 'draft',
      createdBy: user?.role,
      profitByCurrency: profitByCurrency,
      quotationIds: quotationIds,
      isAggregate: true,
      opportunityBlNumber: opportunity.blNumber,
      purchaseCosts: allLinkedCosts,
      totalPurchaseCost: totalPurchaseCost,
    });

    alert(`Aggregate Internal Memo ${memo?.number || ''} created for Opportunity ${opportunity.title} (${relatedQuotations.length} quotations combined)`);
    await loadData();
    setShowAggregateMemoModal(false);
    setSelectedOpportunityForMemo(null);
  } catch (err) {
    alert('Failed to create aggregate memo: ' + err.message);
  }
};

  // Always enrich a memo with the latest purchase costs from the store,
  // so that costs added/edited after the memo was created are reflected.
  const hydrateMemoWithLatestCosts = (memo) => {
    if (!memo) return memo;
    const allPurchaseCosts = getPurchaseCosts();
    let latestCosts;
    if (memo.isAggregate && memo.quotationIds && memo.quotationIds.length > 0) {
      latestCosts = allPurchaseCosts.filter(c =>
        memo.quotationIds.includes(c.quotationId)
      );
    } else if (memo.quotationId) {
      latestCosts = allPurchaseCosts.filter(c => c.quotationId === memo.quotationId);
    } else {
      latestCosts = memo.purchaseCosts || [];
    }
    const latestTotal = latestCosts.reduce((sum, c) => sum + (Number(c.buyPrice || c.amount) || 0), 0);

    // Recompute profitByCurrency: line items profit + purchase cost profit
    const profitByCurrency = {};
    (memo.lineItems || []).forEach(item => {
      const currency = item.currency || 'USD';
      const profit = ((item.sellPrice || 0) - (item.buyPrice || 0)) * (item.quantity || 0);
      if (!profitByCurrency[currency]) profitByCurrency[currency] = 0;
      profitByCurrency[currency] += profit;
    });
    latestCosts.forEach(cost => {
      const buy = Number(cost.buyPrice || cost.amount || 0);
      const sell = Number(cost.sellPrice || 0);
      if (sell > 0) {
        if (!profitByCurrency['USD']) profitByCurrency['USD'] = 0;
        profitByCurrency['USD'] += sell - buy;
      }
    });

    return {
      ...memo,
      purchaseCosts: latestCosts,
      totalPurchaseCost: latestTotal,
      profitByCurrency,
    };
  };

  const handleViewInternalMemo = (quotation) => {
    let memo = allInternalMemos.find(m => m.quotationId === quotation.id);
    if (!memo) {
      memo = allInternalMemos.find(m => m.quotationIds && m.quotationIds.includes(quotation.id));
    }
    if (memo) {
      setViewMemoData(hydrateMemoWithLatestCosts(memo));
    } else {
      alert('No internal memo found for this quotation.');
    }
  };

  const handlePrintInternalMemo = (quotation) => {
    let memo = allInternalMemos.find(m => m.quotationId === quotation.id);
    if (!memo) {
      memo = allInternalMemos.find(m => m.quotationIds && m.quotationIds.includes(quotation.id));
    }
    if (memo) {
      printInternalMemo(hydrateMemoWithLatestCosts(memo));
    } else {
      alert('No internal memo found for this quotation.');
    }
  };

  const handlePrintMemoById = (memoId) => {
    const memo = allInternalMemos.find(m => m.id === memoId);
    if (memo) {
      printInternalMemo(hydrateMemoWithLatestCosts(memo));
    } else {
      alert('Memo not found');
    }
  };

  const handleViewMemoById = (memoId) => {
    const memo = allInternalMemos.find(m => m.id === memoId);
    if (memo) {
      setViewMemoData(hydrateMemoWithLatestCosts(memo));
    }
  };

  const handleUpdateOpportunityStage = async (opportunityId, stage) => {
    const opp = opportunities.find(o => o.id === opportunityId);
    if (opp) {
      try {
        await saveOpportunity({ ...opp, stage, updatedAt: new Date().toISOString() });
        await loadData();
      } catch (err) {
        alert('Failed to update opportunity stage: ' + err.message);
      }
    }
  };

  const getStatusColor = (status, operationConfirmed, accountingConfirmed) => {
    if (status === 'expired') return 'bg-red-100 text-red-700';
    if (status === 'approved') return 'bg-green-100 text-green-700';
    if (operationConfirmed) return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getStatusText = (status, operationConfirmed, accountingConfirmed) => {
    if (status === 'expired') return 'Expired';
    if (status === 'approved') return 'Approved';
    if (operationConfirmed) return 'Approved';
    return 'Pending Approval';
  };

  const opportunityStages = [
    { value: 'lead', label: 'Lead' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'closed_won', label: 'Closed Won' },
    { value: 'closed_lost', label: 'Closed Lost' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-500">Create quotations from opportunities and convert to sales orders</p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setEditingQuotation(null); setSelectedOpportunity(null); setShowModal(true); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Quotation
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Quote #</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Opportunity</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">BL Number</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              {isSales && <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Opp. Stage</th>}
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Chat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedQuotations.length === 0 ? (
              <tr>
                <td colSpan={isSales ? 10 : 9} className="px-6 py-12 text-center text-sm text-gray-400">
                  {filterByOpportunity ? 'No quotations found for this opportunity.' : 'No quotations found.'}
                </td>
              </tr>
            ) : displayedQuotations.map((quote) => {
              const linkedOpp = opportunities.find(o => o.id === quote.opportunityId);
              const displayCurrency = quote.displayCurrency || 'USD';
              const displayTotal = quote.displayCurrency && quote.displayCurrency !== 'USD'
                ? formatAmount(convertAmount(quote.total, 'USD', quote.displayCurrency), quote.displayCurrency)
                : formatAmount(quote.total, 'USD');
              const hasMemo = allInternalMemos.some(m => m.quotationId === quote.id || (m.quotationIds && m.quotationIds.includes(quote.id)));
              const aggregateMemo = allInternalMemos.find(m => m.isAggregate && m.quotationIds && m.quotationIds.includes(quote.id));
              const relatedQuotationsCount = quotations.filter(q => q.opportunityId === quote.opportunityId).length;
              return (
                <React.Fragment key={quote.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{quote.number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {linkedOpp?.title || quote.opportunityTitle || '-'}
                      {relatedQuotationsCount > 1 && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {relatedQuotationsCount} quotes
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-blue-600">{linkedOpp?.blNumber || quote.blNumber || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{quote.companyName}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(quote.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {displayTotal}
                      {quote.displayCurrency && quote.displayCurrency !== 'USD' && (
                        <span className="text-xs text-gray-400 ml-1">({quote.displayCurrency})</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(quote.status, quote.operationConfirmed, quote.accountingConfirmed)}`}>
                        {getStatusText(quote.status, quote.operationConfirmed, quote.accountingConfirmed)}
                      </span>
                    </td>
                    {isSales && (
                      <td className="px-6 py-4">
                        {linkedOpp ? (
                          <select
                            value={linkedOpp.stage || 'lead'}
                            onChange={(e) => handleUpdateOpportunityStage(linkedOpp.id, e.target.value)}
                            className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            {opportunityStages.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => setViewQuotation(quote)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>

                        <button
                          onClick={() => navigate('/sales-orders', { state: { filterByQuotation: quote.id } })}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors relative"
                          title="View Sales Orders"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          {allSalesOrders.filter(so => so.quotationId === quote.id).length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                              {allSalesOrders.filter(so => so.quotationId === quote.id).length}
                            </span>
                          )}
                        </button>

                        {aggregateMemo && (
                          <>
                            <button
                              onClick={() => handleViewMemoById(aggregateMemo.id)}
                              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="View Aggregate Memo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePrintMemoById(aggregateMemo.id)}
                              className="p-2 text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Print Aggregate Memo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                          </>
                        )}

                        {relatedQuotationsCount > 1 && !aggregateMemo && (
                          <button
                            onClick={() => {
                              setSelectedOpportunityForMemo(linkedOpp);
                              setShowAggregateMemoModal(true);
                            }}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title={`Create Aggregate Memo for all ${relatedQuotationsCount} quotations`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}

                        {hasMemo && !aggregateMemo && (
                          <>
                            <button
                              onClick={() => handleViewInternalMemo(quote)}
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title="View Internal Memo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePrintInternalMemo(quote)}
                              className="p-2 text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Print Internal Memo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                          </>
                        )}

                        {isOperation && !quote.operationConfirmed && quote.status !== 'approved' && (
                          <button onClick={() => handleConfirm(quote.id)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Approve Quotation">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}

                        {isOperation && quote.operationConfirmed && !quote.convertedToSalesOrder && (
                          <button onClick={() => handleConvertToSalesOrder(quote.id)}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Convert to Sales Order">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                          </button>
                        )}

                        {(quote.status === 'draft' || !quote.operationConfirmed) && (
                          <button onClick={() => handleDelete(quote.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    {(isSales || isOperation) && (
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => setChatQuote(chatQuote === quote.id ? null : quote.id)}
                          className={`p-2 rounded-lg transition-colors relative ${chatQuote === quote.id ? 'bg-blue-100 text-blue-700' : 'text-blue-500 hover:bg-blue-50'}`}
                          title="Internal Chat (Ops ↔ Sales)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </button>
                      </td>
                    )}
                    {!isSales && !isOperation && <td />}
                  </tr>
                  {chatQuote === quote.id && (
                    <tr key={quote.id + '_chat'}>
                      <td colSpan={isSales ? 10 : 9} className="px-6 pb-4 bg-blue-50">
                        <InternalChat
                          refId={quote.id}
                          refType="quotation"
                          opportunityId={quote.opportunityId}
                          title={`${quote.number} — ${quote.companyName}`}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <QuotationModal
          quotation={editingQuotation}
          opportunities={opportunities}
          companies={companies}
          taxConfigs={taxConfigs}
          selectedOpportunity={selectedOpportunity}
          user={user}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingQuotation(null); setSelectedOpportunity(null); }}
        />
      )}

      {viewQuotation && (
        <QuotationViewModal
          quotation={viewQuotation}
          opportunities={opportunities}
          quotations={quotations}
          onClose={() => setViewQuotation(null)}
          onConvertToInvoice={handleConvertToInvoice}
          onCreateInternalMemo={handleCreateInternalMemo}
          onCreateAggregateInternalMemo={handleCreateAggregateInternalMemo}
          onPrintInternalMemo={handlePrintInternalMemo}
          onPrintMemoById={handlePrintMemoById}
          existingMemo={allInternalMemos.find(m => m.quotationId === viewQuotation.id)}
          aggregateMemo={allInternalMemos.find(m => m.isAggregate && m.quotationIds && m.quotationIds.includes(viewQuotation.id))}
          allMemos={allInternalMemos}
          onViewMemo={handleViewMemoById}
        />
      )}

      {viewMemoData && (
        <InternalMemoViewModal
          memo={viewMemoData}
          onClose={() => setViewMemoData(null)}
          onPrint={() => printInternalMemo(viewMemoData)}
        />
      )}

      {showAggregateMemoModal && selectedOpportunityForMemo && (
        <AggregateMemoModal
          opportunity={selectedOpportunityForMemo}
          quotations={quotations.filter(q => q.opportunityId === selectedOpportunityForMemo.id)}
          onConfirm={() => handleCreateAggregateInternalMemo(selectedOpportunityForMemo.id)}
          onCancel={() => {
            setShowAggregateMemoModal(false);
            setSelectedOpportunityForMemo(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Aggregate Memo Confirmation Modal ────────────────────────────────────────
function AggregateMemoModal({ opportunity, quotations, onConfirm, onCancel }) {
  const totalValue = quotations.reduce((sum, q) => sum + (q.total || 0), 0);

  const profitByCurrency = {};
  quotations.forEach(quote => {
    (quote.lineItems || []).forEach(item => {
      const currency = item.currency || 'USD';
      const profit = (item.sellPrice - (item.buyPrice || 0)) * item.quantity;
      if (!profitByCurrency[currency]) profitByCurrency[currency] = 0;
      profitByCurrency[currency] += profit;
    });
  });

  const formatCurrency = (amount, currency) => {
    const cur = CURRENCIES[currency] || CURRENCIES.USD;
    return cur.symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create Aggregate Internal Memo</h2>
          <p className="text-sm text-gray-500 mt-1">Combine all quotations from this opportunity</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Opportunity Details</h3>
            <p className="text-sm"><strong>Title:</strong> {opportunity.title}</p>
            <p className="text-sm"><strong>BL Number:</strong> {opportunity.blNumber || 'N/A'}</p>
            <p className="text-sm"><strong>Customer:</strong> {opportunity.customerName}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Quotations to Combine ({quotations.length})</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {quotations.map(quote => (
                <div key={quote.id} className="flex justify-between items-center text-sm p-2 bg-white rounded border">
                  <span className="font-mono">{quote.number}</span>
                  <span className="text-gray-600">{new Date(quote.date).toLocaleDateString()}</span>
                  <span className="font-medium">{formatCurrency(quote.total, quote.displayCurrency || 'USD')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h3 className="font-semibold text-amber-900 mb-2">Profit Summary by Currency</h3>
            <div className="space-y-1">
              {Object.entries(profitByCurrency).map(([currency, amount]) => (
                <div key={currency} className="flex justify-between text-sm">
                  <span>{currency} Profit:</span>
                  <span className="font-bold text-green-600">{formatCurrency(amount, currency)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-green-900">Total Combined Value:</span>
              <span className="text-xl font-bold text-green-700">{formatCurrency(totalValue, 'USD')}</span>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Create Aggregate Memo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Internal Memo View Modal ────────────────────────────────────────────────
function InternalMemoViewModal({ memo, onClose, onPrint }) {
  if (!memo) {
    return null;
  }

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatCurrency = (amount, currency) => {
    if (amount === undefined || amount === null) return '—';
    const cur = CURRENCIES[currency] || CURRENCIES.USD;
    return cur.symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const memoNumber = memo.number || memo.memoNumber || 'N/A';
  const memoDate = memo.date || new Date().toISOString().split('T')[0];
  const memoCompany = memo.companyName || '—';
  const memoQuotation = memo.quotationNumber || (memo.isAggregate ? 'AGGREGATE' : '—');
  const memoCreatedBy = memo.createdBy || '—';
  const memoLineItems = memo.lineItems || [];
  const memoProfitByCurrency = memo.profitByCurrency || {};
  const memoNotes = memo.notes || '';
  const isAggregate = memo.isAggregate || false;
  const memoPurchaseCosts = memo.purchaseCosts || [];
  const memoTotalPurchaseCost = memo.totalPurchaseCost || 0;

  const groupedByQuotation = {};
  if (isAggregate) {
    memoLineItems.forEach(item => {
      const source = item.sourceQuotation || 'Unknown';
      if (!groupedByQuotation[source]) groupedByQuotation[source] = [];
      groupedByQuotation[source].push(item);
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isAggregate ? '📊 Aggregate Internal Memo' : 'Internal Memo'} {memoNumber}
            </h2>
            <p className="text-sm text-gray-500">Created on {formatDate(memoDate)}</p>
            {isAggregate && memo.quotationIds && (
              <p className="text-xs text-purple-600 mt-1">
                Combines {memo.quotationIds.length} quotation(s)
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onPrint}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">
                {isAggregate ? 'Opportunity' : 'Quotation No.'}
              </p>
              <p className="font-semibold text-gray-900 mt-1">
                {isAggregate ? memo.opportunityTitle : memoQuotation}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Memo No.</p>
              <p className="font-semibold text-gray-900 mt-1">{memoNumber}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Customer</p>
              <p className="font-semibold text-gray-900 mt-1">{memoCompany}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Date</p>
              <p className="font-semibold text-gray-900 mt-1">{formatDate(memoDate)}</p>
            </div>
            {isAggregate && memo.opportunityBlNumber && (
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">BL Number</p>
                <p className="font-semibold text-gray-900 mt-1 font-mono">{memo.opportunityBlNumber}</p>
              </div>
            )}
          </div>

          {isAggregate && Object.keys(groupedByQuotation).length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Quotations Included</h3>
              <div className="flex flex-wrap gap-2">
                {Object.keys(groupedByQuotation).map(quoteNum => (
                  <span key={quoteNum} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-mono">
                    {quoteNum}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase">
                  {isAggregate && <th className="px-4 py-3 text-left">Quote #</th>}
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-center">Currency</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Sell Price</th>
                  <th className="px-4 py-3 text-right">Buy Price</th>
                  <th className="px-4 py-3 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {memoLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={isAggregate ? 7 : 6} className="px-4 py-8 text-center text-sm text-gray-400">
                      No line items available
                    </td>
                  </tr>
                ) : (
                  memoLineItems.map((item, idx) => {
                    const profit = ((item.sellPrice || 0) - (item.buyPrice || 0)) * (item.quantity || 0);
                    const currency = item.currency || 'USD';
                    return (
                      <tr key={idx}>
                        {isAggregate && (
                          <td className="px-4 py-3 text-sm font-mono text-blue-600">
                            {item.sourceQuotation || '—'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm">{item.description || '—'}</td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{currency}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{item.quantity || 0}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.sellPrice || 0, currency)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(item.buyPrice || 0, currency)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{formatCurrency(profit, currency)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-amber-800 mb-3">Profit Summary (by currency)</h3>
            <div className="space-y-2">
              {Object.keys(memoProfitByCurrency).length === 0 ? (
                <p className="text-sm text-gray-500">No profit data available</p>
              ) : (
                Object.entries(memoProfitByCurrency).map(([currency, amount]) => (
                  <div key={currency} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">{currency} Total Profit:</span>
                    <span className={`text-lg font-bold ${amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(amount, currency)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {memoPurchaseCosts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-sm font-semibold text-red-800 mb-3">Purchase Costs</h3>
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b border-red-200">
                    <th className="pb-2 text-left">Description</th>
                    <th className="pb-2 text-left">Vendor</th>
                    <th className="pb-2 text-right">Buy Price</th>
                    <th className="pb-2 text-right">Sell Price</th>
                    <th className="pb-2 text-right">Profit</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {memoPurchaseCosts.map((cost, i) => {
                    const buy = Number(cost.buyPrice || cost.amount || 0);
                    const sell = Number(cost.sellPrice || 0);
                    const profit = sell - buy;
                    return (
                      <tr key={i}>
                        <td className="py-2 text-gray-800">{cost.description || '—'}</td>
                        <td className="py-2 text-gray-600">{cost.vendor || '—'}</td>
                        <td className="py-2 text-right text-gray-800">{formatCurrency(buy, 'USD')}</td>
                        <td className="py-2 text-right text-gray-800">{sell > 0 ? formatCurrency(sell, 'USD') : '—'}</td>
                        <td className={`py-2 text-right font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {sell > 0 ? formatCurrency(profit, 'USD') : '—'}
                        </td>
                        <td className="py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cost.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {cost.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-between items-center pt-2 border-t border-red-200">
                <span className="text-sm font-semibold text-red-800">Total Purchase Cost Profit:</span>
                <span className={`text-base font-bold ${memoPurchaseCosts.reduce((sum, c) => { const sell = Number(c.sellPrice || 0); return sell > 0 ? sum + (sell - Number(c.buyPrice || c.amount || 0)) : sum; }, 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(memoPurchaseCosts.reduce((sum, c) => { const sell = Number(c.sellPrice || 0); return sell > 0 ? sum + (sell - Number(c.buyPrice || c.amount || 0)) : sum; }, 0), 'USD')}
                </span>
              </div>
            </div>
          )}

          {memoNotes && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Notes</p>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{memoNotes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-200">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium mb-2">Prepared By</p>
              <div className="border-t border-gray-300 pt-2 w-48"></div>
              <p className="text-sm text-gray-600 mt-2">{memoCreatedBy}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium mb-2">Approved By</p>
              <div className="border-t border-gray-300 pt-2 w-48"></div>
              <p className="text-sm text-gray-600 mt-2">Head of Operations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quotation View Modal ────────────────────────────────────────────────────
function QuotationViewModal({ quotation, opportunities, quotations, onClose, onConvertToInvoice, onCreateInternalMemo, onCreateAggregateInternalMemo, onPrintInternalMemo, onPrintMemoById, existingMemo, aggregateMemo, allMemos, onViewMemo }) {
  const [viewCurrency, setViewCurrency] = useState(quotation.displayCurrency || 'USD');
  const user = getCurrentUser();
  const isOperation = user?.role === 'operation' || user?.role === 'head_of_operation';

  const linkedOpp = opportunities.find(o => o.id === quotation.opportunityId);
  const relatedQuotations = quotations?.filter(q => q.opportunityId === quotation.opportunityId) || [];
  const hasMultipleQuotations = relatedQuotations.length > 1;

  const fmtDisplay = (amountUSD) => {
    const converted = convertAmount(amountUSD, 'USD', viewCurrency);
    return formatAmount(converted, viewCurrency);
  };

  const fmtLine = (amount, currency) => formatAmount(amount, currency || 'USD');

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{quotation.number}</h2>
            <p className="text-sm text-gray-500">Created on {formatDate(quotation.date)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">View Total In</label>
              <select value={viewCurrency} onChange={(e) => setViewCurrency(e.target.value)}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                {CURRENCY_LIST.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => printQuotation(quotation, linkedOpp, viewCurrency, fmtDisplay, fmtLine, formatDate, formatAmount)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-900 text-sm font-medium transition-colors"
              title="Print / Save as PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <div className="p-6">
          {linkedOpp && (
            <div className="flex items-center gap-2 flex-wrap mb-5 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs">
              <span className="text-gray-400 font-medium uppercase tracking-wide">Source:</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                🎯 {linkedOpp.title}
              </span>
              {linkedOpp.blNumber && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  🔢 BL: {linkedOpp.blNumber}
                </span>
              )}
              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                📋 {quotation.number}
              </span>
              {hasMultipleQuotations && (
                <>
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                    📋 +{relatedQuotations.length - 1} more quotes
                  </span>
                </>
              )}
              {existingMemo && (
                <>
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                    📝 {existingMemo.number}
                  </span>
                </>
              )}
              {aggregateMemo && (
                <>
                  <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <button
                    onClick={() => onViewMemo(aggregateMemo.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium hover:bg-purple-200 transition-colors"
                  >
                    📊 {aggregateMemo.number}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Company</p>
                <p className="font-semibold text-gray-900 mt-1">{quotation.companyName}</p>
                {quotation.companyEmail && <p className="text-sm text-gray-600 mt-0.5">✉ {quotation.companyEmail}</p>}
                {quotation.companyPhone && <p className="text-sm text-gray-600 mt-0.5">📞 {quotation.companyPhone}</p>}
                {quotation.companyAddress && <p className="text-sm text-gray-600 mt-0.5">📍 {quotation.companyAddress}</p>}
                {quotation.companyTaxId && <p className="text-sm text-gray-600 mt-0.5">🪪 Tax ID: {quotation.companyTaxId}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Quotation Info</p>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-gray-700"><span className="text-gray-500">Date:</span> {formatDate(quotation.date)}</p>
                  <p className="text-sm text-gray-700"><span className="text-gray-500">Valid Until:</span> {formatDate(quotation.validUntil)}</p>
                  {linkedOpp && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Opportunity & BL</p>
                      <p className="font-medium text-gray-900 mt-0.5">{linkedOpp.title}</p>
                      <p className="text-sm font-mono text-blue-600 mt-0.5">BL: {linkedOpp.blNumber || '—'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${linkedOpp.stage === 'closed_won' ? 'bg-green-100 text-green-700' :
                        linkedOpp.stage === 'closed_lost' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>{linkedOpp.stage?.replace('_', ' ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-center">Currency</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Sell Price</th>
                  <th className="px-4 py-3 text-right">Buy Price</th>
                  <th className="px-4 py-3 text-right">Profit</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(quotation.lineItems || []).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{item.currency || 'USD'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-right">{fmtLine(item.sellPrice || item.unitPrice || 0, item.currency)}</td>
                    <td className="px-4 py-3 text-sm text-right">{fmtLine(item.buyPrice || 0, item.currency)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-green-600">{fmtLine(item.profit || 0, item.currency)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{fmtLine(item.amount, item.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal (USD base):</span>
                  <span className="font-medium">{formatAmount(quotation.subtotal, 'USD')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({quotation.taxRate}%):</span>
                  <span className="font-medium">{formatAmount(quotation.taxAmount, 'USD')}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2">
                  <span>Total ({viewCurrency}):</span>
                  <span className="text-blue-700">{fmtDisplay(quotation.total)}</span>
                </div>
                {viewCurrency !== 'USD' && (
                  <p className="text-xs text-gray-400 text-right">≈ {formatAmount(quotation.total, 'USD')} USD</p>
                )}
              </div>
            </div>
          </div>

          {quotation.notes && (
            <div className="mt-6">
              <p className="text-sm text-gray-500">Notes</p>
              <p className="text-sm text-gray-700 mt-1">{quotation.notes}</p>
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Approval Status</p>
            <div className="flex space-x-4">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${quotation.operationConfirmed ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-600">Operations</span>
              </div>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${quotation.accountingConfirmed ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-sm text-gray-600">Accounting</span>
              </div>
            </div>
          </div>

          {/* Version History */}
          {quotation.versionHistory && quotation.versionHistory.length > 0 && (
            <div className="mt-6">
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 list-none">
                  <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Version History ({quotation.versionHistory.length} revision{quotation.versionHistory.length !== 1 ? 's' : ''})
                  <span className="ml-2 text-xs text-gray-400">Current: v{quotation.version || 1}</span>
                </summary>
                <div className="mt-3 space-y-2">
                  {[...quotation.versionHistory].reverse().map((snap, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        v{snap.version}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-700">Saved {snap.savedAt ? new Date(snap.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${snap.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{snap.status}</span>
                          {snap.savedBy && <span className="text-gray-400 text-xs">by {snap.savedBy}</span>}
                        </div>
                        {snap.total != null && (
                          <p className="text-gray-500 text-xs mt-0.5">Total: {Number(snap.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        )}
                        {snap.lineItems && snap.lineItems.length > 0 && (
                          <p className="text-gray-400 text-xs">{snap.lineItems.length} line item{snap.lineItems.length !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            {hasMultipleQuotations && !aggregateMemo && (
              <button
                onClick={() => onCreateAggregateInternalMemo(quotation.opportunityId)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Create Aggregate Memo ({relatedQuotations.length} quotes)
              </button>
            )}

            {aggregateMemo && (
              <>
                <button
                  onClick={() => onViewMemo(aggregateMemo.id)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Aggregate Memo
                </button>
                <button
                  onClick={() => onPrintMemoById(aggregateMemo.id)}
                  className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Aggregate Memo
                </button>
              </>
            )}

            {existingMemo ? (
              <button
                onClick={() => onPrintInternalMemo(quotation)}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Internal Memo
              </button>
            ) : (
              !hasMultipleQuotations && (
                <button
                  onClick={() => onCreateInternalMemo(quotation)}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Create Internal Memo
                </button>
              )
            )}

            {isOperation && !quotation.convertedToInvoice && (
              <button
                onClick={() => onConvertToInvoice(quotation)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Create Invoice
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Print Quotation ──────────────────────────────────────────────────────────
function printQuotation(quotation, linkedOpp, viewCurrency, fmtDisplay, fmtLine, formatDate, formatAmount) {
  const cur = CURRENCIES[viewCurrency] || CURRENCIES.USD;
  const lineRows = (quotation.lineItems || []).map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;">${item.description || ''}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">
        <span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${item.currency || 'USD'}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">${item.quantity || 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;">${fmtLine(item.unitPrice, item.currency)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right;font-weight:600;">${fmtLine(item.amount, item.currency)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Quotation ${quotation.number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;padding:40px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #2563eb;}
    .brand{font-size:22px;font-weight:800;color:#2563eb;letter-spacing:-0.5px;}
    .doc-info{text-align:right;}
    .doc-number{font-size:20px;font-weight:700;color:#111;}
    .doc-label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px;}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;}
    .card-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:10px;}
    .card p{font-size:13px;color:#334155;margin-bottom:4px;line-height:1.5;}
    .card .name{font-size:15px;font-weight:700;color:#111;margin-bottom:6px;}
    table{width:100%;border-collapse:collapse;margin-bottom:24px;}
    thead{background:#f1f5f9;}
    thead th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;}
    thead th.right{text-align:right;}
    thead th.center{text-align:center;}
    .totals{display:flex;justify-content:flex-end;margin-bottom:24px;}
    .totals-box{width:300px;}
    .totals-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#334155;}
    .totals-total{display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:800;color:#2563eb;border-top:2px solid #e2e8f0;margin-top:4px;}
    .notes{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:24px;}
    .notes-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#92400e;margin-bottom:6px;}
    .notes p{font-size:13px;color:#78350f;}
    .approval{display:flex;gap:16px;margin-bottom:24px;}
    .approval-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;}
    .dot{width:10px;height:10px;border-radius:50%;}
    .dot.green{background:#22c55e;}
    .dot.gray{background:#d1d5db;}
    .footer{text-align:center;font-size:11px;color:#94a3b8;padding-top:20px;border-top:1px solid #e2e8f0;}
    .chain{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:20px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;}
    .badge{padding:3px 10px;border-radius:20px;font-weight:600;font-size:11px;}
    .badge-opp{background:#ede9fe;color:#7c3aed;}
    .badge-quot{background:#dbeafe;color:#1d4ed8;}
    .badge-so{background:#dcfce7;color:#15803d;}
    .arrow{color:#94a3b8;font-size:14px;}
    @media print{body{padding:20px;}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">QUOTATION</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>
    </div>
    <div class="doc-info">
      <div class="doc-label">Reference</div>
      <div class="doc-number">${quotation.number}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Valid until ${formatDate(quotation.validUntil)}</div>
    </div>
  </div>

  ${linkedOpp ? `
  <div class="chain">
    <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Source:</span>
    <span class="badge badge-opp">🎯 ${linkedOpp.title} ${linkedOpp.blNumber ? `| BL: ${linkedOpp.blNumber}` : ''}</span>
    <span class="arrow">›</span>
    <span class="badge badge-quot">📋 ${quotation.number}</span>
    ${quotation.salesOrderNumber ? `<span class="arrow">›</span><span class="badge badge-so">📦 ${quotation.salesOrderNumber}</span>` : ''}
  </div>` : ''}

  <div class="grid2">
    <div class="card">
      <div class="card-title">Bill To</div>
      <p class="name">${quotation.companyName || '—'}</p>
      ${quotation.companyEmail ? `<p>✉ ${quotation.companyEmail}</p>` : ''}
      ${quotation.companyPhone ? `<p>📞 ${quotation.companyPhone}</p>` : ''}
      ${quotation.companyAddress ? `<p>📍 ${quotation.companyAddress}</p>` : ''}
      ${quotation.companyTaxId ? `<p>🪪 Tax ID: ${quotation.companyTaxId}</p>` : ''}
    </div>
    <div class="card">
      <div class="card-title">Quotation Details</div>
      <p><strong>Date:</strong> ${formatDate(quotation.date)}</p>
      <p><strong>Valid Until:</strong> ${formatDate(quotation.validUntil)}</p>
      <p><strong>Currency:</strong> ${viewCurrency} (${cur.symbol})</p>
      ${linkedOpp ? `<p><strong>BL Number:</strong> ${linkedOpp.blNumber || '—'}</p>` : ''}
      ${linkedOpp ? `<p><strong>Opportunity:</strong> ${linkedOpp.title}</p>` : ''}
      <p><strong>Status:</strong> ${quotation.status === 'approved' || quotation.operationConfirmed ? 'Approved' : 'Pending Approval'}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="center">Currency</th>
        <th class="right">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal (USD base):</span><span>${formatAmount(quotation.subtotal, 'USD')}</span></div>
      <div class="totals-row"><span>Tax (${quotation.taxRate}%):</span><span>${formatAmount(quotation.taxAmount, 'USD')}</span></div>
      <div class="totals-total"><span>Total (${viewCurrency}):</span><span>${fmtDisplay(quotation.total)}</span></div>
    </div>
  </div>

  ${quotation.notes ? `
  <div class="notes">
    <div class="notes-title">Notes</div>
    <p>${quotation.notes}</p>
  </div>` : ''}

  <div>
    <div class="card-title" style="margin-bottom:10px;">Approval Status</div>
    <div class="approval">
      <div class="approval-item"><div class="dot ${quotation.operationConfirmed ? 'green' : 'gray'}"></div>Operations ${quotation.operationConfirmed ? '✓ Approved' : '— Pending'}</div>
      <div class="approval-item"><div class="dot ${quotation.accountingConfirmed ? 'green' : 'gray'}"></div>Accounting ${quotation.accountingConfirmed ? '✓ Approved' : '— Pending'}</div>
    </div>
  </div>

  <div class="footer">
    This is a computer-generated quotation. For questions, please contact us. · ${quotation.number}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow popups to print the quotation.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Print Internal Memo (Supports both single and aggregate) ─────────────────
function printInternalMemo(memo) {
  if (!memo) {
    alert('No memo data to print');
    return;
  }
  
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  
  const formatCurrency = (amount, currency) => {
    if (amount === undefined || amount === null) return '—';
    const cur = CURRENCIES[currency] || CURRENCIES.USD;
    return cur.symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const memoNumber = memo.number || memo.memoNumber || 'N/A';
  const memoDate = memo.date || new Date().toISOString().split('T')[0];
  const memoCompany = memo.companyName || '—';
  const memoQuotation = memo.quotationNumber || (memo.isAggregate ? 'AGGREGATE' : '—');
  const memoCreatedBy = memo.createdBy || '—';
  const memoLineItems = memo.lineItems || [];
  const memoProfitByCurrency = memo.profitByCurrency || {};
  const isAggregate = memo.isAggregate || false;
  const memoNotes = memo.notes || '';

  // Build line items HTML
  let lineRows = '';
  if (isAggregate) {
    // For aggregate memos, group by source quotation
    const groupedByQuotation = {};
    memoLineItems.forEach(item => {
      const source = item.sourceQuotation || 'Unknown';
      if (!groupedByQuotation[source]) groupedByQuotation[source] = [];
      groupedByQuotation[source].push(item);
    });
    
    for (const [quoteNum, items] of Object.entries(groupedByQuotation)) {
      lineRows += `<tr style="background-color:#f3f4f6;"><td colspan="${isAggregate ? 7 : 6}" style="padding:8px 12px;font-weight:bold;font-size:12px;">📋 Quotation: ${quoteNum}</td></tr>`;
      items.forEach(item => {
        const profit = ((item.sellPrice || 0) - (item.buyPrice || 0)) * (item.quantity || 0);
        const currency = item.currency || 'USD';
        const cur = CURRENCIES[currency] || CURRENCIES.USD;
        lineRows += `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${(item.description || '—').replace(/[&<>]/g, function(m) {
              if (m === '&') return '&amp;';
              if (m === '<') return '&lt;';
              if (m === '>') return '&gt;';
              return m;
            })}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${currency}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.quantity || 0}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${cur.symbol}${(item.sellPrice || 0).toLocaleString()}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${cur.symbol}${(item.buyPrice || 0).toLocaleString()}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#16a34a;">${cur.symbol}${profit.toLocaleString()}</td>
          </tr>
        `;
      });
    }
  } else {
    // For single memos
    lineRows = memoLineItems.map(item => {
      const profit = ((item.sellPrice || 0) - (item.buyPrice || 0)) * (item.quantity || 0);
      const currency = item.currency || 'USD';
      const cur = CURRENCIES[currency] || CURRENCIES.USD;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${(item.description || '—').replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
          })}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${currency}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${item.quantity || 0}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${cur.symbol}${(item.sellPrice || 0).toLocaleString()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${cur.symbol}${(item.buyPrice || 0).toLocaleString()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#16a34a;">${cur.symbol}${profit.toLocaleString()}</td>
        </tr>
      `;
    }).join('');
  }

  // Build profit summary — profitByCurrency already includes purchase cost profit
  const profitSummary = [];
  for (const [currency, amount] of Object.entries(memoProfitByCurrency)) {
    if (amount !== 0 && amount !== undefined) {
      const cur = CURRENCIES[currency] || CURRENCIES.USD;
      const color = amount >= 0 ? '#16a34a' : '#dc2626';
      profitSummary.push(`<div style="padding:4px 0;display:flex;justify-content:space-between;font-size:14px;font-weight:700;"><span>${currency} Total Profit:</span><span style="color:${color};">${formatCurrency(amount, currency)}</span></div>`);
    }
  }

  const profitHtml = profitSummary.length > 0
    ? profitSummary.join('')
    : '<div style="padding:4px 0;">No profit data available</div>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${isAggregate ? 'Aggregate ' : ''}Internal Memo ${memoNumber}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;padding:40px;}
    .header{text-align:center;margin-bottom:40px;}
    .header h1{font-size:24px;font-weight:800;color:#d97706;letter-spacing:2px;margin-bottom:8px;}
    .header .subtitle{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:2px;}
    .info-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:30px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;}
    .info-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:4px;}
    .info-value{font-size:14px;font-weight:500;color:#1e293b;}
    .table-container{margin:24px 0;}
    table{width:100%;border-collapse:collapse;}
    thead{background:#f1f5f9;}
    thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;}
    thead th.right{text-align:right;}
    thead th.center{text-align:center;}
    .profit-section{margin:24px 0;padding:16px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;}
    .profit-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#92400e;margin-bottom:12px;}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;padding-top:20px;border-top:2px solid #e2e8f0;}
    .signature-line{margin-top:30px;padding-top:8px;border-top:1px solid #cbd5e1;width:200px;}
    .footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;}
    @media print{body{padding:20px;}}
  </style>
</head>
<body>
  <div class="header">
    <h1>${isAggregate ? '📊 AGGREGATE INTERNAL MEMO' : 'INTERNAL MEMO'}</h1>
    <div class="subtitle">Confidential - For Internal Use Only</div>
  </div>

  <div class="info-row">
    <div>
      <div class="info-label">${isAggregate ? 'Opportunity' : 'Quotation No.'}</div>
      <div class="info-value">${isAggregate ? (memo.opportunityTitle || '—') : memoQuotation}</div>
    </div>
    <div>
      <div class="info-label">Date</div>
      <div class="info-value">${formatDate(memoDate)}</div>
    </div>
    <div>
      <div class="info-label">Customer</div>
      <div class="info-value">${memoCompany.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
      })}</div>
    </div>
    <div>
      <div class="info-label">Memo No.</div>
      <div class="info-value">${memoNumber}</div>
    </div>
    ${isAggregate && memo.opportunityBlNumber ? `
    <div>
      <div class="info-label">BL Number</div>
      <div class="info-value">${memo.opportunityBlNumber}</div>
    </div>` : ''}
  </div>

  ${isAggregate && memo.quotationIds ? `
  <div style="margin-bottom:20px;padding:12px;background:#e0e7ff;border:1px solid #c7d2fe;border-radius:8px;">
    <div style="font-size:11px;font-weight:700;color:#3730a3;margin-bottom:6px;">QUOTATIONS INCLUDED</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${memo.quotationIds.map(id => {
        const quote = memo.lineItems.find(item => item.sourceQuotationId === id);
        return `<span style="background:#fff;padding:4px 12px;border-radius:16px;font-size:12px;font-family:monospace;">${quote?.sourceQuotation || id}</span>`;
      }).join('')}
    </div>
  </div>` : ''}

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="center">Currency</th>
          <th class="right">Qty</th>
          <th class="right">Sell Price</th>
          <th class="right">Buy Price</th>
          <th class="right">Profit</th>
        </tr>
      </thead>
      <tbody>${lineRows || '<tr><td colspan="6" style="padding:20px;text-align:center;">No line items</td></tr>'}</tbody>
    </table>
  </div>

  <div class="profit-section">
    <div class="profit-title">PROFIT SUMMARY (by currency)</div>
    ${profitHtml}
  </div>

  ${(memo.purchaseCosts && memo.purchaseCosts.length > 0) ? `
  <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
    <div style="font-size:11px;font-weight:700;color:#991b1b;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">PURCHASE COSTS</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#fee2e2;">
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7f1d1d;">Description</th>
          <th style="padding:6px 10px;text-align:left;font-weight:700;color:#7f1d1d;">Vendor</th>
          <th style="padding:6px 10px;text-align:right;font-weight:700;color:#7f1d1d;">Buy Price</th>
          <th style="padding:6px 10px;text-align:right;font-weight:700;color:#7f1d1d;">Sell Price</th>
          <th style="padding:6px 10px;text-align:right;font-weight:700;color:#7f1d1d;">Profit</th>
          <th style="padding:6px 10px;text-align:center;font-weight:700;color:#7f1d1d;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${memo.purchaseCosts.map(cost => {
          const buy = Number(cost.buyPrice || cost.amount || 0);
          const sell = Number(cost.sellPrice || 0);
          const profit = sell > 0 ? sell - buy : null;
          return `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;">${(cost.description || '—').replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;">${(cost.vendor || '—').replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;')}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;text-align:right;">$${buy.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;text-align:right;">${sell > 0 ? '$' + sell.toLocaleString('en-US', {minimumFractionDigits:2}) : '—'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;text-align:right;font-weight:600;color:${profit != null && profit >= 0 ? '#16a34a' : '#dc2626'};">
              ${profit != null ? '$' + profit.toLocaleString('en-US', {minimumFractionDigits:2}) : '—'}
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #fecaca;text-align:center;">${cost.status || '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid #fecaca;display:flex;justify-content:space-between;font-weight:700;font-size:13px;">
      <span style="color:#991b1b;">Total Purchase Cost Profit:</span>
      <span style="color:${(() => { const p = memo.purchaseCosts.reduce((sum, c) => { const sell = Number(c.sellPrice || 0); return sell > 0 ? sum + (sell - Number(c.buyPrice || c.amount || 0)) : sum; }, 0); return p >= 0 ? '#16a34a' : '#dc2626'; })()};">$${(() => { const p = memo.purchaseCosts.reduce((sum, c) => { const sell = Number(c.sellPrice || 0); return sell > 0 ? sum + (sell - Number(c.buyPrice || c.amount || 0)) : sum; }, 0); return p.toLocaleString('en-US', {minimumFractionDigits:2}); })()}</span>
    </div>
  </div>` : ''}

  ${memoNotes ? `
  <div style="margin:20px 0;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
    <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px;">NOTES</div>
    <div style="font-size:12px;color:#78350f;">${memoNotes.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    })}</div>
  </div>` : ''}

  <div class="signatures">
    <div>
      <div class="info-label">Prepared By</div>
      <div class="signature-line"></div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">${memoCreatedBy}</div>
    </div>
    <div>
      <div class="info-label">Approved By</div>
      <div class="signature-line"></div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;">Head of Operations</div>
    </div>
  </div>

  <div class="footer">
    This is a computer-generated ${isAggregate ? 'aggregate ' : ''}internal memo. For questions, please contact Operations.
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { 
    alert('Please allow popups to print the memo.'); 
    return; 
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Quotation Create/Edit Modal ───────────────────────────────────────────────
function makeLineItemId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'li_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function emptyLineItem() {
  return {
    id: makeLineItemId(),
    description: '',
    currency: 'USD',
    quantity: 1,
    sellPrice: 0,
    buyPrice: 0,
  };
}

// Normalize a BL number / search string for comparison: lowercase, and strip
// spaces/dashes/slashes so "BL-2024 001" and "bl2024001" still match.
function normalizeBL(str) {
  return (str || '').toString().toLowerCase().replace(/[\s\-_/]/g, '');
}

function QuotationModal({ quotation, opportunities, companies, taxConfigs, selectedOpportunity, user, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultValidUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const initialOpportunityId = quotation?.opportunityId || selectedOpportunity?.id || '';
  const initialCompanyId = quotation?.companyId
    || (() => {
      const opp = opportunities.find(o => o.id === initialOpportunityId);
      return opp?.companyId || opp?.customerId || '';
    })();

  const initialOpp = opportunities.find(o => o.id === initialOpportunityId);
  const [opportunityId, setOpportunityId] = useState(initialOpportunityId);
  const [oppSearch, setOppSearch] = useState(
    initialOpp ? (initialOpp.title + (initialOpp.blNumber ? ` (BL: ${initialOpp.blNumber})` : '')) : ''
  );
  const [oppDropdownOpen, setOppDropdownOpen] = useState(false);
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [date, setDate] = useState(quotation?.date || today);
  const [validUntil, setValidUntil] = useState(quotation?.validUntil || defaultValidUntil);
  const [taxRate, setTaxRate] = useState(quotation?.taxRate ?? (taxConfigs?.find(tc => tc.isDefault)?.rate ?? 0));
  const [displayCurrency, setDisplayCurrency] = useState(quotation?.displayCurrency || 'USD');
  const [notes, setNotes] = useState(quotation?.notes || '');
  const [lineItems, setLineItems] = useState(
    quotation?.lineItems?.length
      ? quotation.lineItems.map(li => ({
          id: li.id || makeLineItemId(),
          description: li.description || '',
          currency: li.currency || 'USD',
          quantity: li.quantity ?? 1,
          sellPrice: li.sellPrice ?? li.unitPrice ?? 0,
          buyPrice: li.buyPrice ?? 0,
        }))
      : [emptyLineItem()]
  );
  const [error, setError] = useState('');

  const isEditing = !!quotation?.id;

  // When the opportunity changes, auto-fill company, a starter line item, and
  // notes from the linked opportunity (only when creating a new quotation and
  // those fields are still at their defaults, so we never clobber user edits).
  const handleOpportunityChange = (oppId, opp) => {
    setOpportunityId(oppId);
    setOppSearch(opp ? (opp.title + (opp.blNumber ? ` (BL: ${opp.blNumber})` : '')) : '');
    setOppDropdownOpen(false);
    if (!opp) return;

    // Auto-fill company / customer
    const oppCompanyId = opp.companyId || opp.customerId;
    if (oppCompanyId && companies.some(c => c.id === oppCompanyId)) {
      setCompanyId(oppCompanyId);
    }

    if (isEditing) return; // don't overwrite an existing quotation's line items/notes

    // Auto-fill a starter line item from the opportunity, if the form is still blank
    setLineItems(prev => {
      const isBlank = prev.length === 1
        && !prev[0].description.trim()
        && Number(prev[0].sellPrice) === 0
        && Number(prev[0].buyPrice) === 0;
      if (!isBlank) return prev;
      return [{
        ...emptyLineItem(),
        description: opp.title || opp.description || '',
        currency: 'USD',
        quantity: 1,
        sellPrice: Number(opp.value) || 0,
        buyPrice: Number(opp.costEstimate) || 0,
      }];
    });

    // Auto-fill notes from the opportunity description / sector / tags, if empty
    setNotes(prev => {
      if (prev.trim()) return prev;
      const parts = [];
      if (opp.description) parts.push(opp.description);
      if (opp.industrialSector) parts.push(`Sector: ${opp.industrialSector}`);
      if ((opp.tags || []).length) parts.push(`Tags: ${opp.tags.join(', ')}`);
      return parts.join('\n');
    });
  };

  // If the typed search text matches an opportunity's BL number (ignoring
  // case, spaces, dashes and slashes), auto-link that opportunity and
  // auto-fill its data — no need to open the dropdown and click it.
  useEffect(() => {
    if (opportunityId) return;
    const q = normalizeBL(oppSearch);
    if (!q) return;
    const match = opportunities.find(o => o.blNumber && normalizeBL(o.blNumber) === q);
    if (match) handleOpportunityChange(match.id, match);
  }, [oppSearch, opportunityId, opportunities]);

  // Filter opportunities by search text (title or BL number)
  const filteredOppOptions = React.useMemo(() => {
    const q = oppSearch.trim().toLowerCase();
    if (!q) return opportunities;
    const qBL = normalizeBL(oppSearch);
    return opportunities.filter(o =>
      o.title?.toLowerCase().includes(q) ||
      o.blNumber?.toLowerCase().includes(q) ||
      (o.blNumber && normalizeBL(o.blNumber).includes(qBL))
    );
  }, [opportunities, oppSearch]);

  const updateLineItem = (id, field, value) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  };

  const addLineItem = () => setLineItems(prev => [...prev, emptyLineItem()]);

  const removeLineItem = (id) => {
    setLineItems(prev => prev.length > 1 ? prev.filter(li => li.id !== id) : prev);
  };

  // Normalize line items with computed amount / profit
  const computedLineItems = lineItems.map(li => {
    const quantity = Number(li.quantity) || 0;
    const sellPrice = Number(li.sellPrice) || 0;
    const buyPrice = Number(li.buyPrice) || 0;
    const amount = quantity * sellPrice;
    const profit = (sellPrice - buyPrice) * quantity;
    return {
      ...li,
      quantity,
      sellPrice,
      buyPrice,
      unitPrice: sellPrice,
      amount,
      profit,
    };
  });

  const subtotal = computedLineItems.reduce(
    (sum, li) => sum + convertAmount(li.amount, li.currency || 'USD', 'USD'), 0
  );
  const effectiveTaxRate = Number(taxRate) || 0;
  const taxAmount = subtotal * (effectiveTaxRate / 100);
  const total = subtotal + taxAmount;

  const selectedCompany = companies.find(c => c.id === companyId);
  const selectedOpp = opportunities.find(o => o.id === opportunityId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!opportunityId) {
      setError('Please select a linked opportunity. The company will be filled automatically.');
      return;
    }
    if (!companyId) {
      setError('The linked opportunity has no company set. Please update the opportunity first.');
      return;
    }
    if (computedLineItems.every(li => !li.description.trim())) {
      setError('Please add at least one line item with a description.');
      return;
    }
    setError('');

    const cleanLineItems = computedLineItems
      .filter(li => li.description.trim() || li.quantity || li.sellPrice || li.buyPrice)
      .map(({ id, description, currency, quantity, sellPrice, buyPrice, unitPrice, amount, profit }) => ({
        id, description, currency, quantity, sellPrice, buyPrice, unitPrice, amount, profit,
      }));

    const payload = {
      ...(quotation || {}),
      opportunityId: opportunityId || null,
      opportunityTitle: selectedOpp?.title || quotation?.opportunityTitle || '',
      blNumber: selectedOpp?.blNumber || quotation?.blNumber || '',
      companyId,
      companyName: selectedCompany?.name || quotation?.companyName || '',
      companyEmail: selectedCompany?.email || '',
      companyPhone: selectedCompany?.phone || '',
      companyAddress: selectedCompany?.address || '',
      companyTaxId: selectedCompany?.taxId || '',
      companyWebsite: selectedCompany?.website || '',
      date,
      validUntil,
      lineItems: cleanLineItems,
      subtotal,
      taxRate: effectiveTaxRate,
      taxAmount,
      total,
      displayCurrency,
      totalCurrency: displayCurrency,
      notes,
      status: quotation?.status || 'draft',
      createdBy: quotation?.createdBy || user?.role,
      assignedTo: quotation?.assignedTo || user?.id,
      operationConfirmed: quotation?.operationConfirmed || false,
      accountingConfirmed: quotation?.accountingConfirmed || false,
    };

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-screen overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {isEditing ? `Edit Quotation ${quotation.number || ''}` : 'Create Quotation'}
            </h2>
            <button type="button" onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            {/* Opportunity & Company */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Opportunity</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={oppSearch}
                    onChange={(e) => {
                      setOppSearch(e.target.value);
                      setOpportunityId('');
                      setOppDropdownOpen(true);
                    }}
                    onFocus={() => setOppDropdownOpen(true)}
                    placeholder="Search by name or BL number…"
                    className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    autoComplete="off"
                  />
                  {oppSearch && (
                    <button
                      type="button"
                      onClick={() => { setOppSearch(''); setOpportunityId(''); setOppDropdownOpen(false); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {oppDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    <button
                      type="button"
                      onMouseDown={() => handleOpportunityChange('', null)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                    >
                      — No linked opportunity —
                    </button>
                    {filteredOppOptions.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400 italic">No opportunities match.</p>
                    ) : (
                      filteredOppOptions.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          onMouseDown={() => handleOpportunityChange(o.id, o)}
                          className={`w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors ${opportunityId === o.id ? 'bg-blue-50' : ''}`}
                        >
                          <p className="text-sm font-medium text-gray-900 truncate">{o.title}</p>
                          {o.blNumber && (
                            <p className="text-xs text-indigo-500 font-mono">BL# {o.blNumber}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {/* Click-outside to close */}
                {oppDropdownOpen && (
                  <div className="fixed inset-0 z-20" onMouseDown={() => setOppDropdownOpen(false)} />
                )}
                {/* Show selected opp badge */}
                {opportunityId && selectedOpp && (
                  <p className="mt-1 text-xs text-blue-600 font-medium flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    Linked: {selectedOpp.title}{selectedOpp.blNumber ? ` · BL# ${selectedOpp.blNumber}` : ''}{!isEditing ? ' — details auto-filled below' : ''}
                  </p>
                )}
                {!opportunityId && !isEditing && (
                  <p className="mt-1 text-xs text-gray-400">Type a full BL number to auto-link and auto-fill that opportunity's details.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company / Customer</label>
                {selectedCompany ? (
                  <div className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-800 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="font-medium">{selectedCompany.name}</span>
                    {opportunityId && (
                      <span className="ml-auto text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">auto-filled from opportunity</span>
                    )}
                  </div>
                ) : opportunityId ? (
                  <div className="w-full px-4 py-2 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-700">
                    ⚠ Linked opportunity has no company set. Please update the opportunity first.
                  </div>
                ) : (
                  <div className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-400 italic">
                    Select an opportunity above — the company will be filled automatically.
                  </div>
                )}
              </div>
            </div>

            {/* Dates & Currency */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Currency</label>
                <select
                  value={displayCurrency}
                  onChange={(e) => setDisplayCurrency(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {CURRENCY_LIST.map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.symbol}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Line Items</label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-xs text-gray-500 uppercase">
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center w-24">Currency</th>
                      <th className="px-3 py-2 text-right w-20">Qty</th>
                      <th className="px-3 py-2 text-right w-28">Sell Price</th>
                      <th className="px-3 py-2 text-right w-28">Buy Price</th>
                      <th className="px-3 py-2 text-right w-28">Amount</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {computedLineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            placeholder="Item description"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.currency}
                            onChange={(e) => updateLineItem(item.id, 'currency', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {CURRENCY_LIST.map(c => (
                              <option key={c.code} value={c.code}>{c.code}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-right focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.sellPrice}
                            onChange={(e) => updateLineItem(item.id, 'sellPrice', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-right focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.buyPrice}
                            onChange={(e) => updateLineItem(item.id, 'buyPrice', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-right focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-700">
                          {formatAmount(item.amount, item.currency)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLineItem(item.id)}
                            disabled={lineItems.length === 1}
                            className="p-1 text-red-500 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Remove item"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tax & Totals */}
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Additional notes, terms, or comments…"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="w-full md:w-72 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                  {taxConfigs?.length > 0 ? (
                    <select
                      value={effectiveTaxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value={0}>No Tax (0%)</option>
                      {taxConfigs.map(tc => (
                        <option key={tc.id} value={tc.rate}>{tc.name} ({tc.rate}%)</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal (USD):</span>
                    <span className="font-medium">{formatAmount(subtotal, 'USD')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax ({effectiveTaxRate}%):</span>
                    <span className="font-medium">{formatAmount(taxAmount, 'USD')}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t border-gray-300 pt-2">
                    <span>Total:</span>
                    <span className="text-blue-700">
                      {displayCurrency !== 'USD'
                        ? formatAmount(convertAmount(total, 'USD', displayCurrency), displayCurrency)
                        : formatAmount(total, 'USD')}
                    </span>
                  </div>
                  {displayCurrency !== 'USD' && (
                    <p className="text-xs text-gray-400 text-right">≈ {formatAmount(total, 'USD')} USD</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              {isEditing ? 'Save Changes' : 'Create Quotation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Direct Convert Quotation to Invoice Function ──────────────────────────────
async function directConvertQuotationToInvoice(quotation) {
  const defaultCur = quotation.totalCurrency || quotation.currency || 'USD';
  const lineItems = (quotation.lineItems || []).map(item => ({
    ...item,
    currency: item.currency || defaultCur
  }));

  const taxRate = Number(quotation.taxRate) || 0;
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

  const totalCurrency = quotation.totalCurrency || defaultCur;
  let grandTotal = 0;
  for (const [cur, t] of Object.entries(currencyTotals)) {
    grandTotal += convertCurrency(t.total, cur, totalCurrency);
  }

  const total = Number(quotation.total) || grandTotal;
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const invoiceNumber = await getNextInvoiceNumber();

  const invoice = {
    number: invoiceNumber,
    companyId: quotation.companyId,
    companyName: quotation.companyName,
    companyEmail: quotation.companyEmail || '',
    companyPhone: quotation.companyPhone || '',
    companyAddress: quotation.companyAddress || '',
    billingAddress: quotation.companyAddress || '',
    companyTaxId: quotation.companyTaxId || '',
    companyWebsite: quotation.companyWebsite || '',
    date: today,
    dueDate: dueDate,
    taxRate: taxRate,
    subtotal: quotation.subtotal,
    taxAmount: quotation.taxAmount,
    total: quotation.total,
    currency: totalCurrency,
    totalCurrency: totalCurrency,
    currencyTotals: currencyTotals,
    grandTotal: grandTotal || total,
    lineItems: lineItems,
    notes: quotation.notes || '',
    status: 'draft',
    confirmed: false,
    quotationId: quotation.id,
    quotationNumber: quotation.number,
    opportunityId: quotation.opportunityId,
    amountPaid: 0,
    balanceDue: grandTotal || total,
  };

  return await saveInvoice(invoice);
}