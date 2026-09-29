import { useState, useEffect } from 'react';
import {
  Search,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Check,
  X,
  FileText
} from 'lucide-react';
import { settingsPagesApi } from '../../services/api';

// ── Toggle ────────────────────────────────
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

const emptyForm = () => ({
  title: '',
  slug: '',
  short_description: '',
  full_content: '',
  status: true,
});

const AdminPages = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setModal] = useState(false);
  const [editingItem, setEditing] = useState(null); // null = create mode
  const [formData, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchItems = () => {
    setLoading(true);
    settingsPagesApi
      .getAll()
      .then(setItems)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = items.filter((i) =>
    i.title.toLowerCase().includes(search.toLowerCase()) || 
    i.slug.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = async (item) => {
    setItems((prev) =>
      prev.map((i) => i.id === item.id ? { ...i, status: !i.status } : i)
    );
    try {
      await settingsPagesApi.update(item.id, { status: !item.status });
    } catch {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: item.status } : i)
      );
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title,
      slug: item.slug,
      short_description: item.short_description || '',
      full_content: item.full_content || '',
      status: item.status,
    });
    setModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...formData };
      if (editingItem) {
        const updated = await settingsPagesApi.update(editingItem.id, payload);
        setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i));
      } else {
        const created = await settingsPagesApi.create(payload);
        setItems((prev) => [...prev, created]);
      }
      setModal(false);
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await settingsPagesApi.remove(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="w-full flex flex-col">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-lg md:text-xl font-bold text-white tracking-wider uppercase">
          Dynamic Pages
        </h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#3b82f6] text-white font-bold hover:bg-[#2563eb] transition-colors shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} /> Add Page
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="relative w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search pages..."
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
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Slug (URL Route)</th>
                <th className="px-6 py-4">Short Description</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#3b82f6]" size={24} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    No pages found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1e2638] transition-colors">
                    <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                      <FileText size={18} className="text-[#00A8E1]" />
                      {item.title}
                    </td>
                    <td className="px-6 py-4 text-gray-400">/page/{item.slug}</td>
                    <td className="px-6 py-4 text-gray-400 truncate max-w-[200px]">{item.short_description || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <CustomToggle isOn={item.status} onToggle={() => toggleStatus(item)} />
                      </div>
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="p-4 border-t border-gray-800 mt-auto flex items-center justify-between text-sm text-gray-400 bg-[#141a29]">
          <div className="border border-[#3b82f6]/30 text-[#3b82f6] px-4 py-1.5 rounded-md font-medium text-xs bg-[#3b82f6]/10">
            {filtered.length} page{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* ── Edit / Create Modal ───────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e2638] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700/50 flex flex-col" style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>

            {/* Header */}
            <div className="p-4 md:p-6 border-b border-gray-700/50 shrink-0">
              <h2 className="text-lg md:text-xl font-bold text-white tracking-wide">
                {editingItem ? 'Edit Page' : 'Add Page'}
              </h2>
            </div>

            {/* Body */}
            <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar">

              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Title <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setForm({ ...formData, title: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                  placeholder="e.g. Privacy Policy"
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide flex items-center">
                  Slug (URL) <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setForm({ ...formData, slug: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                  placeholder="e.g. privacy-policy"
                />
              </div>

              {/* Short Description */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide">
                  Short Description <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.short_description}
                  onChange={(e) => setForm({ ...formData, short_description: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all"
                />
              </div>

              {/* Full Content */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-white tracking-wide">
                  Full Content (Supports HTML)
                </label>
                <textarea
                  rows={10}
                  value={formData.full_content}
                  onChange={(e) => setForm({ ...formData, full_content: e.target.value })}
                  className="w-full bg-[#3b82f6]/20 border-none text-[#4aa5ff] rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#3b82f6]/50 font-medium transition-all custom-scrollbar resize-y"
                  placeholder="<h2>Privacy Policy</h2><p>Our policy is...</p>"
                ></textarea>
              </div>

              {/* Status */}
              <div className="md:col-span-2 flex items-center">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.status}
                    onChange={(e) => setForm({ ...formData, status: e.target.checked })}
                    className="w-4 h-4 accent-[#22c55e]"
                  />
                  <span className="text-sm font-semibold text-white">Active (accessible by users)</span>
                </label>
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
                disabled={saving || !formData.title || !formData.slug}
                className="px-6 py-2 md:px-8 md:py-2.5 rounded-lg bg-[#22c55e] text-white font-bold hover:bg-[#16a34a] transition-colors shadow-lg shadow-green-500/20 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Page'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#1e2638] border border-gray-700 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete Page</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              Are you sure you want to delete this page? This action cannot be undone.
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

export default AdminPages;
