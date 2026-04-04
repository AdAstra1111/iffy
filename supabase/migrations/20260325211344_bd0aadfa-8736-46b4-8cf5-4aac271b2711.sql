INSERT INTO scene_index (project_id, scene_number, title, source_doc_type, source_ref, location_key, character_keys, wardrobe_state_map)
VALUES
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 1, 'Opening Image: Clay and Chains', 'beat_sheet', '{"beat": 1}'::jsonb, 'hana_s_workshop', ARRAY['Hana'], '{"Hana": "work"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 2, 'Catalyst: The Betrothal Scroll', 'beat_sheet', '{"beat": 2}'::jsonb, 'hana_s_village', ARRAY['Hana', 'Kenji'], '{"Hana": "daily", "Kenji": "travel"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 3, 'A Stolen Farewell', 'beat_sheet', '{"beat": 3}'::jsonb, 'cherry_blossom_grove', ARRAY['Hana', 'Kenji'], '{"Hana": "daily", "Kenji": "daily"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 4, 'The Village Plea', 'beat_sheet', '{"beat": 4}'::jsonb, 'village_shrine', ARRAY['Hana'], '{"Hana": "daily"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 5, 'Journey to the Lions Den', 'beat_sheet', '{"beat": 5}'::jsonb, 'village_path', ARRAY['Hana'], '{"Hana": "formal"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 6, 'Lady Akemis Welcome', 'beat_sheet', '{"beat": 6}'::jsonb, 'kageyama_estate', ARRAY['Hana', 'Lady Akemi'], '{"Hana": "formal", "Lady Akemi": "formal"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 7, 'The Banquet', 'beat_sheet', '{"beat": 7}'::jsonb, 'kageyama_estate_banquet_hall', ARRAY['Hana', 'Lord Kageyama', 'Lady Akemi'], '{"Hana": "formal", "Lord Kageyama": "formal", "Lady Akemi": "formal"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 8, 'Kageyamas Study', 'beat_sheet', '{"beat": 8}'::jsonb, 'kageyama_s_study', ARRAY['Lord Kageyama', 'Hana'], '{"Lord Kageyama": "formal", "Hana": "formal"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 9, 'Hanas Chambers at Night', 'beat_sheet', '{"beat": 9}'::jsonb, 'kageyama_castle_hana_s_chambers', ARRAY['Hana'], '{"Hana": "intimate"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 10, 'The Castle Garden', 'beat_sheet', '{"beat": 10}'::jsonb, 'kageyama_castle_garden', ARRAY['Hana', 'Lady Akemi'], '{"Hana": "daily", "Lady Akemi": "daily"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 11, 'Deep Woods Encounter', 'beat_sheet', '{"beat": 11}'::jsonb, 'deep_woods', ARRAY['Hana', 'Kenji'], '{"Hana": "travel", "Kenji": "combat"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 12, 'Confrontation at the Shrine', 'beat_sheet', '{"beat": 12}'::jsonb, 'shrine_ruins', ARRAY['Hana', 'Lord Kageyama'], '{"Hana": "distressed", "Lord Kageyama": "combat"}'::jsonb),
  ('e4e47de6-0cae-4d16-b713-71cce3b7335a', 13, 'The Hidden Chamber', 'beat_sheet', '{"beat": 13}'::jsonb, 'hidden_chamber', ARRAY['Hana'], '{"Hana": "distressed"}'::jsonb)
ON CONFLICT DO NOTHING;