-- Add km_from_prev column to wf_intervention_stops.
-- Stores the straight-line distance from the previous stop to this one (km).
-- NULL for the first stop of a route.

ALTER TABLE wf_intervention_stops
  ADD COLUMN IF NOT EXISTS km_from_prev double precision;
