import { useState, useEffect } from 'react';
import {
  Info,
  Shield,
  LineChart,
  FileText,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  Zap,
  Bookmark,
  Search,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { settingsMenuApi } from '../../services/api';

// Must stay in sync with SettingsPage's ICON_MAP
const ICON_OPTIONS = [
  'Zap', 'Bookmark', 'Info', 'Shield', 'LineChart',
  'FileText', 'LayoutDashboard', 'LogOut',
];

const ICON_MAP = {
  Info, Shield, LineChart, FileText, LayoutDashboard, LogOut, Zap, Bookmark,
};

// ── Toggle (same component used across admin) ────────────────────────────────
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

// ── Live preview card (exact same markup as SettingsPage button) ─────────────
const PreviewCard = ({ item }) => {
  const IconComponent = ICON_MAP[item.icon_key] || Info;
  return (
    <div
      className={`w-full flex items-center justify-between px-3.5 md:px-5 py-3 md:py-4 bg-bg-card border ${item.is_highlight
          ? 'border-[#00A8E1]/40 shadow-[0_0_12px_rgba(0,168,225,0.12)]'
          : 'border-white/5'
        } rounded-2xl shadow-sm`}
    >
      <div className="flex items-center space-x-3 md:space-x-5 min-w-0">
        <div className={`w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full flex items-center justify-center border ${item.is_highlight
            ? 'bg-[#00A8E1]/15 border-[#00A8E1]/70'
            : 'bg-white/5 border-white/10'
          }`}>
          <IconComponent className="w-4 h-4 md:w-5 md:h-5 text-[#00A8E1]" strokeWidth={2.2} />
        </div>
        <span className="font-semibold text-[13px] md:text-[15px] tracking-wide text-gray-200 text-left truncate">
          {item.name || 'Menu Item'}
        </span>
      </div>
      <ChevronRight size={16} className={item.is_highlight ? 'text-[#00A8E1]' : 'text-gray-600'} />
    </div>
  );
};

// ── Empty form state ─────────────────────────────────────────────────────────
const emptyForm = () => ({
  name: '',
  icon_key: 'Info',
  path: '',
  is_highlight: false,
  is_logout: false,
  status: true,
  sort_order: 0,
});

// ════════════════════════════════════════════════════════════════════════════
const AdminSettings = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setModal] = useState(false);
  const [editingItem, setEditing] = useState(null); // null = create mode
  const [formData, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchItems = () => {
    setLoading(true);
    settingsMenuApi
      .getAll()
      .then(setItems)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  // ── Derived list (client-side search) ─────────────────────────────────
  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Status toggle ──────────────────────────────────────────────────────
  const toggleStatus = async (item) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => i.id === item.id ? { ...i, status: !i.status } : i)
    );
    try {
      await settingsMenuApi.update(item.id, { status: !item.status });
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: item.status } : i)
      );
    }
  };

  // ── Open modals ────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name,
      icon_key: item.icon_key,
      path: item.path || '',
      is_highlight: item.is_highlight,
      is_logout: item.is_logout,
      status: item.status,
      sort_order: item.sort_order,
    });
    setModal(true);
  };

  // ── Save (create or update) ────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        path: formData.path || null,
      };
      if (editingItem) {
        const updated = await settingsMenuApi.update(editingItem.id, payload);
        setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i));
      } else {
        const created = await settingsMenuApi.create(payload);
        setItems((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
      }
      setModal(false);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await settingsMenuApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleteId(null);
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full flex flex-col">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-lg md:text-xl font-bold text-white tracking-wider uppercase">
          Settings Menu
        </h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#3b82f6] text-white font-bold hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} /> Add Item
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="relative w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#141a29] border border-gray-700 text-white rounded-full pl-4 pr-10 py-1.5 outline-none focus:border-[#3b82f6] text-sm w-full sm:w-64 placeholder-gray-500 transition-all focus:shadow-[0_0_10px_rgba(59,130,246,0.3)]"
          />
          <Search size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#141a29] rounded-xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-300 min-w-[700px]">
            <thead className="bg-[#1e293b]/80 border-b border-gray-800 text-gray-300 font-semibold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Icon</th>
                <th className="px-6 py-4">Path</th>
                <th className="px-6 py-4 text-center">Highlight</th>
                <th className="px-6 py-4 text-center">Logout</th>
                <th className="px-6 py-4 text-center">Sort</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Preview</th>
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-gray-500">
                    No items found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const IconComponent = ICON_MAP[item.icon_key] || Info;
                  return (
                    <tr key={item.id} className="hover:bg-[#1e2638] transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <IconComponent size={16} className="text-[#00A8E1]" />
                          <span className="text-gray-400 text-xs">{item.icon_key}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{item.path || '—'}</td>
                      <td className="px-6 py-4 text-center">
                        {item.is_highlight
                          ? <span className="text-[#00A8E1] font-bold">Yes</span>
                          : <span className="text-gray-600">No</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.is_logout
                          ? <span className="text-red-400 font-bold">Yes</span>
                          : <span className="text-gray-600">No</span>}
                      </td>
                      <td className="px-6 py-4 text-center">{item.sort_order}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <CustomToggle isOn={item.status} onToggle={() => toggleStatus(item)} />
                        </div>
                      </td>
                      {/* Live preview of exactly how it looks on SettingsPage */}
                      <td className="px-6 py-4 min-w-[220px]">
                        <PreviewCard item={item} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-3">
                          <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-[#3b82f6] transition-colors">
                            <Edit2 size={17} />
                          </button>
                          <button onClick={() => setDeleteId(item.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="p-4 border-t border-gray-800 mt-auto flex items-center justify-between text-sm text-gray-400 bg-[#141a29]">
          <div className="border border-[#3b82f6]/30 text-[#3b82f6] px-4 py-1.5 rounded-md font-medium text-xs bg-[#3b82f6]/10">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ── Edit / Create Modal ───────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e2638] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700/50 flex flex-col" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>

            {/* Header */}
            <div className="p-4 md:p-6 border-b border-gray-700/50 shrink-0">
              <h2 className="text-lg md:text-xl font-bold text-white tracking-wide">
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </h2>
            </div>

            {/* Body */}
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar">

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Name <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setForm({ ...formData, name: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              {/* Icon Key */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Icon <span className="text-red-500 ml-1">*</span>
                </label>
                <select
                  value={formData.icon_key}
                  onChange={(e) => setForm({ ...formData, icon_key: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all cursor-pointer"
                >
                  {ICON_OPTIONS.map((k) => (
                    <option key={k} value={k} className="bg-[#1e2638]">{k}</option>
                  ))}
                </select>
              </div>

              {/* Path */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide">
                  Path <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="/plans"
                  value={formData.path}
                  onChange={(e) => setForm({ ...formData, path: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide">Sort Order</label>
                <input
                  type="number"
                  min={1}
                  max={editingItem ? items.length : items.length + 1}
                  value={formData.sort_order}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    const max = editingItem ? items.length : items.length + 1;
                    setForm({ ...formData, sort_order: Math.min(Math.max(val, 1), max) });
                  }}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
                <p className="text-xs text-gray-500">
                  Valid range: 1 – {editingItem ? items.length : items.length + 1}
                </p>
              </div>

              {/* Toggles row */}
              <div className="md:col-span-2 flex flex-wrap gap-6 items-center">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_highlight}
                    onChange={(e) => setForm({ ...formData, is_highlight: e.target.checked })}
                    className="w-4 h-4 accent-[#00A8E1]"
                  />
                  <span className="text-sm font-semibold text-white">Highlight (blue border)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_logout}
                    onChange={(e) => setForm({ ...formData, is_logout: e.target.checked })}
                    className="w-4 h-4 accent-red-400"
                  />
                  <span className="text-sm font-semibold text-white">Logout trigger</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.status}
                    onChange={(e) => setForm({ ...formData, status: e.target.checked })}
                    className="w-4 h-4 accent-[#22c55e]"
                  />
                  <span className="text-sm font-semibold text-white">Active (visible on Settings page)</span>
                </label>
              </div>

              {/* Live preview */}
              <div className="md:col-span-2 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Live Preview</p>
                <div className="bg-bg-dark p-4 rounded-xl">
                  <PreviewCard item={formData} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 md:p-6 border-t border-gray-700/50 flex justify-end items-center space-x-4 bg-[#141a29]/50 shrink-0">
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 md:px-6 md:py-2.5 rounded-lg bg-[#334155] text-white font-medium hover:bg-[#475569] transition-colors text-sm"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="px-6 py-2 md:px-8 md:py-2.5 rounded-lg bg-[#22c55e] text-white font-bold hover:bg-[#16a34a] transition-colors shadow-lg shadow-green-500/20 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#1e2638] border border-gray-700 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete Item</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              This will remove the item from the Settings page. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#334155] text-gray-300 font-bold hover:bg-[#475569] transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-colors text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
