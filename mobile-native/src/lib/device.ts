import DeviceInfo from 'react-native-device-info';
import {supabase} from './supabase';

let cachedId: string | null = null;

export async function getDeviceId() {
  if (cachedId) return cachedId;
  cachedId = await DeviceInfo.getUniqueId();
  return cachedId;
}

export async function registerCurrentDevice() {
  const deviceId = await getDeviceId();
  const {data: banned, error: banError} = await supabase.rpc('is_device_banned', {
    p_device_id: deviceId,
  });
  if (banError) throw banError;
  if (banned) return {banned: true};

  const {error} = await supabase.rpc('register_device', {p_device_id: deviceId});
  if (error) throw error;
  return {banned: false};
}
