// components/common/Pagination.jsx
import React from 'react';

/**
 * Simple, reusable pagination component.
 * Usage:
 *   const { page, setPage, pageCount, paginated } = usePagination(items, 50);
 *   ...render paginated instead of items...
 *   <Pagination page={page} pageCount={pageCount} onPageChange={setPage} total={items.length} pageSize={50} />
 */
export function usePagination(items, pageSize = 50) {
  const [page, setPage] = React.useState(1);
  // Reset to page 1 whenever items change (e.g. after a filter)
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    if (itemsRef.current !== items) {
      setPage(1);
      itemsRef.current = items;
    }
  });

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage  = Math.min(page, pageCount);
  const start     = (safePage - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);

  return { page: safePage, setPage, pageCount, paginated, total: items.length, pageSize };
}

export default function Pagination({ page, pageCount, onPageChange, total, pageSize }) {
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  // Generate visible page numbers (always show first, last, and up to 3 around current)
  const pages = [];
  const delta = 1;
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    }
  }
  // Add ellipsis markers
  const withEllipsis = [];
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev > 1) withEllipsis.push('...');
    withEllipsis.push(p);
    prev = p;
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium">{start}–{end}</span> of <span className="font-medium">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {withEllipsis.map((p, i) =>
          p === '...'
            ? <span key={`e-${i}`} className="px-1 text-gray-400 text-sm select-none">…</span>
            : <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  p === page
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >{p}</button>
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
