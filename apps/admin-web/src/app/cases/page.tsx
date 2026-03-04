// ============================================================
// SurplusFlow AI — Cases List Page
// /apps/admin-web/src/app/cases/page.tsx
// ============================================================

'use client';
import React, { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  PROSPECT: 'bg-gray-100 text-gray-700',
  OUTREACH: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-indigo-100 text-indigo-700',
  ENROLLED: 'bg-purple-100 text-purple-700',
  PACKET_ASSEMBLY: 'bg-yellow-100 text-yellow-700',
  ATTORNEY_REVIEW: 'bg-orange-100 text-orange-700',
  SUBMITTED: 'bg-cyan-100 text-cyan-700',
  AWAITING_PAYOUT: 'bg-emerald-100 text-emerald-700',
  INVOICED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-green-200 text-green-800',
  BLOCKED: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-amber-100 text-amber-700',
};

// Sample data for UI scaffolding
const SAMPLE_CASES = [
  { id: '1', caseNumber: 'SF-2024-00001', claimantName: 'John Doe', state: 'CA', sourceType: 'unclaimed_property', status: 'ENROLLED', amount: 4500, assignedTo: 'Jane Ops' },
  { id: '2', caseNumber: 'SF-2024-00002', claimantName: 'Jane Smith', state: 'FL', sourceType: 'foreclosure_surplus', status: 'ATTORNEY_REVIEW', amount: 28000, assignedTo: 'Jane Ops' },
  { id: '3', caseNumber: 'SF-2024-00003', claimantName: 'Robert Johnson', state: 'TX', sourceType: 'tax_sale_surplus', status: 'PROSPECT', amount: 12000, assignedTo: null },
];

export default function CasesPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = SAMPLE_CASES.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.caseNumber.includes(search) && !c.claimantName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cases</h1>
        <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-800">
          + New Case
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <input
          type="text" placeholder="Search cases..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-4 py-2 text-sm w-64"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded-lg px-4 py-2 text-sm">
          <option value="all">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Cases Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Case #</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Claimant</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">State</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Type</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Amount</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Assigned</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer">
                <td className="px-6 py-4 font-mono text-xs">{c.caseNumber}</td>
                <td className="px-6 py-4 font-medium">{c.claimantName}</td>
                <td className="px-6 py-4">{c.state}</td>
                <td className="px-6 py-4 text-xs">{c.sourceType.replace('_', ' ')}</td>
                <td className="px-6 py-4">${c.amount.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500">{c.assignedTo || '—'}</td>
                <td className="px-6 py-4">
                  <a href={`/cases/${c.id}`} className="text-blue-600 hover:underline text-xs">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Showing {filtered.length} of {SAMPLE_CASES.length} cases
      </div>
    </div>
  );
}
