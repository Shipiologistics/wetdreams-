import {config} from '../config';
import {supabase} from './supabase';

export async function authenticatedPost<T>(path: string, body: unknown): Promise<T> {
  const {data: sessionData} = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Please sign in again.');

  const response = await fetch(`${config.appUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as T | {error?: string} | null;

  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null;
    throw new Error(error || `Request failed (${response.status}).`);
  }
  return payload as T;
}
