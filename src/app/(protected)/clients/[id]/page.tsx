import { ClientDetailClient } from "@/components/clients/client-detail-client";

export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientDetailClient id={id} />;
}
