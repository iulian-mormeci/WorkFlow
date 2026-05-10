import type { ClientType } from "@/lib/db/workflow-db";

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  company: "Company",
  private: "Private",
  restaurant: "Restaurant",
  shop: "Shop",
  other: "Other"
};

export function clientTypeLabel(t: ClientType | undefined): string {
  return CLIENT_TYPE_LABELS[t ?? "other"] ?? "Other";
}
