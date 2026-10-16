import { useEffect, useState } from 'react';

// Same breakpoint as Tailwind `md` and the banner <picture> sources.
const MOBILE_QUERY = '(max-width: 767px)';

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
};
