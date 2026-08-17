import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient as createCookieClient } from "@/lib/supabase/server";

type ApiAuthResult =
  | { authenticated: true; client: SupabaseClient<Database>; userId: string }
  | { authenticated: false; client: SupabaseClient<Database>; userId: null };

export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const token = readBearerToken(request.headers.get("authorization"));

  if (token) {
    const client = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const { data, error } = await client.auth.getUser(token);

    return error || !data.user
      ? { authenticated: false, client, userId: null }
      : { authenticated: true, client, userId: data.user.id };
  }

  const client = await createCookieClient();
  const { data, error } = await client.auth.getUser();

  return error || !data.user
    ? { authenticated: false, client, userId: null }
    : { authenticated: true, client, userId: data.user.id };
}

function readBearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
