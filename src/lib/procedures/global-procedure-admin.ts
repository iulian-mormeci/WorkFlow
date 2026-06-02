/** Whether the signed-in user may create/edit global preset procedures in Supabase. */
export function isGlobalProcedureAdmin(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null): boolean {
  if (!user) return false;
  const role = user.user_metadata?.role;
  if (role === "admin" || role === "owner") return true;
  const ownerEmail = process.env.NEXT_PUBLIC_WORKFLOW_OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && user.email?.trim().toLowerCase() === ownerEmail) return true;
  return false;
}
