
-- Add validation and approval columns to scene_demo_images
ALTER TABLE public.scene_demo_images
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_payload jsonb DEFAULT NULL;

-- Add constraint for approval_status values
ALTER TABLE public.scene_demo_images
  DROP CONSTRAINT IF EXISTS scene_demo_images_approval_status_check;
ALTER TABLE public.scene_demo_images
  ADD CONSTRAINT scene_demo_images_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected', 'redo_requested'));
