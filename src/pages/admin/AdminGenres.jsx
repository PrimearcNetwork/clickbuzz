import { useState, useEffect } from 'react';
import {
  Search,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Check,
  X,
  Upload
} from 'lucide-react';

const CustomToggle = ({ isOn, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-12 h-6 rounded-full relative transition-colors duration-300 flex items-center ${isOn ? 'bg-[#22c55e]' : 'bg-[#475569]'}`}
  >
    <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform duration-300 flex items-center justify-center ${isOn ? 'translate-x-6' : 'translate-x-0.5'}`}>
      {isOn
        ? <Check size={12} className="text-[#22c55e]" strokeWidth={3} />
        : <X size={12} className="text-gray-400" strokeWidth={3} />}
    </div>
  </button>
);

const emptyForm = () => ({
  name: '',
  sort_order: 1,
  status: true,
  image: null,
  imagePreview: null
});

const AdminGenres = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/master/genres`);
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = async (item) => {
    try {
      const updatedStatus = !item.status;
      await fetch(`${import.meta.env.VITE_API_URL}/api/master/genres/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: updatedStatus })
      });
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: updatedStatus } : i)
      );
    } catch (error) {
      console.error(error);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      sort_order: item.sort_order,
      status: item.status,
      image: null,
      imagePreview: item.image
    });
    setModalOpen(true);
  };

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormData({
        ...formData,
        image: file,
        imagePreview: URL.createObjectURL(file)
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        sort_order: formData.sort_order,
        status: formData.status,
        image: formData.imagePreview // using simple string for now
      };

      if (editingItem) {
        await fetch(`${import.meta.env.VITE_API_URL}/api/master/genres/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`${import.meta.env.VITE_API_URL}/api/master/genres`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      await fetchItems();
      setModalOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/master/genres/${deleteId}`, {
        method: 'DELETE'
      });
      await fetchItems();
    } catch (error) {
      console.error(error);
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="w-full flex flex-col font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-xl md:text-2xl font-normal text-white uppercase tracking-wide">
          Genre Listing
        </h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-[#4aa5ff] text-white font-medium hover:bg-[#3b82f6] transition-colors"
        >
          <Plus size={18} /> Add New
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-[#121826] rounded-xl border border-gray-800 flex flex-col overflow-hidden">
        
        {/* Controls Bar */}
        <div className="p-5 border-b border-gray-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Results :</span>
            <select className="bg-[#1a2234] border border-gray-700 text-gray-300 rounded px-3 py-1.5 outline-none focus:border-[#4aa5ff] text-sm">
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
          </div>
          
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#1a2234] border border-gray-700 text-white rounded pl-4 pr-10 py-1.5 outline-none focus:border-[#4aa5ff] text-sm w-64 placeholder-gray-500"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap min-w-[800px]">
            <thead className="bg-[#1a2235] text-gray-400 font-semibold text-xs tracking-wider border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 w-16">
                  <div className="w-4 h-4 rounded bg-[#2a3449] border border-gray-600"></div>
                </th>
                <th className="px-6 py-4">Genre Name</th>
                <th className="px-6 py-4 flex items-center gap-2">
                  Sorting
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] leading-[4px]">▲</span>
                    <span className="text-[8px] leading-[4px]">▼</span>
                  </div>
                </th>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#4aa5ff]" size={24} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    No genres found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[#1a2234] transition-colors">
                    <td className="px-6 py-5">
                      <div className="w-4 h-4 rounded bg-[#2a3449] border border-gray-600"></div>
                    </td>
                    <td className="px-6 py-5 text-gray-300">{item.name}</td>
                    <td className="px-6 py-5 text-gray-300">{item.sort_order}</td>
                    <td className="px-6 py-5">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-xs text-gray-500">No Img</div>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <CustomToggle isOn={item.status} onToggle={() => toggleStatus(item)} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex gap-4 items-center">
                        <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-white transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => setDeleteId(item.id)} className="text-pink-500 hover:text-pink-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a2234] rounded-xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-gray-700/50">
            
            <div className="p-6 border-b border-gray-700/50 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-medium text-white tracking-wide">
                {editingItem ? 'Edit Genre' : 'Add New Genre'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Genre Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#121826] border border-gray-700 text-white rounded px-4 py-2.5 outline-none focus:border-[#4aa5ff]"
                  placeholder="e.g. Comedy"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-300">Sorting Number <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="1"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full bg-[#121826] border border-gray-700 text-white rounded px-4 py-2.5 outline-none focus:border-[#4aa5ff]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-300">Genre Image <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-4">
                  <label className="flex flex-col items-center justify-center w-32 h-32 bg-[#121826] border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-[#4aa5ff] transition-colors relative overflow-hidden">
                    {formData.imagePreview ? (
                      <img src={formData.imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <Upload size={24} className="mb-2" />
                        <span className="text-xs">Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                  <p className="text-xs text-gray-500 max-w-[200px]">
                    Recommended size: 200x200px.<br/>
                    Formats: JPG, PNG, SVG.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <label className="text-sm text-gray-300">Status</label>
                <CustomToggle isOn={formData.status} onToggle={() => setFormData({ ...formData, status: !formData.status })} />
              </div>
            </div>

            <div className="p-6 border-t border-gray-700/50 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded bg-[#2a3449] text-white hover:bg-[#3a4560] transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="px-5 py-2.5 rounded bg-[#4aa5ff] text-white hover:bg-[#3b82f6] transition-colors text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Genre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#1a2234] border border-gray-700 rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-2">Delete Genre</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete this genre? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 px-4 rounded bg-[#2a3449] text-white hover:bg-[#3a4560] transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 px-4 rounded bg-pink-500 hover:bg-pink-600 text-white transition-colors text-sm"
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

export default AdminGenres;
