import { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { checkAdminSession, adminLogin, includeCredentialsForApi } from '../services/adminSession';

// Password screen in front of the /admin and /analytics dashboards. It only
// decides what to render — the real protection is server-side: every admin
// write and every analytics dashboard API call is rejected without the
// session cookie the backend sets after a correct password.
const AdminGate = ({ children }) => {
  const [state, setState] = useState('checking'); // checking | locked | unlocked
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    includeCredentialsForApi();
    let cancelled = false;
    checkAdminSession()
      .then((ok) => { if (!cancelled) setState(ok ? 'unlocked' : 'locked'); })
      .catch(() => { if (!cancelled) setState('locked'); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await adminLogin(password);
      if (result.ok) {
        setState('unlocked');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  if (state === 'unlocked') return children;

  return (
    <div className="min-h-dvh bg-[#0f1420] flex items-center justify-center px-4">
      {state === 'checking' ? (
        <div data-testid="admin-gate-checking" className="flex items-center gap-2 text-gray-400">
          <Loader2 className="animate-spin" size={20} /> Checking access…
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          data-testid="admin-gate"
          className="w-full max-w-sm bg-[#1c2333] border border-gray-700/50 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-4"
        >
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-[#5a6ef7]/15 flex items-center justify-center">
              <Lock className="text-[#5a6ef7]" size={24} />
            </div>
            <h1 className="text-white text-xl font-bold">Restricted area</h1>
            <p className="text-gray-400 text-sm text-center">Enter the admin password to continue.</p>
          </div>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="admin-gate-password"
            className="w-full bg-[#141a29] border border-gray-700 text-white rounded-lg px-4 py-3 outline-none focus:border-[#5a6ef7]"
          />
          {error && <p data-testid="admin-gate-error" className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={!password || submitting}
            data-testid="admin-gate-submit"
            className="w-full py-3 rounded-lg bg-[#5a6ef7] hover:bg-[#4a5ee6] text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="animate-spin" size={18} />}
            Unlock
          </button>
        </form>
      )}
    </div>
  );
};

export default AdminGate;
