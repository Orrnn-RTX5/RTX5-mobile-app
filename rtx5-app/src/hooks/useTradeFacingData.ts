import { useEffect } from 'react';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { bootstrapApp } from '../services/bootstrapApp';
import { useUserPreferences } from '../state/userPreferences';

export function useTradeFacingData(active = true) {
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);

  useEffect(() => {
    if (!active || !isLoggedIn) {
      return;
    }

    brokerRealtimeService.connect();
    void bootstrapApp().catch((error) => {
      console.error('[TradeFacingData] Bootstrap failed', error);
    });
  }, [active, isLoggedIn]);
}
