import { useState, useEffect } from 'react';
import {
  Search,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Check,
  X
} from 'lucide-react';
import AdminMovieForm from './AdminMovieForm';
import { moviesApi } from '../../services/api';

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

const AdminMovies = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editingMovie, setEditingMovie] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [editLoadingId, setEditLoadingId] = useState(null);

  // The table row only has the slim list fields (no description/cast — see
  // movie.controller.js LIST_ATTRIBUTES), so fetch the full record before
  // opening the edit form, otherwise the form would silently show a blank
  // description/cast for an existing movie.
  const handleEditClick = async (movie) => {
    setEditLoadingId(movie.id);
    try {
      const fullMovie = await moviesApi.getOne(movie.id);
      setEditingMovie(fullMovie);
      setShowForm(true);
    } catch (err) {
      console.error(err);
    } finally {
      setEditLoadingId(null);
    }
  };

  // Local state for mock toggles since they aren't in the DB yet
  const [localStatus, setLocalStatus] = useState({});

  const fetchMovies = () => {
    setLoading(true);
    // Admin's movie table is still a flat searchable list (no pagination UI,
    // matching the existing admin UX) — request a high limit against the now
    // paginated endpoint rather than adding pagination controls here.
    moviesApi.getAll({ limit: 500 })
      .then(response => {
        setMovies(response.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  const handleDeleteConfirm = () => {
    const token = localStorage.getItem('token') || 'dev-token';
    fetch(`${import.meta.env.VITE_API_URL}/api/movies/${deleteId}`, { 
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(() => {
        setDeleteId(null);
        fetchMovies();
      });
  };

  const filtered = movies.filter((m) =>
    m.title?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = (id) => {
    setLocalStatus(prev => ({
      ...prev,
      [id]: prev[id] !== undefined ? !prev[id] : false // toggle from true (default) to false
    }));
  };

  if (showForm) {
    return (
      <div className="w-full flex flex-col font-sans">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl md:text-2xl font-normal text-white uppercase tracking-wide">
            {editingMovie ? 'Edit Show' : 'Add New Show'}
          </h2>
        </div>
        <AdminMovieForm
          movie={editingMovie}
          onClose={() => { setShowForm(false); setEditingMovie(null); fetchMovies(); }}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-xl md:text-2xl font-normal text-white uppercase tracking-wide">
          Shows Listing
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded bg-[#5a6ef7] text-white font-medium hover:bg-[#4f61de] transition-colors"
        >
          <Plus size={18} /> Add New Show
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
              placeholder="Search shows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#1a2234] border border-gray-700 text-white rounded pl-4 pr-10 py-1.5 outline-none focus:border-[#4aa5ff] text-sm w-64 placeholder-gray-500"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-gray-300 whitespace-nowrap min-w-[1200px]">
            <thead className="bg-[#1a2235] text-gray-400 font-semibold text-xs tracking-wider border-b border-gray-800">
              <tr>
                <th className="px-6 py-4">Show Name</th>
                <th className="px-6 py-4">Horizontal Image</th>
                <th className="px-6 py-4">Vertical Image</th>
                <th className="px-6 py-4">Trailer</th>
                <th className="px-6 py-4 flex items-center gap-2">
                  Sorting
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] leading-[4px]">▲</span>
                    <span className="text-[8px] leading-[4px]">▼</span>
                  </div>
                </th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Genre</th>
                <th className="px-6 py-4">Language</th>
                <th className="px-6 py-4">Age Certificate</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#4aa5ff]" size={24} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-gray-500">
                    No shows found.
                  </td>
                </tr>
              ) : (
                filtered.map((movie, index) => {
                  const isActive = localStatus[movie.id] !== undefined ? localStatus[movie.id] : true;
                  const genres = Array.isArray(movie.genres) ? movie.genres.join(', ') : movie.genres;
                  return (
                    <tr key={movie.id} className="hover:bg-[#1a2234] transition-colors">
                      <td className="px-6 py-4 text-gray-300 font-medium">{movie.title}</td>
                      <td className="px-6 py-4">
                        {movie.backdropUrl ? (
                          <img src={movie.backdropUrl} alt="Horizontal" className="h-10 w-16 object-cover rounded shadow-md border border-gray-700" />
                        ) : (
                          <div className="h-10 w-16 bg-gray-800 rounded flex items-center justify-center text-[10px] text-gray-500">No Img</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {movie.posterUrl ? (
                          <img src={movie.posterUrl} alt="Vertical" className="h-14 w-10 object-cover rounded shadow-md border border-gray-700" />
                        ) : (
                          <div className="h-14 w-10 bg-gray-800 rounded flex items-center justify-center text-[10px] text-gray-500 text-center">No Img</div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-[13px] text-white">
                        <a href={movie.videoUrl || '#'} target="_blank" rel="noreferrer" className="hover:text-[#4aa5ff] transition-colors">View Trailer</a>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{index + 1}</td>
                      <td className="px-6 py-4">
                        <CustomToggle isOn={isActive} onToggle={() => toggleStatus(movie.id)} />
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm max-w-[150px] truncate" title={genres}>{genres || '—'}</td>
                      <td className="px-6 py-4 text-gray-400 text-sm">{movie.language || 'Hindi'}</td>
                      <td className="px-6 py-4 text-gray-400 text-sm">{movie.ageRating || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-4 items-center">
                          <button onClick={() => handleEditClick(movie)} disabled={editLoadingId === movie.id} className="text-gray-400 hover:text-white transition-colors disabled:opacity-50">
                            {editLoadingId === movie.id ? <Loader2 size={16} className="animate-spin" /> : <Edit2 size={16} />}
                          </button>
                          <button onClick={() => setDeleteId(movie.id)} className="text-pink-500 hover:text-pink-400 transition-colors">
                            <Trash2 size={16} />
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

        {/* Pagination Footer */}
        <div className="p-4 border-t border-gray-800/50 mt-auto flex items-center justify-between text-sm text-gray-400 bg-[#121826]">
          <div className="border border-gray-700 text-gray-400 px-4 py-1.5 rounded-md font-medium text-xs bg-[#1a2234]">
            Showing page 1 of {Math.max(1, Math.ceil(filtered.length / 10))}
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1 text-gray-500 hover:text-white transition-colors">←</button>
            <button className="w-8 h-8 rounded-md bg-[#4aa5ff] text-white font-medium flex items-center justify-center shadow-md shadow-blue-500/20">1</button>
            <button className="p-1 text-gray-500 hover:text-white transition-colors">→</button>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#1a2234] border border-gray-700 rounded-xl p-6 shadow-2xl">
            <h3 className="text-lg font-medium text-white mb-2">Delete Show</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete this show? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 px-4 rounded bg-[#2a3449] text-white hover:bg-[#3a4560] transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
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

export default AdminMovies;
