// components/common/InternalChat.jsx
// Internal chat panel between Sales and Operations roles.
// Scoped to an opportunity or quotation (refId / refType).
// Operations can attach a cost-items snapshot to any message.
// All users can attach files (images, PDFs, docs) to messages.

import React, { useState, useEffect, useRef } from 'react';
import {
  getChats, sendChatMessage, markChatRead,
  getCostItems, getCurrentUser, getOpportunityChatReplies
} from '../../data/store';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)  return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return new Date(iso).toLocaleDateString();
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function FileAttachmentPreview({ file, isMe }) {
  if (!file) return null;
  const isImage = file.type?.startsWith('image/');
  return (
    <div className={`mt-2 rounded-xl overflow-hidden border ${isMe ? 'border-blue-400/40' : 'border-gray-200'}`}>
      {isImage ? (
        <div>
          <img src={file.dataUrl} alt={file.name} className="max-w-[240px] max-h-[180px] object-cover rounded-lg" />
          <div className={`px-2 py-1 text-[10px] ${isMe ? 'text-blue-200' : 'text-gray-500'}`}>{file.name}</div>
        </div>
      ) : (
        <a href={file.dataUrl} download={file.name} className={`flex items-center gap-2 px-3 py-2 hover:opacity-80 transition-opacity ${isMe ? 'bg-blue-500/30' : 'bg-gray-50'}`}>
          <svg className={`w-6 h-6 flex-shrink-0 ${isMe ? 'text-blue-200' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div className="min-w-0">
            <p className={`text-xs font-medium truncate max-w-[160px] ${isMe ? 'text-white' : 'text-gray-800'}`}>{file.name}</p>
            <p className={`text-[10px] ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatFileSize(file.size)} · click to download</p>
          </div>
        </a>
      )}
    </div>
  );
}

