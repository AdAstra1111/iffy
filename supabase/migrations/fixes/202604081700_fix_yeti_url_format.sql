-- Fix YETI URL project (ad5d9bfc) to vertical-drama format
UPDATE public.projects
SET format = 'vertical-drama',
    assigned_lane = 'vertical_drama'
WHERE id = 'ad5d9bfc-30ce-42ed-af37-538f54537b0a';
