import {useEffect} from 'react';
import {openFromNotification} from '../navigation/navigationRef';
import {supabase} from '../lib/supabase';
import {useApp} from '../state/AppProvider';
import type {Database} from '../types/database';

export function IncomingCallListener() {
  const {viewer} = useApp();
  useEffect(() => {
    if (!viewer) return;
    const channel = supabase
      .channel(`native-incoming-${viewer.account.id}`)
      .on(
        'postgres_changes',
        {event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${viewer.account.id}`},
        payload => {
          const call = payload.new as Database['public']['Tables']['calls']['Row'];
          if (call.status === 'ringing') {
            openFromNotification({type: 'incoming_call', callId: call.id});
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [viewer]);
  return null;
}
