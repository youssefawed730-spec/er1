// components/sales/Opportunities.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import InternalChat from '../common/InternalChat';
import { getOpportunities, saveOpportunity, deleteOpportunity, getCompanies, getCurrentUser, hasPermission, getQuotations, getActivities, saveActivity, deleteActivity, getOpportunityChatReplies, subscribeToEvents, getUsers, getSalesOrders } from '../../data/store';

// ─── Status definitions used by Sales role ───────────────────────────────────
const SALES_STATUSES = [
  { value: 'new',          label: 'New',          color: 'bg-gray-100 text-gray-700' },
  { value: 'rate_request', label: 'Rate Request',  color: 'bg-blue-100 text-blue-700' },
  { value: 'won',          label: 'Won',           color: 'bg-green-100 text-green-700' },
  { value: 'lost',         label: 'Lost',          color: 'bg-red-100 text-red-700' },
];

// ─── Stages used by non-sales roles (unchanged) ───────────────────────────────
const PIPELINE_STAGES = [
  { value: 'lead',        label: 'Lead',        color: 'bg-gray-100 text-gray-700' },
  { value: 'qualified',   label: 'Qualified',   color: 'bg-blue-100 text-blue-700' },
  { value: 'proposal',    label: 'Proposal',    color: 'bg-purple-100 text-purple-700' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'closed_won',  label: 'Closed Won',  color: 'bg-green-100 text-green-700' },
  { value: 'closed_lost', label: 'Closed Lost', color: 'bg-red-100 text-red-700' },
];

function getStageList(role) {
  return role === 'sales' ? SALES_STATUSES : PIPELINE_STAGES;
}

function getStatusColor(value, role) {
  const list = getStageList(role);
  return list.find(s => s.value === value)?.color || 'bg-gray-100 text-gray-700';
}

function getStatusLabel(value, role) {
  const list = getStageList(role);
  return list.find(s => s.value === value)?.label || value;
}

// "Lost" exists under two different value names depending on which stage set is
// active for the current role: Sales uses 'lost', everyone else uses 'closed_lost'.
// This helper makes the "reason required" rule role-agnostic.
function isLostStage(stage) {
  return stage === 'lost' || stage === 'closed_lost';
}

