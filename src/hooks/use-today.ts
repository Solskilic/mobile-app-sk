import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDate } from '@/lib/plan';

export function useToday() {
  const [today, setToday] = useState(localDate(0));
  useEffect(() => {
    const refresh = () => setToday(localDate(0));
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return today;
}
