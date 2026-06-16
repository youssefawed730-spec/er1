// components/sales/SalesTeamTracker.jsx
// Sales Team Tracker — spreadsheet-style view for Head of Sales
// Columns: #, Date, Client Name, CRM Link, CTR Qty, Status, Remark, POL, POD, Sales Person, OPS Response
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getOpportunities, saveOpportunity, getCompanies, getUsers,
  getCurrentUser, subscribeToEvents
} from '../../data/store';

const STATUS_OPTIONS = [
  { value: '',             label: '—',            bg: 'bg-gray-100',   text: 'text-gray-500' },
  { value: 'rate_request', label: 'Rate Request',  bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'won',          label: 'Won',           bg: 'bg-green-100',  text: 'text-green-700' },
  { value: 'lost',         label: 'Lost',          bg: 'bg-red-100',    text: 'text-red-700' },
  { value: 'new',          label: 'New',           bg: 'bg-gray-100',   text: 'text-gray-700' },
];

function statusStyle(val) {
  const s = STATUS_OPTIONS.find(o => o.value === val) || STATUS_OPTIONS[0];
  return `${s.bg} ${s.text}`;
}
function statusLabel(val) {
  return STATUS_OPTIONS.find(o => o.value === val)?.label || val || '—';
}

// Inline-editable cell
function EditCell({ value, onChange, type = 'text', options, placeholder = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef();

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    if (options) {
      return (
        <select
          autoFocus
          value={draft}
          onChange={e => { setDraft(e.target.value); onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none bg-white"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={ref}
        autoFocus
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none bg-white min-w-[80px]"
        placeholder={placeholder}
      />
    );
  }

  if (type === 'status') {
    const val = value || '';
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${statusStyle(val)}`}
      >
        {statusLabel(val)}
      </span>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-pointer text-xs text-gray-700 hover:bg-blue-50 px-1 py-0.5 rounded min-w-[40px] inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-[160px]"
      title={value}
    >
      {value || <span className="text-gray-300 italic">{placeholder || 'click to edit'}</span>}
    </span>
  );
}

// OPS Response checkbox
function OpsCheckbox({ value, onChange }) {
  return (
    <div className="flex justify-center">
      <input
        type="checkbox"
        checked={!!value}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-blue-600 cursor-pointer"
      />
    </div>
  );
}

export default function SalesTeamTracker() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState([]);
  const [companies, setCompanies]   = useState([]);
  const [users, setUsers]           = useState([]);

  // Date range filter
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo,   setDateTo]   = useState(today);

  // Status filter
  const [statusFilter, setStatusFilter] = useState('');
  // Sales person filter
  const [spFilter, setSpFilter] = useState('');
  // Search
  const [search, setSearch] = useState('');

  // Add new row modal
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow]   = useState({
    date: today, clientName: '', crmLink: '', ctrQty: '',
    status: 'rate_request', remark: '', pol: '', pod: '',
    assignedTo: '', opsResponse: false
  });

  const load = () => {
    getUsers().then(allUsers => {
      const salesUserIds = allUsers.filter(u => u.role === 'sales').map(u => u.id);
      getOpportunities().then(opps => {
        if (user?.role === 'head_of_sales') {
          opps = opps.filter(o => !o.assignedTo || salesUserIds.includes(o.assignedTo) || o.assignedTo === user.id);
        }
        setOpportunities(opps);
      }).catch(() => {});
      setUsers(allUsers.filter(u => ['sales','head_of_sales'].includes(u.role)));
    }).catch(() => {});
    getCompanies().then(setCompanies).catch(()=>{});
  };

  useEffect(() => {
    load();
    const unsub = subscribeToEvents(e => {
      if (['opportunity_created','opportunity_updated','opportunity_deleted'].includes(e.type)) load();
    });
    return unsub;
  }, []);

  // Derive rows: opportunities have a trackerDate (or createdAt) for filtering
  const rows = opportunities
    .filter(o => {
      const rowDate = (o.trackerDate || o.createdAt || '').slice(0, 10);
      if (dateFrom && rowDate < dateFrom) return false;
      if (dateTo   && rowDate > dateTo)   return false;
      if (statusFilter && o.status !== statusFilter) return false;
      if (spFilter && o.assignedTo !== spFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const companyName = getCompanyName(o.companyId, companies);
        if (
          !companyName.toLowerCase().includes(q) &&
          !(o.title || '').toLowerCase().includes(q) &&
          !(o.pol || '').toLowerCase().includes(q) &&
          !(o.pod || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = (a.trackerDate || a.createdAt || '');
      const db = (b.trackerDate || b.createdAt || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });

  function getCompanyName(companyId, comps) {
    return comps.find(c => c.id === companyId)?.name || '';
  }
  function getUserName(userId) {
    return users.find(u => u.id === userId)?.name || '';
  }

  const updateField = (opp, field, val) => {
    const updated = { ...opp, [field]: val, updatedAt: new Date().toISOString() };
    saveOpportunity(updated);
    load();
  };

  const handleAddRow = () => {
    const opp = {
      title: newRow.clientName || 'New Opportunity',
      companyId: '',
      status: newRow.status,
      trackerDate: newRow.date,
      crmLink: newRow.crmLink,
      ctrQty: newRow.ctrQty,
      remark: newRow.remark,
      pol: newRow.pol,
      pod: newRow.pod,
      assignedTo: newRow.assignedTo,
      opsResponse: newRow.opsResponse,
      trackerClientName: newRow.clientName,
      createdAt: new Date().toISOString(),
    };
    saveOpportunity(opp);
    setShowAdd(false);
    setNewRow({ date: today, clientName: '', crmLink: '', ctrQty: '', status: 'rate_request', remark: '', pol: '', pod: '', assignedTo: '', opsResponse: false });
    load();
  };

  // Summary counts
  const total = rows.length;
  const won = rows.filter(r => r.status === 'won').length;
  const lost = rows.filter(r => r.status === 'lost').length;
  const pending = rows.filter(r => !['won','lost'].includes(r.status)).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Sales Team Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage and monitor sales opportunities across the team</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Row
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total', value: total, color: 'border-gray-300 bg-gray-50', num: 'text-gray-800' },
          { label: 'Pending', value: pending, color: 'border-blue-200 bg-blue-50', num: 'text-blue-700' },
          { label: 'Won', value: won, color: 'border-green-200 bg-green-50', num: 'text-green-700' },
          { label: 'Lost', value: lost, color: 'border-red-200 bg-red-50', num: 'text-red-700' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-3 ${card.color}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.num}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(o => o.value).map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={spFilter}
          onChange={e => setSpFilter(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">All Salespeople</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5 ml-auto">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client, port…"
            className="text-xs border border-gray-300 rounded px-2 py-1.5 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {(search || statusFilter || spFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); setSpFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-1"
              title="Clear filters"
            >✕</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-blue-600 text-white">
              {['#', 'Date', 'Client Name', 'CRM Link', 'CTR Qty', 'Status', 'Remark', 'POL', 'POD', 'Sales Person', 'OPS Response'].map(h => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-r border-blue-500 last:border-r-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-16 text-gray-400 italic">
                  No opportunities found for the selected filters.
                </td>
              </tr>
            )}
            {rows.map((opp, idx) => {
              const clientName = opp.trackerClientName || getCompanyName(opp.companyId, companies) || opp.title || '';
              const rowDate    = (opp.trackerDate || opp.createdAt || '').slice(0, 10);
              const spName     = getUserName(opp.assignedTo);
              const isEven     = idx % 2 === 1;

              return (
                <tr
                  key={opp.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/40 transition-colors ${isEven ? 'bg-cyan-50/40' : 'bg-white'}`}
                >
                  {/* # */}
                  <td className="px-3 py-1.5 text-gray-400 font-medium border-r border-gray-100 w-10">{idx + 1}</td>

                  {/* Date */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-28">
                    <EditCell
                      type="date"
                      value={rowDate}
                      onChange={v => updateField(opp, 'trackerDate', v)}
                    />
                  </td>

                  {/* Client Name */}
                  <td className="px-3 py-1.5 border-r border-gray-100 max-w-[140px]">
                    <EditCell
                      value={clientName}
                      onChange={v => updateField(opp, 'trackerClientName', v)}
                      placeholder="Client name"
                    />
                  </td>

                  {/* CRM Link — auto-generated internal link */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-32">
                    <button
                      onClick={() => navigate(`/opportunities?opp=${opp.id}`)}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium whitespace-nowrap"
                      title={`Open opportunity: ${opp.title || clientName}`}
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open Opp
                    </button>
                  </td>

                  {/* CTR Qty */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-24">
                    <EditCell
                      value={opp.ctrQty || ''}
                      onChange={v => updateField(opp, 'ctrQty', v)}
                      placeholder="e.g. 1×40"
                    />
                  </td>

                  {/* Status */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-32">
                    <EditCell
                      type="status"
                      value={opp.status}
                      options={STATUS_OPTIONS}
                      onChange={v => updateField(opp, 'status', v)}
                    />
                  </td>

                  {/* Remark */}
                  <td className="px-3 py-1.5 border-r border-gray-100 max-w-[160px]">
                    <EditCell
                      value={opp.remark || ''}
                      onChange={v => updateField(opp, 'remark', v)}
                      placeholder="Remark"
                    />
                  </td>

                  {/* POL */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-24">
                    <EditCell
                      value={opp.pol || ''}
                      onChange={v => updateField(opp, 'pol', v)}
                      placeholder="Port"
                    />
                  </td>

                  {/* POD */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-28">
                    <EditCell
                      value={opp.pod || ''}
                      onChange={v => updateField(opp, 'pod', v)}
                      placeholder="Destination"
                    />
                  </td>

                  {/* Sales Person */}
                  <td className="px-3 py-1.5 border-r border-gray-100 w-32">
                    <EditCell
                      value={opp.assignedTo}
                      options={[{ value: '', label: '—' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
                      onChange={v => updateField(opp, 'assignedTo', v)}
                    />
                    {opp.assignedTo && !users.find(u => u.id === opp.assignedTo) ? (
                      <span className="text-gray-400 italic">{opp.assignedTo}</span>
                    ) : (
                      spName && <span className="text-xs text-gray-600">{spName}</span>
                    )}
                  </td>

                  {/* OPS Response */}
                  <td className="px-3 py-1.5 w-24">
                    <OpsCheckbox
                      value={opp.opsResponse}
                      onChange={v => updateField(opp, 'opsResponse', v)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals row */}
      {rows.length > 0 && (
        <div className="mt-2 flex gap-4 px-1 text-xs text-gray-500">
          <span>{total} rows</span>
          <span className="text-green-600 font-medium">{won} Won</span>
          <span className="text-red-500 font-medium">{lost} Lost</span>
          <span className="text-blue-500 font-medium">{pending} Pending</span>
        </div>
      )}

      {/* Add Row Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Add New Opportunity</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Date', field: 'date', type: 'date' },
                { label: 'Client Name', field: 'clientName', type: 'text', placeholder: 'Client / Company name' },
                { label: 'CRM Link', field: 'crmLink', type: 'url', placeholder: 'https://…' },
                { label: 'CTR Qty', field: 'ctrQty', type: 'text', placeholder: 'e.g. 1×40 HC' },
                { label: 'Remark', field: 'remark', type: 'text', placeholder: 'Notes…' },
                { label: 'POL (Port of Loading)', field: 'pol', type: 'text', placeholder: 'e.g. SHANGHAI' },
                { label: 'POD (Port of Discharge)', field: 'pod', type: 'text', placeholder: 'e.g. SOKHNA' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type={type}
                    value={newRow[field]}
                    onChange={e => setNewRow(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={newRow.status}
                  onChange={e => setNewRow(p => ({ ...p, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {STATUS_OPTIONS.filter(o => o.value).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sales Person</label>
                <select
                  value={newRow.assignedTo}
                  onChange={e => setNewRow(p => ({ ...p, assignedTo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— Unassigned —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="opsResp"
                  checked={newRow.opsResponse}
                  onChange={e => setNewRow(p => ({ ...p, opsResponse: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600"
                />
                <label htmlFor="opsResp" className="text-sm text-gray-700">OPS Response received</label>
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRow}
                disabled={!newRow.clientName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add Opportunity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