function CostSnapshot({ items }) {
  if (!items || items.length === 0) return null;
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);
  const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  return (
    <div className="mt-2 border border-orange-200 rounded-lg overflow-hidden text-xs bg-orange-50">
      <div className="px-3 py-1.5 bg-orange-100 font-semibold text-orange-800 flex items-center gap-1">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 7h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z" />
        </svg>
        Cost Breakdown Attached
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-orange-700 bg-orange-50">
            <th className="px-3 py-1 text-left">Item</th>
            <th className="px-3 py-1 text-left">Category</th>
            <th className="px-3 py-1 text-left">Vendor</th>
            <th className="px-3 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-orange-100">
              <td className="px-3 py-1 text-gray-700">{item.description}</td>
              <td className="px-3 py-1 text-gray-500 capitalize">{item.category}</td>
              <td className="px-3 py-1 text-gray-500">{item.vendor || '—'}</td>
              <td className="px-3 py-1 text-right font-medium text-gray-800">{fmt(item.amount)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-orange-200 bg-orange-100">
            <td colSpan={3} className="px-3 py-1.5 font-bold text-orange-900">Total</td>
            <td className="px-3 py-1.5 text-right font-bold text-orange-900">{fmt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function InternalChat({ refId, refType, opportunityId, title, fullHeight }) {
  const [messages, setMessages]         = useState([]);
  const [text, setText]                 = useState('');
  const [attachCosts, setAttachCosts]   = useState(false);
  const [costItems, setCostItems]       = useState([]);
  const [selectedCosts, setSelectedCosts] = useState([]);
  const [pendingFile, setPendingFile]   = useState(null); // { name, type, size, dataUrl }
  const [fileLoading, setFileLoading]   = useState(false);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const user = getCurrentUser();
  const isOps   = user?.role === 'operation';
  const isSales = user?.role === 'sales' || user?.role === 'head_of_sales';
  const canChat = isOps || isSales;

  const scopeId = refId;

  const load = () => {
    const msgs = getChats(scopeId);
    setMessages(msgs);
    markChatRead(scopeId, user?.id);
    if (isOps && opportunityId) {
      const items = getCostItems().filter(c => c.opportunityId === opportunityId);
      setCostItems(items);
    }
  };

useEffect(() => {
  let cancelled = false;
  const guardedLoad = () => { if (!cancelled) load(); };
  guardedLoad();
  const interval = setInterval(guardedLoad, 5000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [refId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Limit 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large. Maximum size is 5MB.');
      return;
    }
    setFileLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingFile({ name: file.name, type: file.type, size: file.size, dataUrl: ev.target.result });
      setFileLoading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePendingFile = () => setPendingFile(null);

  const handleSend = () => {
    if (!text.trim() && selectedCosts.length === 0 && !pendingFile) return;
    const snapshot = attachCosts && selectedCosts.length > 0
      ? costItems.filter(c => selectedCosts.includes(c.id))
      : null;

    sendChatMessage({
      refId: scopeId,
      refType,
      text: text.trim(),
      senderRole: user?.role,
      senderId: user?.id,
      senderName: user?.name || user?.role,
      costItemsSnapshot: snapshot,
      fileAttachment: pendingFile || null,
    });
    setText('');
    setAttachCosts(false);
    setSelectedCosts([]);
    setPendingFile(null);
    load();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleCostItem = (id) => {
    setSelectedCosts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  if (!canChat) return null;

  const roleLabel = (role) => {
    if (role === 'operation') return 'Operations';
    if (role === 'sales')     return 'Sales';
    if (role === 'head_of_sales') return 'Head of Sales';
    return role;
  };

  const myMsg  = (msg) => msg.senderId === user?.id;
  const opsMsg = (msg) => msg.senderRole === 'operation';

  return (
    <div className={`flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${fullHeight ? 'h-full' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex-shrink-0">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Internal Chat — Ops ↔ Sales</p>
          {title && <p className="text-xs text-blue-200 truncate">{title}</p>}
        </div>
        <span className="text-xs bg-blue-500 px-2 py-0.5 rounded-full">{messages.length} msg{messages.length !== 1 ? 's' : ''}</span>
        {/* Check Button - Shows reply status for sales/ops */}
        {(isSales || isOps) && messages.length > 0 && (() => {
          const chatInfo = getOpportunityChatReplies(scopeId);
          return (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs bg-green-500/80 px-2 py-0.5 rounded-full flex items-center gap-1" title="Sales replied">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sales: {chatInfo.salesMessageCount}
              </span>
              <span className="text-xs bg-orange-500/80 px-2 py-0.5 rounded-full flex items-center gap-1" title="Ops replied">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Ops: {chatInfo.opsMessageCount}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 ${fullHeight ? '' : 'max-h-80'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs mt-1">Operations can share cost breakdowns here.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = myMsg(msg);
          const isOpsMessage = opsMsg(msg);
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`text-xs font-semibold ${isOpsMessage ? 'text-orange-700' : 'text-blue-700'}`}>
                    {msg.senderName || roleLabel(msg.senderRole)}
                  </span>
                  <span className="text-xs text-gray-400">{timeAgo(msg.createdAt)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    isOpsMessage ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {roleLabel(msg.senderRole)}
                  </span>
                </div>
                <div className={`rounded-2xl px-4 py-2 text-sm ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                }`}>
                  {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                  {msg.fileAttachment && (
                    <FileAttachmentPreview file={msg.fileAttachment} isMe={isMe} />
                  )}
                  {msg.costItemsSnapshot && (
                    <div className={isMe ? 'text-white' : ''}>
                      <CostSnapshot items={msg.costItemsSnapshot} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Cost items picker — only for ops */}
      {isOps && attachCosts && costItems.length > 0 && (
        <div className="border-t border-orange-200 bg-orange-50 px-4 py-3 flex-shrink-0">
          <p className="text-xs font-semibold text-orange-800 mb-2">Select cost items to attach:</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {costItems.map(item => (
              <label key={item.id} className="flex items-center gap-2 cursor-pointer hover:bg-orange-100 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={selectedCosts.includes(item.id)}
                  onChange={() => toggleCostItem(item.id)}
                  className="rounded text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs flex-1 text-gray-700">{item.description}</span>
                <span className="text-xs font-medium text-gray-900">
                  ${Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-[10px] px-1 py-0.5 rounded ${
                  item.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>{item.status}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {isOps && attachCosts && costItems.length === 0 && (
        <div className="border-t border-orange-200 bg-orange-50 px-4 py-2 flex-shrink-0">
          <p className="text-xs text-orange-700">No cost items linked to this opportunity yet. Add them in Cost Items first.</p>
        </div>
      )}

      {/* Pending file preview */}
      {pendingFile && (
        <div className="border-t border-green-200 bg-green-50 px-4 py-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {pendingFile.type?.startsWith('image/') ? (
              <img src={pendingFile.dataUrl} alt={pendingFile.name} className="w-10 h-10 object-cover rounded" />
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-green-800 truncate">{pendingFile.name}</p>
              <p className="text-[10px] text-green-600">{formatFileSize(pendingFile.size)}</p>
            </div>
            <button onClick={removePendingFile} className="text-green-600 hover:text-red-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 px-3 py-3 bg-white flex-shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              placeholder={
                isOps
                  ? 'Message sales team — attach cost breakdown below…'
                  : 'Ask operations about costs or shipment details…'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex items-center gap-2 mt-1.5">
              {/* File attachment button — available to everyone */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fileLoading}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                  pendingFile
                    ? 'bg-green-100 border-green-300 text-green-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-200 hover:text-green-600'
                }`}
                title="Attach a file (image, PDF, doc — max 5MB)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {fileLoading ? 'Loading…' : pendingFile ? '1 file attached' : 'Attach File'}
              </button>
              {isOps && (
                <button
                  type="button"
                  onClick={() => setAttachCosts(v => !v)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    attachCosts
                      ? 'bg-orange-100 border-orange-300 text-orange-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachCosts ? `${selectedCosts.length} cost item(s) selected` : 'Attach Cost Breakdown'}
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">Enter to send · Shift+Enter for newline</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() && selectedCosts.length === 0 && !pendingFile}
            className="mb-7 p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {/* Reply Status Summary */}
        {messages.length > 0 && (() => {
          const chatInfo = getOpportunityChatReplies(scopeId);
          return (
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span>Sales: {chatInfo.salesMessageCount} msg{chatInfo.salesMessageCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                <span>Ops: {chatInfo.opsMessageCount} msg{chatInfo.opsMessageCount !== 1 ? 's' : ''}</span>
              </div>
              {chatInfo.totalMessages > 1 && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                  chatInfo.lastReplyBy === 'sales' || chatInfo.lastReplyBy === 'head_of_sales'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-orange-100 text-orange-700'
                }`}>
                  Last: {roleLabel(chatInfo.lastReplyBy)}
                </span>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
