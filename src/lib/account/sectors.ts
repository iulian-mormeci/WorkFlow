/**
 * Shared "who is this user" vocab: role categories + work sectors.
 * Stored as free text in `wf_profiles` (role_category, sector) so the list can
 * grow without a migration — this file is the single source of truth for the
 * option lists shown across Account, company forms, and (Fase 3) the
 * procedures sector filter.
 */

export const ROLE_CATEGORIES = [
  "technician",
  "restaurateur",
  "merchant",
  "freelancer",
  "other"
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

export const WORK_SECTORS = [
  "horeca",
  "it",
  "retail",
  "craft",
  "services",
  "other"
] as const;

export type WorkSector = (typeof WORK_SECTORS)[number];
