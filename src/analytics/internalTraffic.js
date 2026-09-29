// Marks the site owner's own devices as "internal" so their testing never
// shows up as visitor traffic. A flagged browser sends nothing to the
// first-party analytics collector, and never loads GA4, GTM or the Meta Pixel.
//
// The flag is per browser (localStorage) and is set:
//   - automatically, once /admin or /analytics has been unlocked on it
//     (see AdminGate.jsx), or
//   - by opening any page with ?cb_internal=1 (and cleared with ?cb_internal=0).
const INTERNAL_KEY = 'clickbuz_internal_device';
const URL_PARAM = 'cb_internal';

export function isInternalDevice() {
    try {
        return localStorage.getItem(INTERNAL_KEY) === '1';
    } catch {
        return false;
    }
}

export function setInternalDevice(internal) {
    try {
        if (internal) localStorage.setItem(INTERNAL_KEY, '1');
        else localStorage.removeItem(INTERNAL_KEY);
    } catch {
        // storage disabled — nothing to persist.
    }
}

// Reads ?cb_internal=1 / ?cb_internal=0 from the current URL, if present.
export function applyInternalFlagFromUrl() {
    if (typeof window === 'undefined') return;
    const value = new URLSearchParams(window.location.search).get(URL_PARAM);
    if (value === '1') setInternalDevice(true);
    else if (value === '0') setInternalDevice(false);
}
