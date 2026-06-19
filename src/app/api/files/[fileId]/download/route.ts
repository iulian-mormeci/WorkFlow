import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ fileId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { fileId } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Check the user is the owner or has been shared the file.
  const { data: file, error } = await supabase
    .from("wf_shared_files")
    .select("id, owner_id, storage_path, name, mime, scan_status")
    .eq("id", fileId)
    .eq("is_folder", false)
    .maybeSingle();

  if (error || !file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (file.scan_status === "infected") {
    return NextResponse.json({ error: "file_infected" }, { status: 403 });
  }
  if (!file.storage_path) return NextResponse.json({ error: "no_storage" }, { status: 404 });

  // Generate signed URL via service role (bypasses storage RLS for shared access).
  const service = createSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: signed, error: signErr } = await service.storage
    .from("shared-files")
    .createSignedUrl(file.storage_path.replace(/^shared-files\//, ""), 60, {
      download: file.name ?? true
    });

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  // Log the download (best-effort; don't block on failure).
  void supabase.from("wf_file_audit").insert({
    file_id: fileId,
    actor_id: user.id,
    action: "download",
    detail: { name: file.name }
  });

  return NextResponse.redirect(signed.signedUrl);
}
