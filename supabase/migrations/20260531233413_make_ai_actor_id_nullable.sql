-- Make ai_actor_id nullable in project_ai_cast
-- Required: Cast suggestions (status=suggested) cannot have an ai_actor_id
-- because ai_actor creation requires explicit approval (constitutional rule #2).
-- The FK constraint prevents inserting without an existing ai_actor,
-- and we must not auto-create ai_actors (constitutional rule #1 vs #2 conflict).
-- Solution: allow null until approval.

ALTER TABLE public.project_ai_cast ALTER COLUMN ai_actor_id DROP NOT NULL;

-- Also remove any FK constraint that would prevent null
-- Keep the constraint for non-null values (if it exists)