// ─── Lost Reason Modal ────────────────────────────────────────────────────────
function LostReasonModal({ onConfirm, onCancel }) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            Mark as Lost — Reason Required
          </h2>
          <p className="text-sm text-gray-500 mt-1">Please provide a reason for losing this opportunity.</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loss Reason <span className="text-red-500">*</span></label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
              placeholder="e.g. Price too high, Competitor selected, Project cancelled…"
            />
          </div>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={() => onConfirm(reason.trim())}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Confirm Lost
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Column Summary Card ──────────────────────────────────────────────────────
function ColumnSummary({ label, count, total, color, bgColor }) {
  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return (
    <div className={`${bgColor} rounded-lg px-4 py-3 border`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{count}</p>
      <p className={`text-sm font-medium ${color}`}>{formatCurrency(total)}</p>
    </div>
  );
}

// ─── Opportunity Card (used in column view) ───────────────────────────────────
function OpportunityCard({ opp, user, isSales, isOps, isHeadOfOperation, canEdit, canUpdateStage, stageList, allQuotations,
  chatOpp, setChatOpp, activityOpp, setActivityOpp, onEdit, onDelete, onStageChange, navigate, formatCurrency, isHighlighted }) {

  const isClosedOpportunity = opp.stage === 'won' || opp.stage === 'lost' || opp.stage === 'closed_won' || opp.stage === 'closed_lost';
  const canViewClosedDetails = isSales || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 space-y-2 hover:shadow-md transition-shadow ${isHighlighted ? 'border-blue-400 ring-2 ring-blue-300 ring-offset-1' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{opp.title}</p>
          <p className="text-xs text-gray-500 truncate">{opp.customerName}</p>
          {opp.blNumber && (
            <p className="text-xs text-indigo-600 font-medium mt-0.5">BL# {opp.blNumber}</p>
          )}
        </div>
        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">{formatCurrency(opp.value)}</span>
      </div>
      {opp.industrialSector && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{opp.industrialSector}</span>
      )}
      {isLostStage(opp.stage) && opp.lostReason && (
        <p className="text-xs text-red-500 italic truncate" title={opp.lostReason}>↳ {opp.lostReason}</p>
      )}
      {canUpdateStage && (
        <select
          value={opp.stage}
          onChange={(e) => onStageChange(opp.id, e.target.value)}
          className={`w-full px-2 py-1 text-xs font-medium rounded-lg border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${
            stageList.find(s => s.value === opp.stage)?.color || 'bg-gray-100 text-gray-700'
          }`}
        >
          {stageList.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-1 pt-1 flex-wrap">
        <button onClick={() => setActivityOpp(activityOpp === opp.id ? null : opp.id)}
          className={`p-1.5 rounded-lg transition-colors ${activityOpp === opp.id ? 'bg-orange-100 text-orange-700' : 'text-orange-500 hover:bg-orange-50'}`}
          title="Activities">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        {(!isClosedOpportunity || canViewClosedDetails) && (
          <button onClick={() => navigate('/quotations', { state: { filterByOpportunity: opp.id } })}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative" title="View Quotations">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {allQuotations.filter(q => q.opportunityId === opp.id).length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                {allQuotations.filter(q => q.opportunityId === opp.id).length}
              </span>
            )}
          </button>
        )}
        {(isOps || isHeadOfOperation) && !isClosedOpportunity && (
          <button onClick={() => navigate('/quotations', { state: { fromOpportunity: opp.id } })}
            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Create Quotation">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        {(isSales || isOps || isHeadOfOperation) && (
          <button onClick={() => setChatOpp(chatOpp === opp.id ? null : opp.id)}
            className={`p-1.5 rounded-lg transition-colors ${chatOpp === opp.id ? 'bg-blue-100 text-blue-700' : 'text-blue-500 hover:bg-blue-50'}`}
            title="Internal Chat">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>
        )}
        {canEdit && (
          <button onClick={() => onEdit(opp)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
        {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && (
          <button onClick={() => onDelete(opp.id)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Opportunities() {
  const [opportunities, setOpportunities] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [filterStage, setFilterStage] = useState('all');
  const [filterRateReqStatus, setFilterRateReqStatus] = useState('all'); // For rate_request stage: pending, replied, won, lost
  const [lostPrompt, setLostPrompt] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'columns'
  const user = getCurrentUser();
  const isSales = user?.role === 'sales' || user?.role === 'head_of_sales';
  const isOps = user?.role === 'operation';
  const isHeadOfOperation = user?.role === 'head_of_operation';
  const isHeadOfSales = user?.role === 'head_of_sales';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [chatOpp, setChatOpp] = useState(null);
  const [allQuotations, setAllQuotations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allSalesOrders, setAllSalesOrders] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [activityOpp, setActivityOpp] = useState(null);
  const [splitOpp, setSplitOpp] = useState(null); // opportunity open in split-screen
  const [filterCompanyId, setFilterCompanyId] = useState(location.state?.filterCompanyId || null);
  const [filterCompanyName, setFilterCompanyName] = useState(location.state?.filterCompanyName || '');
  // Auto-open opp from ?opp=<id> (linked from Sales Team Tracker)
  const highlightOppId = searchParams.get('opp');

  // ── Head of Sales: Sales Team Summary state ──
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSortBy, setTeamSortBy] = useState('name'); // name | customers | totalRateReq | won | lost | activities
  const [teamSortDir, setTeamSortDir] = useState('asc');
  const [expandedMember, setExpandedMember] = useState(null);

  useEffect(() => {
    loadData();
    if (location.state?.createForCompany) {
      setEditingOpportunity(null);
      setShowModal(true);
    }
  }, []);

  // Live-refresh when store emits relevant events
  useEffect(() => {
    const unsub = subscribeToEvents((e) => {
      if (['opportunity_created', 'opportunity_updated', 'opportunity_deleted', 'quotation_confirmed', 'quotation_converted', 'company_created', 'company_updated', 'company_deleted'].includes(e.type)) {
        loadData();
      }
    });
    return unsub;
  }, []);

  const loadData = () => {
    const p1 = Promise.all([getOpportunities(), getCompanies()]).then(([allOpps, allCompanies]) => {
      let customerList = allCompanies.filter(c => c.type !== 'vendor' && !c.isVendor);

      let filteredOpps = allOpps;
      if (user?.role === 'sales') {
        filteredOpps = allOpps.filter(o => o.assignedTo === user.id);
      } else if (user?.role === 'head_of_sales') {
        if (!highlightOppId) {
          filteredOpps = allOpps.filter(o => o.assignedTo === user.id);
        }
      }

      setOpportunities(filteredOpps);
      setCustomers(customerList);

      if (highlightOppId) {
        const targetOpp = allOpps.find(o => o.id === highlightOppId);
        if (targetOpp) setSplitOpp(targetOpp);
      }
    }).catch(() => {});
    const p2 = getQuotations().then(setAllQuotations).catch(()=>{});
    const p3 = getUsers().then(setAllUsers).catch(()=>{});
    const p4 = getSalesOrders().then(setAllSalesOrders).catch(()=>{});
    const p5 = getActivities().then(setAllActivities).catch(()=>{});
    return Promise.all([p1, p2, p3, p4, p5]);
  };

  const canEdit = hasPermission(user?.role, 'opportunities', 'write');
  const canApprove = hasPermission(user?.role, 'opportunities', 'approve');
  const canUpdateStage = canApprove || isSales;

  const stageList = getStageList(user?.role);

  // ── Head of Sales: Sales Team Summary computation ──────────────────────────
  const salesTeamData = React.useMemo(() => {
    if (!isHeadOfSales) return [];
    // uses already-loaded state from loadData — no async calls here
    const salesmen = allUsers.filter(u => u.role === 'sales');
    const allOpps = opportunities || [];
    const allQuotes = allQuotations || [];
    const allCompanies = customers || [];
    const allActs = allActivities || [];
    const allOrders = allSalesOrders || [];

    return salesmen.map(sm => {
      const smOpps    = allOpps.filter(o => o.assignedTo === sm.id);
      const smQuotes  = allQuotes.filter(q => q.assignedTo === sm.id);
      const smCust    = allCompanies.filter(c => c.assignedTo === sm.id);
      const smActs    = allActs.filter(a => a.createdBy === sm.id);
      const smOrders  = allOrders.filter(o => o.assignedTo === sm.id || smOpps.some(op => op.id === o.opportunityId));

      const totalRateReq = smOpps.filter(o => o.stage === 'rate_request').length;
      const wonCount     = smOpps.filter(o => o.stage === 'won' || o.stage === 'closed_won').length;
      const lostCount    = smOpps.filter(o => o.stage === 'lost' || o.stage === 'closed_lost').length;
      const wonValue     = smOpps.filter(o => o.stage === 'won' || o.stage === 'closed_won').reduce((s, o) => s + (o.value || 0), 0);
      const pipeline     = smOpps.reduce((s, o) => s + (o.value || 0), 0);
      const pendingActs  = smActs.filter(a => !a.done).length;
      const doneActs     = smActs.filter(a => a.done).length;
      const winRate      = (wonCount + lostCount) > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;

      return {
        id: sm.id, name: sm.name, email: sm.email,
        customers: smCust.length,
        opportunities: smOpps.length,
        totalRateReq,
        won: wonCount,
        wonValue,
        lost: lostCount,
        pipeline,
        activities: smActs.length,
        pendingActs,
        doneActs,
        winRate,
        quotes: smQuotes.length,
        orders: smOrders.length,
      };
    });
  }, [isHeadOfSales, opportunities, allQuotations, allUsers, allSalesOrders, allActivities, customers]);

  const filteredSalesTeam = React.useMemo(() => {
    let data = [...salesTeamData];
    if (teamSearch.trim()) {
      const q = teamSearch.toLowerCase();
      data = data.filter(sm => sm.name.toLowerCase().includes(q) || sm.email.toLowerCase().includes(q));
    }
    data.sort((a, b) => {
      let va = a[teamSortBy], vb = b[teamSortBy];
      if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
      if (va < vb) return teamSortDir === 'asc' ? -1 : 1;
      if (va > vb) return teamSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [salesTeamData, teamSearch, teamSortBy, teamSortDir]);

  const toggleSort = (col) => {
    if (teamSortBy === col) setTeamSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setTeamSortBy(col); setTeamSortDir('asc'); }
  };

  const SortIcon = ({ col }) => {
    if (teamSortBy !== col) return <svg className="w-3 h-3 text-gray-300 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return teamSortDir === 'asc'
      ? <svg className="w-3 h-3 text-blue-500 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
      : <svg className="w-3 h-3 text-blue-500 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
  };

  const handleSave = async (opportunity) => {
    try {
      await saveOpportunity(opportunity);
      await loadData();
      setShowModal(false);
      setEditingOpportunity(null);
    } catch (err) {
      alert('Failed to save opportunity: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this opportunity?')) {
      try {
        await deleteOpportunity(id);
        await loadData();
      } catch (err) {
        alert('Failed to delete opportunity: ' + err.message);
      }
    }
  };

  const handleEdit = (opportunity) => {
    setEditingOpportunity(opportunity);
    setShowModal(true);
  };

  const handleStageChange = async (id, newStage) => {
    const opp = opportunities.find(o => o.id === id);
    if (!opp) return;

    if (isLostStage(newStage)) {
      setLostPrompt({ oppId: id, newStage });
    } else {
      try {
        await saveOpportunity({ ...opp, stage: newStage, lostReason: isLostStage(newStage) ? (opp.lostReason || '') : '', updatedAt: new Date().toISOString() });
        await loadData();
      } catch (err) {
        alert('Failed to update stage: ' + err.message);
      }
    }
  };

  const handleLostConfirm = async (reason) => {
    const opp = opportunities.find(o => o.id === lostPrompt.oppId);
    if (opp) {
      try {
        await saveOpportunity({ ...opp, stage: lostPrompt.newStage || 'lost', lostReason: reason, updatedAt: new Date().toISOString() });
        await loadData();
      } catch (err) {
        alert('Failed to mark as lost: ' + err.message);
      }
    }
    setLostPrompt(null);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // ── Search + filter ──
  const searchedOpportunities = opportunities.filter(o => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.title?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.description?.toLowerCase().includes(q) ||
      o.blNumber?.toLowerCase().includes(q) ||
      (o.tags || []).some(t => t.toLowerCase().includes(q)) ||
      o.industrialSector?.toLowerCase().includes(q)
    );
  });

  // Apply rate_request sub-filter for operations
  const applyRateRequestFilter = (opp) => {
    if (filterStage !== 'rate_request') return true;
    if (!isOps && !isHeadOfOperation && user?.role !== 'admin' && user?.role !== 'manager' && user?.role !== 'head_of_sales') return true;

    const chatInfo = getOpportunityChatReplies(opp.id);
    if (filterRateReqStatus === 'all') return true;
    if (filterRateReqStatus === 'pending') return chatInfo.totalMessages <= 1;
    if (filterRateReqStatus === 'replied') return chatInfo.totalMessages > 1;
    if (filterRateReqStatus === 'won') return opp.stage === 'won';
    if (filterRateReqStatus === 'lost') return opp.stage === 'lost';
    return true;
  };

  const filteredOpportunities = (filterStage === 'all'
    ? searchedOpportunities
    : searchedOpportunities.filter(o => o.stage === filterStage)
  ).filter(o => !filterCompanyId || o.companyId === filterCompanyId || o.customerId === filterCompanyId).filter(applyRateRequestFilter);

  // ── Summary stats ──
  const totalPipelineValue = opportunities.reduce((sum, o) => sum + (o.value || 0), 0);
  const weightedPipeline   = opportunities.reduce((sum, o) => sum + ((o.value || 0) * (o.probability || 0) / 100), 0);
  const wonOpportunities   = opportunities.filter(o => o.stage === 'won' || o.stage === 'closed_won').reduce((sum, o) => sum + (o.value || 0), 0);

  // ── Rate Request Stats for Operations ──
  const rateRequestStats = {
    total: opportunities.filter(o => o.stage === 'rate_request').length,
    pending: 0,
    replied: 0,
    won: 0,
    lost: 0,
  };

  if (isOps || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') {
    opportunities.filter(o => o.stage === 'rate_request').forEach(rr => {
      const chatInfo = getOpportunityChatReplies(rr.id);
      if (rr.stage === 'lost') {
        rateRequestStats.lost++;
      } else if (rr.stage === 'won') {
        rateRequestStats.won++;
      } else if (chatInfo.totalMessages > 1) {
        rateRequestStats.replied++;
      } else {
        rateRequestStats.pending++;
      }
    });
  }

  // ── Column view: only shown for Sales role (the 4 sales statuses) ──
  const salesColumns = SALES_STATUSES;
  const columnData = salesColumns.map(col => ({
    ...col,
    items: filteredOpportunities.filter(o => o.stage === col.value),
  }));

  const colSummaryMeta = {
    new:          { bgColor: 'bg-gray-50 border-gray-200',  color: 'text-gray-600' },
    rate_request: { bgColor: 'bg-blue-50 border-blue-200',  color: 'text-blue-600' },
    won:          { bgColor: 'bg-green-50 border-green-200', color: 'text-green-600' },
    lost:         { bgColor: 'bg-red-50 border-red-200',     color: 'text-red-600' },
  };

  const cardProps = {
    user, isSales, isOps, isHeadOfOperation, canEdit, canUpdateStage, stageList, allQuotations,
    chatOpp, setChatOpp, activityOpp, setActivityOpp,
    onEdit: handleEdit, onDelete: handleDelete, onStageChange: handleStageChange,
    navigate, formatCurrency,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Opportunities</h1>
          <p className="text-gray-500">Track and manage sales pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle — columns for Sales and Head of Sales */}
          {isSales && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Table view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('columns')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'columns' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                title="Column view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </button>
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => { setEditingOpportunity(null); setShowModal(true); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Opportunity
            </button>
          )}
        </div>
      </div>

      {/* ── SALES TEAM SUMMARY (Head of Sales only) ── */}
      {isHeadOfSales && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Sales Team Summary</h2>
                  <p className="text-blue-200 text-xs">{filteredSalesTeam.length} member{filteredSalesTeam.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {/* Search */}
              <div className="relative w-56">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={teamSearch}
                  onChange={e => setTeamSearch(e.target.value)}
                  placeholder="Search member…"
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-white/20 text-white placeholder-blue-300 border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                />
                {teamSearch && (
                  <button onClick={() => setTeamSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>
            {/* Aggregate totals row */}
            {filteredSalesTeam.length > 0 && (
              <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: 'Total Customers', val: filteredSalesTeam.reduce((s,sm) => s+sm.customers,0), color: 'text-cyan-200' },
                  { label: 'Activities', val: filteredSalesTeam.reduce((s,sm) => s+sm.activities,0), color: 'text-yellow-200' },
                  { label: 'Total Rate Req.', val: filteredSalesTeam.reduce((s,sm) => s+sm.totalRateReq,0), color: 'text-blue-200' },
                  { label: 'Won', val: filteredSalesTeam.reduce((s,sm) => s+sm.won,0), color: 'text-green-200' },
                  { label: 'Lost', val: filteredSalesTeam.reduce((s,sm) => s+sm.lost,0), color: 'text-red-200' },
                  { label: 'Opps', val: filteredSalesTeam.reduce((s,sm) => s+sm.opportunities,0), color: 'text-purple-200' },
                ].map(item => (
                  <div key={item.label} className="bg-white/10 rounded-lg px-3 py-2 text-center">
                    <p className={`text-lg font-bold ${item.color}`}>{item.val}</p>
                    <p className="text-blue-200 text-[10px] mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Table */}
          {filteredSalesTeam.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {teamSearch ? 'No members match your search.' : 'No sales representatives found. Add users with the Sales role.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                        Salesperson <SortIcon col="name" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('customers')} className="flex items-center justify-center gap-1 w-full hover:text-blue-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                        Customers <SortIcon col="customers" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('activities')} className="flex items-center justify-center gap-1 w-full hover:text-blue-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Activity <SortIcon col="activities" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('totalRateReq')} className="flex items-center justify-center gap-1 w-full hover:text-blue-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        Rate Req. <SortIcon col="totalRateReq" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('won')} className="flex items-center justify-center gap-1 w-full hover:text-green-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Won <SortIcon col="won" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <button onClick={() => toggleSort('lost')} className="flex items-center justify-center gap-1 w-full hover:text-red-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Lost <SortIcon col="lost" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Win Rate</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pr-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSalesTeam.map(sm => (
                    <React.Fragment key={sm.id}>
                      <tr
                        onClick={() => setExpandedMember(expandedMember === sm.id ? null : sm.id)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                      >
                        {/* Name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                              {sm.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{sm.name}</p>
                              <p className="text-xs text-gray-400">{sm.email}</p>
                            </div>
                          </div>
                        </td>
                        {/* Customers */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-cyan-50 text-cyan-700 font-bold text-sm">{sm.customers}</span>
                        </td>
                        {/* Activity */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-50 text-yellow-700 font-bold text-sm">{sm.activities}</span>
                            {sm.pendingActs > 0 && <span className="text-[10px] text-yellow-600">{sm.pendingActs} pending</span>}
                          </div>
                        </td>
                        {/* Rate Req */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold text-sm">{sm.totalRateReq}</span>
                        </td>
                        {/* Won */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-700 font-bold text-sm">{sm.won}</span>
                            {sm.wonValue > 0 && <span className="text-[10px] text-green-600">${(sm.wonValue/1000).toFixed(0)}k</span>}
                          </div>
                        </td>
                        {/* Lost */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 text-red-600 font-bold text-sm">{sm.lost}</span>
                        </td>
                        {/* Win Rate */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`text-sm font-bold ${sm.winRate >= 60 ? 'text-green-600' : sm.winRate >= 30 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {sm.winRate}%
                            </span>
                            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${sm.winRate >= 60 ? 'bg-green-500' : sm.winRate >= 30 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                style={{ width: `${sm.winRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        {/* Pipeline */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-sm font-semibold text-gray-700">
                            ${sm.pipeline >= 1000000 ? (sm.pipeline/1000000).toFixed(1)+'M' : sm.pipeline >= 1000 ? (sm.pipeline/1000).toFixed(0)+'K' : sm.pipeline}
                          </span>
                        </td>
                        {/* Expand */}
                        <td className="px-4 py-3.5 text-right pr-5">
                          <svg
                            className={`w-4 h-4 text-gray-400 group-hover:text-blue-500 inline transition-transform ${expandedMember === sm.id ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </td>
                      </tr>
                      {/* Expanded detail row */}
                      {expandedMember === sm.id && (
                        <tr>
                          <td colSpan={9} className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                <p className="text-xl font-bold text-indigo-600">{sm.opportunities}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Total Opportunities</p>
                              </div>
                              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                <p className="text-xl font-bold text-purple-600">{sm.quotes}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Quotations</p>
                              </div>
                              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                <p className="text-xl font-bold text-blue-600">{sm.orders}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Sales Orders</p>
                              </div>
                              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                <p className="text-xl font-bold text-green-600">${sm.wonValue >= 1000 ? (sm.wonValue/1000).toFixed(1)+'K' : sm.wonValue}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Won Value</p>
                              </div>
                              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                                <p className="text-xl font-bold text-orange-500">{sm.doneActs}/{sm.activities}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Activities Done</p>
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2 flex-wrap">
                              <button
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                                title="Filter opportunities to this salesperson"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFilterCompanyId(null);
                                  setFilterCompanyName('');
                                  setSearchQuery(sm.name);
                                }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                                View Opportunities
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      {isHeadOfSales && (
        <div className="flex items-center gap-3 pb-1 border-b border-gray-200">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">My Opportunities</h2>
            <p className="text-xs text-gray-500">Opportunities assigned to you personally</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Pipeline Value</p>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(totalPipelineValue)}</p>
          <p className="text-xs text-gray-400 mt-1">{opportunities.length} opportunities</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Weighted Pipeline</p>
          <p className="text-xl font-bold text-purple-600">{formatCurrency(weightedPipeline)}</p>
          <p className="text-xs text-gray-400 mt-1">Probability adjusted</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Won Opportunities</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(wonOpportunities)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Avg Deal Size</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPipelineValue / (opportunities.length || 1))}</p>
        </div>
      </div>

      {/* Rate Request Stats for Operations */}
      {(isOps || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && rateRequestStats.total > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Rate Request Overview
            </h3>
            <span className="text-white/80 text-sm">Total: {rateRequestStats.total}</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-300">{rateRequestStats.pending}</p>
              <p className="text-xs text-white/70 mt-1">Pending</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-300">{rateRequestStats.replied}</p>
              <p className="text-xs text-white/70 mt-1">Replied</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-300">{rateRequestStats.won}</p>
              <p className="text-xs text-white/70 mt-1">Won</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-300">{rateRequestStats.lost}</p>
              <p className="text-xs text-white/70 mt-1">Lost</p>
            </div>
          </div>
        </div>
      )}

      {/* Company Filter Banner */}
      {filterCompanyId && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
          <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <span className="text-sm text-indigo-800 font-medium flex-1">Showing opportunities for: <strong>{filterCompanyName}</strong></span>
          <button
            onClick={() => { setFilterCompanyId(null); setFilterCompanyName(''); }}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-900 font-medium px-2 py-1 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Clear Filter
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, customer, BL number, tags, sector…"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Stage / Status Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStage('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filterStage === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        {stageList.map((stage) => (
          <button
            key={stage.value}
            onClick={() => setFilterStage(stage.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStage === stage.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {stage.label}
          </button>
        ))}
      </div>

      {/* Rate Request Sub-Filter for Operations */}
      {(isOps || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && filterStage === 'rate_request' && (
        <div className="flex flex-wrap gap-2 ml-4 border-l-4 border-blue-500 pl-4">
          <span className="text-sm text-gray-500 font-medium self-center">Rate Request Status:</span>
          <button
            onClick={() => setFilterRateReqStatus('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterRateReqStatus === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({rateRequestStats.total})
          </button>
          <button
            onClick={() => setFilterRateReqStatus('pending')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              filterRateReqStatus === 'pending' ? 'bg-yellow-500 text-white' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            }`}
          >
            <span>Pending</span>
            <span className="bg-white/20 px-1.5 rounded text-xs">{rateRequestStats.pending}</span>
          </button>
          <button
            onClick={() => setFilterRateReqStatus('replied')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              filterRateReqStatus === 'replied' ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span>Replied</span>
            <span className="bg-white/20 px-1.5 rounded text-xs">{rateRequestStats.replied}</span>
          </button>
          <button
            onClick={() => setFilterRateReqStatus('won')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              filterRateReqStatus === 'won' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            <span>Won</span>
            <span className="bg-white/20 px-1.5 rounded text-xs">{rateRequestStats.won}</span>
          </button>
          <button
            onClick={() => setFilterRateReqStatus('lost')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
              filterRateReqStatus === 'lost' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            <span>Lost</span>
            <span className="bg-white/20 px-1.5 rounded text-xs">{rateRequestStats.lost}</span>
          </button>
        </div>
      )}

      {/* ── COLUMN VIEW (Sales role & Head of Sales) ── */}
      {viewMode === 'columns' && isSales ? (
        <div>
          {/* Column summaries row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {columnData.map(col => {
              const meta = colSummaryMeta[col.value] || { bgColor: 'bg-gray-50 border-gray-200', color: 'text-gray-600' };
              return (
                <ColumnSummary
                  key={col.value}
                  label={col.label}
                  count={col.items.length}
                  total={col.items.reduce((s, o) => s + (o.value || 0), 0)}
                  color={meta.color}
                  bgColor={meta.bgColor}
                />
              );
            })}
          </div>

          {/* Four columns side by side */}
          <div className="grid grid-cols-4 gap-3">
            {columnData.map(col => (
              <div key={col.value} className="flex flex-col gap-3">
                <div className={`text-xs font-bold uppercase tracking-wide px-1 ${
                  col.value === 'new' ? 'text-gray-600' :
                  col.value === 'rate_request' ? 'text-blue-600' :
                  col.value === 'won' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {col.label}
                </div>
                {col.items.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                    No opportunities
                  </div>
                ) : (
                  col.items.map(opp => (
                    <React.Fragment key={opp.id}>
                      <OpportunityCard opp={opp} {...cardProps} isHighlighted={opp.id === highlightOppId} />
                      {chatOpp === opp.id && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <InternalChat
                            refId={opp.id}
                            refType="opportunity"
                            opportunityId={opp.id}
                            title={opp.title}
                          />
                        </div>
                      )}
                      {activityOpp === opp.id && (
                        <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                          <ActivityPanel opportunityId={opp.id} opportunityTitle={opp.title} user={user} />
                        </div>
                      )}
                    </React.Fragment>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── TABLE VIEW ── */
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">BL Number</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">{user?.role === 'sales' ? 'Status' : 'Stage'}</th>
                {(isOps || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && (
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Rate Req.</th>
                )}
                {user?.role === 'sales' && <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Loss Reason</th>}
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Probability</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Expected Close</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={user?.role === 'sales' ? 10 : (isOps || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') ? 9 : 8} className="px-6 py-12 text-center text-sm text-gray-400">
                    {searchQuery ? `No opportunities match "${searchQuery}".` : 'No opportunities found.'}
                  </td>
                </tr>
              ) : filteredOpportunities.map((opp) => (
                <React.Fragment key={opp.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{opp.title}</p>
                      <p className="text-xs text-gray-500">{opp.description}</p>
                      {opp.industrialSector && (
                        <span className="inline-block mt-1 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{opp.industrialSector}</span>
                      )}
                      {(opp.tags || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(opp.tags || []).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">{tag}</span>
                          ))}
                        </div>
                      )}
                      {user?.role !== 'sales' && isLostStage(opp.stage) && opp.lostReason && (
                        <p className="text-xs text-red-500 italic mt-1" title={opp.lostReason}>↳ {opp.lostReason}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{opp.customerName}</td>
                  <td className="px-6 py-4">
                    {opp.blNumber ? (
                      <span className="text-sm font-mono font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {opp.blNumber}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {canUpdateStage ? (
                      <select
                        value={opp.stage}
                        onChange={(e) => handleStageChange(opp.id, e.target.value)}
                        className={`px-3 py-1 text-xs font-medium rounded-full border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${getStatusColor(opp.stage, user?.role)}`}
                      >
                        {stageList.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(opp.stage, user?.role)}`}>
                        {getStatusLabel(opp.stage, user?.role)}
                      </span>
                    )}
                  </td>

                  {/* Rate Request status column for Operations */}
                  {(isOps || isHeadOfOperation || user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && (
                    <td className="px-6 py-4">
                      {opp.stage === 'rate_request' ? (
                        (() => {
                          const chatInfo = getOpportunityChatReplies(opp.id);
                          if (chatInfo.totalMessages > 1) {
                            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Replied</span>;
                          }
                          return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>;
                        })()
                      ) : opp.stage === 'won' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Won</span>
                      ) : opp.stage === 'lost' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Lost</span>
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )}
                    </td>
                  )}

                  {user?.role === 'sales' && (
                    <td className="px-6 py-4 text-sm max-w-[180px]">
                      {opp.stage === 'lost' && opp.lostReason ? (
                        <span className="text-red-600 text-xs italic truncate block" title={opp.lostReason}>
                          {opp.lostReason}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(opp.value)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">{opp.probability}%</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {opp.expectedCloseDate ? new Date(opp.expectedCloseDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => setActivityOpp(activityOpp === opp.id ? null : opp.id)}
                        className={`p-2 rounded-lg transition-colors relative ${activityOpp === opp.id ? 'bg-orange-100 text-orange-700' : 'text-orange-500 hover:bg-orange-50'}`}
                        title="Activities"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                      {(opp.stage !== 'won' && opp.stage !== 'lost' && opp.stage !== 'closed_won' && opp.stage !== 'closed_lost') || (user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales' || isSales || isHeadOfOperation) ? (
                        <button
                          onClick={() => navigate('/quotations', { state: { filterByOpportunity: opp.id } })}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors relative"
                          title="View Quotations"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {allQuotations.filter(q => q.opportunityId === opp.id).length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                              {allQuotations.filter(q => q.opportunityId === opp.id).length}
                            </span>
                          )}
                        </button>
                      ) : null}
                      {(isOps || isHeadOfOperation) && opp.stage !== 'won' && opp.stage !== 'lost' && opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
                        <button
                          onClick={() => navigate('/quotations', { state: { fromOpportunity: opp.id } })}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Create Quotation from this Opportunity"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                      )}
                      {(isSales || isOps || isHeadOfOperation) && (
                        <button
                          onClick={() => setSplitOpp(splitOpp?.id === opp.id ? null : opp)}
                          className={`p-2 rounded-lg transition-colors ${splitOpp?.id === opp.id ? 'bg-green-100 text-green-700' : 'text-green-500 hover:bg-green-50'}`}
                          title="Open Split View (Details + Chat)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                          </svg>
                        </button>
                      )}
                      {(isSales || isOps || isHeadOfOperation) && (
                        <button
                          onClick={() => setChatOpp(chatOpp === opp.id ? null : opp.id)}
                          className={`p-2 rounded-lg transition-colors ${chatOpp === opp.id ? 'bg-blue-100 text-blue-700' : 'text-blue-500 hover:bg-blue-50'}`}
                          title="Internal Chat (Ops ↔ Sales)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(opp)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'head_of_sales') && (
                        <button
                          onClick={() => handleDelete(opp.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {chatOpp === opp.id && (
                  <tr key={opp.id + '_chat'}>
                    <td colSpan={user?.role === 'sales' ? 9 : 8} className="px-6 pb-4 bg-blue-50">
                      <InternalChat
                        refId={opp.id}
                        refType="opportunity"
                        opportunityId={opp.id}
                        title={opp.title}
                      />
                    </td>
                  </tr>
                )}
                {activityOpp === opp.id && (
                  <tr key={opp.id + '_activity'}>
                    <td colSpan={user?.role === 'sales' ? 9 : 8} className="px-6 pb-4 bg-orange-50">
                      <ActivityPanel opportunityId={opp.id} opportunityTitle={opp.title} user={user} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SPLIT SCREEN: Opportunity Details + Internal Chat ── */}
      {splitOpp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end">
          <div className="w-full max-w-5xl bg-white shadow-2xl flex flex-col animate-slide-in-right">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex-shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold truncate">{splitOpp.title}</h2>
                <p className="text-blue-200 text-sm truncate">{splitOpp.customerName} {splitOpp.blNumber ? `· BL: ${splitOpp.blNumber}` : ''}</p>
              </div>
              <button onClick={() => setSplitOpp(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* Split body */}
            <div className="flex flex-1 min-h-0 divide-x divide-gray-200">
              {/* Left: Opportunity details */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Opportunity Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Status / Stage</p>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(splitOpp.stage, user?.role)}`}>
                      {getStatusLabel(splitOpp.stage, user?.role)}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Value</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(splitOpp.value || 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Probability</p>
                    <p className="text-lg font-bold text-blue-600">{splitOpp.probability || 0}%</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs text-gray-500 mb-1">Expected Close</p>
                    <p className="text-sm font-semibold text-gray-800">{splitOpp.expectedCloseDate ? new Date(splitOpp.expectedCloseDate).toLocaleDateString() : '—'}</p>
                  </div>
                  {splitOpp.blNumber && (
                    <div className="bg-indigo-50 rounded-xl p-4 col-span-2">
                      <p className="text-xs text-indigo-500 mb-1">BL Number</p>
                      <p className="text-sm font-mono font-bold text-indigo-700">{splitOpp.blNumber}</p>
                    </div>
                  )}
                  {splitOpp.industrialSector && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs text-gray-500 mb-1">Sector</p>
                      <p className="text-sm font-semibold text-gray-800">{splitOpp.industrialSector}</p>
                    </div>
                  )}
                  {splitOpp.description && (
                    <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                      <p className="text-xs text-gray-500 mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{splitOpp.description}</p>
                    </div>
                  )}
                  {splitOpp.lostReason && (
                    <div className="bg-red-50 rounded-xl p-4 col-span-2">
                      <p className="text-xs text-red-500 mb-1">Loss Reason</p>
                      <p className="text-sm text-red-700 italic">{splitOpp.lostReason}</p>
                    </div>
                  )}
                  {(splitOpp.tags || []).length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {splitOpp.tags.map(tag => (
                          <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                    <p className="text-xs text-gray-500 mb-1">Quotations</p>
                    <p className="text-lg font-bold text-purple-600">{allQuotations.filter(q => q.opportunityId === splitOpp.id).length}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  {canEdit && (
                    <button onClick={() => { handleEdit(splitOpp); setSplitOpp(null); }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                      Edit Opportunity
                    </button>
                  )}
                  <button onClick={() => navigate('/quotations', { state: { filterByOpportunity: splitOpp.id } })}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Open Quotations
                    {allQuotations.filter(q => q.opportunityId === splitOpp.id).length > 0 && (
                      <span className="bg-white text-purple-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                        {allQuotations.filter(q => q.opportunityId === splitOpp.id).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {/* Right: Internal Chat */}
              <div className="w-[420px] flex-shrink-0 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  <InternalChat
                    refId={splitOpp.id}
                    refType="opportunity"
                    opportunityId={splitOpp.id}
                    title={splitOpp.title}
                    fullHeight
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <OpportunityModal
          opportunity={editingOpportunity}
          customers={customers}
          user={user}
          stageList={stageList}
          isSales={isSales}
          createForCompany={location.state?.createForCompany}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingOpportunity(null); }}
        />
      )}

      {lostPrompt && (
        <LostReasonModal
          onConfirm={handleLostConfirm}
          onCancel={() => setLostPrompt(null)}
        />
      )}
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
function OpportunityModal({ opportunity, customers, user, stageList, isSales, createForCompany, onSave, onClose }) {
  const [formData, setFormData] = useState(() => {
    if (opportunity) {
      // Normalize existing opportunity — ensure both name fields are set
      return {
        ...opportunity,
        customerName: opportunity.customerName || opportunity.companyName || '',
        companyName: opportunity.companyName || opportunity.customerName || '',
        customerId: opportunity.customerId || opportunity.companyId || '',
        companyId: opportunity.companyId || opportunity.customerId || '',
        tags: opportunity.tags || [],
        lostReason: opportunity.lostReason || '',
        industrialSector: opportunity.industrialSector || '',
        blNumber: opportunity.blNumber || '',
      };
    }
    return {
      customerId: createForCompany?.id || '',
      customerName: createForCompany?.name || '',
      companyId: createForCompany?.id || '',
      companyName: createForCompany?.name || '',
      title: '',
      description: '',
      value: 0,
      stage: user?.role === 'sales' ? 'new' : 'lead',
      probability: 10,
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      assignedTo: user?.id || '',
      status: 'active',
      costEstimate: 0,
      lostReason: '',
      tags: [],
      industrialSector: '',
      blNumber: '',
    };
  });

  const [tagInput, setTagInput] = useState('');

  const addTag = (tag) => {
    const t = tag.trim();
    if (!t || (formData.tags || []).includes(t)) return;
    setFormData({ ...formData, tags: [...(formData.tags || []), t] });
  };
  const removeTag = (tag) => setFormData({ ...formData, tags: (formData.tags || []).filter(t => t !== tag) });

  const showLostReason = isLostStage(formData.stage);

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    const name = customer?.name || '';
    setFormData({ ...formData, customerId, companyId: customerId, customerName: name, companyName: name });
  };

  const handleStageChange = (newStage) => {
    setFormData({ ...formData, stage: newStage, lostReason: isLostStage(newStage) ? formData.lostReason : '' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLostStage(formData.stage) && !formData.lostReason.trim()) {
      alert('Please provide a reason for marking this opportunity as Lost.');
      return;
    }
    const now = new Date().toISOString();
    onSave({
      ...formData,
      updatedAt: now,
      createdAt: formData.createdAt || now,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {opportunity ? 'Edit Opportunity' : 'Create New Opportunity'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <select
              value={formData.customerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opportunity Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Annual Supply Contract"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows="2"
            />
          </div>

          {/* BL Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BL Number
              <span className="ml-1 text-xs text-gray-400">(Bill of Lading)</span>
            </label>
            <input
              type="text"
              value={formData.blNumber || ''}
              onChange={(e) => setFormData({ ...formData, blNumber: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="e.g., MAEU1234567, BL-2024-001"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {user?.role === 'sales' ? 'Status' : 'Stage'}
              </label>
              <select
                value={formData.stage}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {stageList.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Probability (%)</label>
              <input
                type="number"
                value={formData.probability}
                onChange={(e) => setFormData({ ...formData, probability: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0" max="100" required
              />
            </div>
          </div>

          {showLostReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-red-700 mb-1">
                Loss Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.lostReason}
                onChange={(e) => setFormData({ ...formData, lostReason: e.target.value })}
                className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
                rows="2"
                placeholder="e.g. Price too high, Competitor selected, Project cancelled…"
                required
              />
              <p className="text-xs text-red-500 mt-1">Required when status is Lost.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opportunity Value ($)</label>
              <input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Estimate ($)</label>
              <input
                type="number"
                value={formData.costEstimate}
                onChange={(e) => setFormData({ ...formData, costEstimate: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close Date</label>
            <input
              type="date"
              value={formData.expectedCloseDate}
              onChange={(e) => setFormData({ ...formData, expectedCloseDate: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Industrial Sector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Industrial Sector</label>
            <select
              value={formData.industrialSector || ''}
              onChange={(e) => setFormData({ ...formData, industrialSector: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select sector —</option>
              {['Technology','Manufacturing','Retail','Healthcare','Construction','Transportation','Energy','Agriculture','Finance','Education','Hospitality','Logistics','Real Estate','Telecommunications','Other'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(formData.tags || []).map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-blue-400 hover:text-blue-700 leading-none">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); setTagInput(''); }
                  if (e.key === 'Escape') setTagInput('');
                }}
                placeholder="Type a tag and press Enter…"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => { addTag(tagInput); setTagInput(''); }}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Add</button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add a tag.</p>
          </div>

          {/* File Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
            <div className="space-y-2">
              {(formData.attachments || []).map((att, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="flex-1 truncate text-gray-600">{att.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{att.size ? (att.size/1024).toFixed(1)+' KB' : ''}</span>
                  {att.data && att.data.startsWith('data:image') && (
                    <a href={att.data} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex-shrink-0">View</a>
                  )}
                  <button type="button" onClick={() => setFormData({ ...formData, attachments: formData.attachments.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-600 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add file (image or PDF, max 2MB each)
                <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const current = formData.attachments || [];
                  let processed = 0;
                  const newAtts = [];
                  if (files.length === 0) return;
                  files.forEach(file => {
                    if (file.size > 2 * 1024 * 1024) { alert(`${file.name} is too large (max 2MB)`); processed++; return; }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      newAtts.push({ name: file.name, size: file.size, data: ev.target.result, type: file.type });
                      processed++;
                      if (processed === files.length) setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...newAtts] }));
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = '';
                }} />
              </label>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {opportunity ? 'Update' : 'Create Opportunity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Panel ───────────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  { value: 'call',     label: 'Call',       icon: '📞', color: 'bg-green-100 text-green-700' },
  { value: 'email',    label: 'Email',      icon: '✉️',  color: 'bg-blue-100 text-blue-700' },
  { value: 'meeting',  label: 'Meeting',    icon: '🤝',  color: 'bg-purple-100 text-purple-700' },
  { value: 'note',     label: 'Note',       icon: '📝',  color: 'bg-yellow-100 text-yellow-700' },
  { value: 'task',     label: 'Task',       icon: '✅',  color: 'bg-orange-100 text-orange-700' },
  { value: 'followup', label: 'Follow-up',  icon: '🔔',  color: 'bg-red-100 text-red-700' },
];

function ActivityPanel({ opportunityId, opportunityTitle, user }) {
  const [activities, setActivities] = React.useState([]);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ type: 'call', title: '', notes: '', dueDate: '', done: false });

  const load = () => { getActivities(opportunityId).then(setActivities).catch(()=>{}); };
  React.useEffect(() => { load(); }, [opportunityId]);

  const handleSave = () => {
    if (!form.title.trim()) return;
    saveActivity({ ...form, refId: opportunityId, refType: 'opportunity' });
    setForm({ type: 'call', title: '', notes: '', dueDate: '', done: false });
    setShowForm(false);
    load();
  };

  const toggleDone = (act) => { saveActivity({ ...act, done: !act.done }); load(); };
  const handleDelete = (id) => { if (confirm('Delete this activity?')) { deleteActivity(id); load(); } };

  const getTypeInfo = (val) => ACTIVITY_TYPES.find(t => t.value === val) || ACTIVITY_TYPES[0];

  return (
    <div className="py-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-orange-800 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Activities — {opportunityTitle}
        </h4>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Log Activity
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-orange-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400">
                {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date (optional)</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title / Subject *</label>
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Follow-up call with procurement team"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2} placeholder="Add details, outcomes, next steps…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 resize-none" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim()}
              className="px-4 py-1.5 text-xs bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 disabled:opacity-40">Save Activity</button>
          </div>
        </div>
      )}

      {activities.length === 0 ? (
        <p className="text-sm text-orange-700 italic opacity-70">No activities logged yet. Click "Log Activity" to add one.</p>
      ) : (
        <div className="space-y-2">
          {activities.map(act => {
            const typeInfo = getTypeInfo(act.type);
            const isOverdue = act.dueDate && !act.done && new Date(act.dueDate) < new Date();
            return (
              <div key={act.id} className={`bg-white border rounded-lg px-4 py-3 flex items-start gap-3 ${act.done ? 'opacity-60' : ''} ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
                <button onClick={() => toggleDone(act)} className="mt-0.5 flex-shrink-0" title={act.done ? 'Mark undone' : 'Mark done'}>
                  {act.done
                    ? <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    : <svg className="w-5 h-5 text-gray-300 hover:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2" /></svg>
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>{typeInfo.icon} {typeInfo.label}</span>
                    <span className={`text-sm font-medium ${act.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{act.title}</span>
                    {isOverdue && <span className="text-xs text-red-600 font-medium">Overdue</span>}
                  </div>
                  {act.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{act.notes}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    By {act.createdByName} · {new Date(act.createdAt).toLocaleDateString()}
                    {act.dueDate && ` · Due ${new Date(act.dueDate).toLocaleDateString()}`}
                  </p>
                </div>
                <button onClick={() => handleDelete(act.id)} className="p-1 text-red-300 hover:text-red-600 rounded flex-shrink-0" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
