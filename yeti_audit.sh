#!/bin/bash
# YETI Audit Data Collection
SRK=$(grep SUPABASE_SERVICE_ROLE_KEY /Users/laralane/code/iffy/.env.local | head -1 | sed 's/.*="//' | sed 's/"$//')
URL=https://hdfderbphdobomkdjypc.supabase.co
PID=9404a383-5cdc-4f06-92aa-2ca70973c556

API() { curl -s "${URL}/rest/v1/$1" -H "apikey: ${SRK}" -H "Authorization: Bearer ***; }

echo "========================"
echo "PHASE 1: VISUAL GOVERNANCE"
echo "========================"

echo "--- Governance Snapshots ---"
API "project_visual_stage_governance?project_id=eq.${PID}&select=stage_id,computed_status,last_evaluated_at,eligibility_state"

echo "--- Character Visual DNA ---"
API "character_visual_dna?project_id=eq.${PID}&select=id,character_key,is_current&order=character_key"

echo "--- AI Cast ---"
API "project_ai_cast?project_id=eq.${PID}&select=character_key,ai_actor_id,character_status"

echo "--- AI Actors ---"
API "ai_actors?project_id=eq.${PID}&select=id,anchor_coverage_status,anchor_coherence_status"

echo "--- Character Wardrobe Profiles ---"
API "character_wardrobe_profiles?project_id=eq.${PID}&select=character_key,wardrobe_state&order=character_key"

echo "--- Visual Sets (PD domains) ---"
API "visual_sets?project_id=eq.${PID}&select=id,domain,status,target_name&like=domain&pattern=production_design_*&neq=status&value=archived&order=domain"

echo "--- Project Images (hero_frames) ---"
API "project_images?project_id=eq.${PID}&select=id,role,curation_state,asset_group,generation_purpose&eq=asset_group&value=hero_frame&limit=50"

echo "--- Project Images (all asset groups) ---"
API "project_images?project_id=eq.${PID}&select=asset_group&select=count:asset_group"

echo "--- Lookbook Sections ---"
API "lookbook_sections?project_id=eq.${PID}&select=id,section_status"

echo "--- Poster Candidates ---"
API "poster_candidates?project_id=eq.${PID}&select=id,status"

echo "--- Concept Brief Versions ---"
API "concept_brief_versions?project_id=eq.${PID}&select=id,version_number"

echo "--- Character Identity Packages ---"
API "character_identity_packages?project_id=eq.${PID}&select=id,character_key,is_current,enabled"

echo "--- character_wardrobe_profiles (full) ---"
API "character_wardrobe_profiles?project_id=eq.${PID}&select=character_key,wardrobe_state,actor_image_url,id,character_name"

echo "========================"
echo "PHASE 2: CANON COVERAGE"
echo "========================"

echo "--- Atoms count by type ---"
API "atoms?project_id=eq.${PID}&select=atom_type&select=count:atom_type"

echo "--- Scene Atoms ---"
API "atoms?project_id=eq.${PID}&select=id,atom_type,entity_name,generation_status&order=entity_name&limit=30"

echo "--- Project Documents ---"
API "project_documents?project_id=eq.${PID}&select=id,doc_type,title,approval_status,is_current&order=doc_type"

echo "========================"
echo "PHASE 3: CHARACTER DETAILS"
echo "========================"

echo "--- All Characters ---"
API "project_characters?project_id=eq.${PID}&select=id,name,role&order=name"

echo "--- Wardrobe Profiles (full) ---"
API "character_wardrobe_profiles?project_id=eq.${PID}&select=*"

echo "--- Cast Bindings ---"
API "project_ai_cast?project_id=eq.${PID}&select=*"

echo "========================"
echo "PHASE 4: LOCATIONS"
echo "========================"

echo "--- PD Canon counts ---"
echo "pd_world_rules:"
API "pd_world_rules?project_id=eq.${PID}&select=id&select=count:id"
echo "pd_design_templates:"
API "pd_design_templates?project_id=eq.${PID}&select=id&select=count:id"
echo "pd_location_design:"
API "pd_location_design?project_id=eq.${PID}&select=id&select=count:id"
echo "pd_creature_design:"
API "pd_creature_design?project_id=eq.${PID}&select=id&select=count:id"
echo "pd_location_props:"
API "pd_location_props?project_id=eq.${PID}&select=id&select=count:id"

echo "--- Visual Sets all ---"
API "visual_sets?project_id=eq.${PID}&select=id,domain,status,target_name&order=target_name"

echo "========================"
echo "PHASE 9-12: HERO FRAMES"
echo "========================"

echo "--- All project_images ---"
API "project_images?project_id=eq.${PID}&select=id,role,asset_group,generation_purpose,curation_state,subject_type,subject,is_active,is_primary&order=asset_group&limit=100"

echo "--- project_images count by asset_group ---"
API "project_images?project_id=eq.${PID}&select=asset_group&select=count:asset_group"

echo "--- Visual Sets (hero_frame domain if any) ---"
API "visual_sets?project_id=eq.${PID}&select=id,domain,status&like=domain&pattern=hero_frame*"

echo "--- Locations from canon ---"
API "project_canon?project_id=eq.${PID}&select=canon_json"

echo "--- character_atoms or atoms for characters ---"
API "atoms?project_id=eq.${PID}&atom_type=eq.character&select=id,entity_name,generation_status"
