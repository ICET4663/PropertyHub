-- New maintenance request statuses. Run this on its own, before 20261020000200_maintenance_workflow.sql:
-- Postgres can't use a new enum value in the same transaction that adds it.
--   disputed   the tenant says a resolved request is still a problem; it goes back to the manager
--   cancelled  withdrawn before anyone was assigned
alter type public.request_status add value if not exists 'disputed';
alter type public.request_status add value if not exists 'cancelled';
