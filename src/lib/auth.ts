import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getUserFromCookies(): Promise<{
  userId: string;
  email?: string;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, email: user.email };
}
