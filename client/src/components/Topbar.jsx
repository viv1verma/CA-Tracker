import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';

/* ------------------------------------------------------------------ */
/*  Topbar component                                                   */
/* ------------------------------------------------------------------ */

export default function Topbar({ title, breadcrumb, onMenuClick }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();
  const { clients, assignments, users, unreadNotifs } = useData();

  // Global search across clients, assignments, and team members
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const results = [];

    // Search clients
    (clients || []).forEach(c => {
      if ((c.name || '').toLowerCase().includes(q) || (c.pan || '').toLowerCase().includes(q)) {
        results.push({ type: 'Client', label: c.name, sub: c.pan || '', path: '/clients' });
      }
    });

    // Search assignments (work types and client names)
    (assignments || []).slice(0, 200).forEach(a => {
      const clientName = (clients || []).find(c => c.id === a.clientId)?.name || '';
      if ((a.workType || '').toLowerCase().includes(q) || clientName.toLowerCase().includes(q)) {
        results.push({ type: 'Assignment', label: `${a.workType} - ${clientName}`, sub: a.status || '', path: '/assignments' });
      }
    });

    // Search team members
    (users || []).forEach(u => {
      if ((u.name || '').toLowerCase().includes(q) || (u.designation || '').toLowerCase().includes(q)) {
        results.push({ type: 'Team', label: u.name, sub: u.designation || '', path: '/team' });
      }
    });

    return results.slice(0, 8); // Limit to 8 results
  }, [searchQuery, clients, assignments, users]);

  const handleResultClick = useCallback((result) => {
    navigate(result.path);
    setSearchQuery('');
    setShowResults(false);
  }, [navigate]);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      {/* Left section: hamburger + breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger (mobile only) */}
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Open sidebar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center text-sm min-w-0">
          {breadcrumb && (
            <>
              <span className="text-gray-400 hidden sm:inline">{breadcrumb}</span>
              <svg className="w-4 h-4 text-gray-300 mx-1.5 flex-shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
          <span className="font-semibold text-gray-800 truncate">{title || 'Dashboard'}</span>
        </nav>
      </div>

      {/* Right section: search + notification */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Search input */}
        <div className="relative hidden sm:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            placeholder="Search clients, tasks..."
            className="w-56 lg:w-72 pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg
                       placeholder:text-gray-400 text-gray-700
                       focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
                       transition-colors"
          />
          {/* Search results dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleResultClick(result)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded min-w-[60px] text-center">
                    {result.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{result.label}</div>
                    {result.sub && <div className="text-xs text-gray-400 truncate">{result.sub}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {showResults && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 px-4 py-3 text-sm text-gray-500 text-center">
              No results found
            </div>
          )}
        </div>

        {/* Mobile search button */}
        <button className="sm:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Notification bell */}
        <button
          className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Notifications"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadNotifs > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
      </div>
    </header>
  );
}
