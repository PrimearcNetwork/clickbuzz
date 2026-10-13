import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Loader2, ImageIcon, Monitor, Smartphone } from 'lucide-react';
import { siteSettingsApi } from '../../services/api';

// Admin card (rendered on the Plans page) for the banner at the top of the
// Explore Plans page. Two separate images so each device gets a properly
// framed one: the desktop image is used on screens >= 768px, the mobile image
// below that. If only one is uploaded, it's used on every device; with none,
// the page shows its built-in default banner (src/assets/explore-plans-banner.png).
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 10; // matches MAX_UPLOAD_MB_BANNER on the backend

const SLOTS = [
  {
    key: 'explore_plans_bg_desktop',
    label: 'Desktop / Tablet',
    hint: 'Wide banner, at least 1024 px wide. Shown full width, never cropped.',
    Icon: Monitor,
  },
  {
    key: 'explore_plans_bg_mobile',
    label: 'Mobile',
    hint: 'Banner for phones, at least 720 px wide. Shown full width, never cropped.',
    Icon: Smartphone,
  },
];

const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append('banner', file);
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`, { method: 'POST', body: formData });
  if (res.status === 413) {
    throw new Error('Image is too large for the server upload limit. Try a smaller file.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.files?.banner) {
    throw new Error(data.message || `Upload failed (HTTP ${res.status})`);
  }
  return data.files.banner;
};

const BackgroundSlot = ({ slot, url, busy, onUpload, onRemove }) => {
  const inputRef = useRef(null);
  const { Icon } = slot;

  return (
    <div className="flex-1 min-w-0 bg-[#1e2638] rounded-xl border border-gray-700/50 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-[#4aa5ff]" />
        <span className="text-white font-semibold text-sm">{slot.label}</span>
      </div>
      <p className="text-xs text-gray-400">{slot.hint}</p>

      <div className="w-full h-44 rounded-lg overflow-hidden bg-black border border-gray-700 flex items-center justify-center">
        {busy ? (
          <Loader2 className="animate-spin text-[#3b82f6]" size={24} />
        ) : url ? (
          <img src={url} alt={`${slot.label} background`} className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-500 text-xs text-center px-2">
            <ImageIcon size={22} />
            Not set
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onUpload(slot.key, file);
        }}
      />

      <div className="flex gap-2 mt-auto">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          <Upload size={14} /> {url ? 'Replace' : 'Upload'}
        </button>
        {url && (
          <button
            onClick={() => onRemove(slot.key)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#334155] hover:bg-[#475569] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
};

const ExplorePlansBackground = () => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  useEffect(() => {
    siteSettingsApi
      .getAll()
      .then(setSettings)
      .catch((err) => {
        console.error('Site settings fetch failed:', err);
        setMessage({ type: 'error', text: 'Could not load the current background images.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (key, file) => {
    setMessage(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setMessage({ type: 'error', text: 'Please choose a JPG, PNG or WEBP image.' });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setMessage({ type: 'error', text: `Image must be ${MAX_SIZE_MB} MB or smaller.` });
      return;
    }
    setBusyKey(key);
    try {
      const url = await uploadImage(file);
      const updated = await siteSettingsApi.update({ [key]: url });
      setSettings(updated);
      setMessage({ type: 'success', text: 'Background saved. It now shows on the Explore Plans page.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Upload failed.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemove = async (key) => {
    if (!window.confirm('Remove this background image?')) return;
    setMessage(null);
    setBusyKey(key);
    try {
      const updated = await siteSettingsApi.update({ [key]: null });
      setSettings(updated);
      setMessage({ type: 'success', text: 'Background removed.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Remove failed.' });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="mt-6 bg-[#141a29] rounded-xl border border-gray-800 shadow-2xl p-4 md:p-6">
      <h2 className="text-white font-bold text-lg tracking-wide">Explore Plans Banner</h2>
      <p className="text-gray-400 text-sm mt-1 mb-4">
        Shown at the top of the Explore Plans page, on a black background (a transparent PNG blends best). Upload
        separate images for desktop and mobile if you like — if only one is set, it&apos;s used on every device, and
        with none the built-in default banner is shown. JPG, PNG or WEBP, up to {MAX_SIZE_MB} MB.
      </p>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="animate-spin text-[#3b82f6]" size={24} />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          {SLOTS.map((slot) => (
            <BackgroundSlot
              key={slot.key}
              slot={slot}
              url={settings[slot.key]}
              busy={busyKey === slot.key}
              onUpload={handleUpload}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {message && (
        <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-400' : 'text-[#22c55e]'}`}>{message.text}</p>
      )}
    </div>
  );
};

export default ExplorePlansBackground;
