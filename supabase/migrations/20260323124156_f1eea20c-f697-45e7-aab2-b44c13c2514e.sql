CREATE POLICY "Authenticated users can upload to project-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-images');

CREATE POLICY "Authenticated users can read project-images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-images');

CREATE POLICY "Public read access for project-images"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'project-images');