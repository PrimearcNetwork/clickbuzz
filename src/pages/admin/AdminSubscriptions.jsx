import { useState, useEffect } from 'react';
import { Search, Edit2, Trash2, Plus, Check, X, Loader2 } from 'lucide-react';
import { plansApi } from '../../services/api';
import ExplorePlansBackground from './ExplorePlansBackground';

// Custom Toggle Component matching the reference UI
const CustomToggle = ({ isOn, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-14 h-7 rounded-full relative transition-colors duration-300 flex items-center ${isOn ? 'bg-[#22c55e]' : 'bg-[#475569]'}`}
  >
    <div className={`w-6 h-6 rounded-full bg-white absolute top-0.5 transition-transform duration-300 flex items-center justify-center ${isOn ? 'translate-x-7' : 'translate-x-0.5'}`}>
      {isOn
        ? <Check size={14} className="text-[#22c55e]" strokeWidth={3} />
        : <X size={14} className="text-gray-400" strokeWidth={3} />}
    </div>
  </button>
);

const EMPTY_PLAN = {
  name: '',
  original_price: '',
  billing_cycle: 'WEEKLY',
  number_of_days: '',
  sort_order: 1,
  is_recommended: false,
};

const AdminSubscriptions = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPlan, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // Inactive plans are hidden by default (some may be undeletable due to
  // real payment history referencing them, e.g. old test plans) — this lets
  // an admin still find and manage/reactivate one when actually needed.
  const [showInactive, setShowInactive] = useState(false);

  // ── Fetch plans from backend ────────────────────────────────────────────
  const fetchPlans = (includeInactive) => {
    setLoading(true);
    plansApi
      .getAll(!includeInactive)
      .then(setPlans)
      .catch((err) => console.error('Plans fetch failed:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlans(showInactive); }, [showInactive]);

  // ── Toggle status (uses dedicated toggle endpoint) ─────────────────────
  const toggleStatus = async (plan) => {
    // Optimistic
    setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, status: !p.status } : p));
    try {
      await plansApi.toggle(plan.id);
    } catch {
      // Revert
      setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, status: plan.status } : p));
    }
  };

  // ── Open edit modal ────────────────────────────────────────────────────
  const handleEdit = (plan) => {
    setEditing({ ...plan });
    setIsCreating(false);
    setModal(true);
  };

  // ── Open add modal ─────────────────────────────────────────────────────
  const handleAddNew = () => {
    setEditing({ ...EMPTY_PLAN, sort_order: plans.length + 1 });
    setIsCreating(true);
    setModal(true);
  };

  // ── Delete a plan ──────────────────────────────────────────────────────
  const handleDelete = async (plan) => {
    if (!window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    setDeletingId(plan.id);
    try {
      await plansApi.remove(plan.id);
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Save (create or update) ────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: editingPlan.name,
        original_price: parseFloat(editingPlan.original_price),
        billing_cycle: editingPlan.billing_cycle,
        number_of_days: parseInt(editingPlan.number_of_days),
        sort_order: parseInt(editingPlan.sort_order),
        is_recommended: editingPlan.is_recommended,
      };
      if (isCreating) {
        const created = await plansApi.create(payload);
        setPlans((prev) => [...prev, created]);
      } else {
        const updated = await plansApi.update(editingPlan.id, payload);
        setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p));
      }
      setModal(false);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full flex flex-col">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 font-medium text-sm">Results :</span>
            <select className="bg-[#141a29] border border-gray-700 text-white rounded-md px-3 py-1.5 outline-none focus:border-[#3b82f6] text-sm font-medium cursor-pointer">
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 accent-[#3b82f6]"
            />
            <span className="text-gray-400 text-sm font-medium">Show inactive plans</span>
          </label>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search..."
              className="bg-[#141a29] border border-gray-700 text-white rounded-full pl-4 pr-10 py-1.5 outline-none focus:border-[#3b82f6] text-sm w-full sm:w-64 placeholder-gray-500 transition-all focus:shadow-[0_0_10px_rgba(59,130,246,0.3)]"
            />
            <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-semibold transition-colors shrink-0"
          >
            <Plus size={16} /> Add Plan
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="bg-[#141a29] rounded-xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-300 min-w-[800px]">
            <thead className="bg-[#1e293b]/80 border-b border-gray-800 text-gray-300 font-semibold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 w-12"><div className="w-4 h-4 rounded bg-[#334155]"></div></th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Original Price</th>
                <th className="px-6 py-4">Billing Cycle</th>
                <th className="px-6 py-4">Number of Days</th>
                <th className="px-6 py-4">Sorting Number</th>
                <th className="px-6 py-4 text-center">Recommended</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#3b82f6]" size={24} />
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-gray-500">No plans found.</td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-[#1e2638] transition-colors">
                    <td className="px-6 py-4">
                      <div className="w-4 h-4 rounded bg-[#334155]"></div>
                    </td>
                    <td className="px-6 py-4 font-medium text-white">{plan.name}</td>
                    <td className="px-6 py-4">{parseFloat(plan.original_price).toFixed(2)}</td>
                    <td className="px-6 py-4">{plan.billing_cycle}</td>
                    <td className="px-6 py-4">{plan.number_of_days}</td>
                    <td className="px-6 py-4">{plan.sort_order}</td>
                    <td className="px-6 py-4 text-center">
                      {plan.is_recommended
                        ? <span className="text-[#00A8E1] font-bold text-xs">Yes</span>
                        : <span className="text-gray-600 text-xs">No</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <CustomToggle isOn={plan.status} onToggle={() => toggleStatus(plan)} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center items-center gap-3">
                        <button onClick={() => handleEdit(plan)} className="text-gray-400 hover:text-[#3b82f6] transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(plan)}
                          disabled={deletingId === plan.id}
                          className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          {deletingId === plan.id
                            ? <Loader2 size={18} className="animate-spin" />
                            : <Trash2 size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-gray-800 mt-auto flex items-center justify-between text-sm text-gray-400 bg-[#141a29]">
          <div className="border border-[#3b82f6]/30 text-[#3b82f6] px-4 py-1.5 rounded-md font-medium text-xs bg-[#3b82f6]/10">
            Showing page 1 of 1
          </div>
          <div className="flex flex-1 mx-4 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="w-1/4 h-full bg-[#e2e8f0]"></div>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-1 text-gray-500 hover:text-white transition-colors">←</button>
            <button className="w-8 h-8 rounded-md bg-[#3b82f6] text-white font-bold flex items-center justify-center shadow-lg shadow-blue-500/20">1</button>
            <button className="p-1 text-gray-500 hover:text-white transition-colors">→</button>
          </div>
        </div>
      </div>

      <ExplorePlansBackground />

      {/* Add/Edit Modal — exact same UI as before, discount fields removed */}
      {isModalOpen && editingPlan && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e2638] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700/50 flex flex-col" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>

            {/* Modal Header */}
            <div className="p-4 md:p-6 border-b border-gray-700/50 shrink-0">
              <h2 className="text-lg md:text-xl font-bold text-white tracking-wide">
                {isCreating ? 'Add Subscription Plan' : 'Update Subscription Plan'}
              </h2>
            </div>

            {/* Modal Body */}
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar">

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Name <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={editingPlan.name || ''}
                  onChange={(e) => setEditing({ ...editingPlan, name: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Original Price <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingPlan.original_price || ''}
                  onChange={(e) => setEditing({ ...editingPlan, original_price: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Billing Cycle <span className="text-red-500 ml-1">*</span>
                </label>
                <select
                  value={editingPlan.billing_cycle || ''}
                  onChange={(e) => setEditing({ ...editingPlan, billing_cycle: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all cursor-pointer"
                >
                  {['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].map((c) => (
                    <option key={c} value={c} className="bg-[#1e2638]">{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Number of Days <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="number"
                  value={editingPlan.number_of_days || ''}
                  onChange={(e) => setEditing({ ...editingPlan, number_of_days: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Sorting Number <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={isCreating ? plans.length + 1 : plans.length}
                  value={editingPlan.sort_order || ''}
                  onChange={(e) => {
                    const max = isCreating ? plans.length + 1 : plans.length;
                    const val = parseInt(e.target.value) || 1;
                    setEditing({ ...editingPlan, sort_order: Math.min(Math.max(val, 1), max) });
                  }}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
                <p className="text-xs text-gray-500">
                  Valid range: 1 – {isCreating ? plans.length + 1 : plans.length}
                </p>
              </div>

              <div className="space-y-2 flex items-center gap-4 pt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPlan.is_recommended || false}
                    onChange={(e) => setEditing({ ...editingPlan, is_recommended: e.target.checked })}
                    className="w-4 h-4 accent-[#00A8E1]"
                  />
                  <span className="text-sm font-semibold text-white">Recommended badge on Plans page</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 md:p-6 border-t border-gray-700/50 flex justify-end items-center space-x-4 bg-[#141a29]/50 shrink-0">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 md:px-6 md:py-2.5 rounded-lg bg-[#334155] text-white font-medium hover:bg-[#475569] transition-colors text-sm md:text-base"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 md:px-8 md:py-2.5 rounded-lg bg-[#22c55e] text-white font-bold hover:bg-[#16a34a] transition-colors shadow-lg shadow-green-500/20 text-sm md:text-base disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptions;
