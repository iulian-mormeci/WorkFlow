import { InterventionEditClient } from "@/components/interventions/intervention-edit-client";

export default async function InterventionEditPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterventionEditClient id={id} />;
}

