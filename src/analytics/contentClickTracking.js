// Counts clicks on content — any link to a movie page (/movie/:id) or the
// player (/player/:id), from cards, the hero banner or "Watch now" — as a
// first-party 'content_click' event. One delegated listener, so every card
// layout is covered without per-component wiring (same idea as
// autoLinkTracking.js). Purely observational: never changes navigation.
import { trackEvent } from './tracker';

const CONTENT_PATH_RE = /^\/(movie|player)\/([^/?#]+)/;
const EXCLUDED_PREFIXES = ['/admin', '/analytics'];

let installed = false;

function handleClick(event) {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    if (EXCLUDED_PREFIXES.some((prefix) => window.location.pathname.startsWith(prefix))) return;

    let path;
    try {
        const url = new URL(link.getAttribute('href'), window.location.href);
        if (url.origin !== window.location.origin) return;
        path = url.pathname;
    } catch {
        return;
    }

    const match = path.match(CONTENT_PATH_RE);
    if (!match) return;

    trackEvent('content_click', {
        target: match[1] === 'player' ? 'play' : 'detail',
        contentId: decodeURIComponent(match[2]).slice(0, 64),
        fromPage: window.location.pathname.slice(0, 200)
    }, { category: 'content' });
}

export function installContentClickTracking() {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    // Capture phase, so a click handler that stops propagation (e.g. the
    // paywall on "Watch now") can't hide the click from us.
    document.addEventListener('click', handleClick, true);
}
