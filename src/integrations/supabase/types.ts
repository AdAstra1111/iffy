export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actor_promotion_decisions: {
        Row: {
          actor_id: string
          actor_version_id: string
          block_reasons: string[] | null
          created_at: string
          decided_by: string | null
          decision_mode: string
          decision_note: string | null
          eligible_for_promotion: boolean
          final_decision_status: string
          id: string
          override_reason: string | null
          policy_decision_status: string
          policy_version: string
          review_required: boolean
          scoring_model: string
        }
        Insert: {
          actor_id: string
          actor_version_id: string
          block_reasons?: string[] | null
          created_at?: string
          decided_by?: string | null
          decision_mode?: string
          decision_note?: string | null
          eligible_for_promotion?: boolean
          final_decision_status?: string
          id?: string
          override_reason?: string | null
          policy_decision_status?: string
          policy_version?: string
          review_required?: boolean
          scoring_model?: string
        }
        Update: {
          actor_id?: string
          actor_version_id?: string
          block_reasons?: string[] | null
          created_at?: string
          decided_by?: string | null
          decision_mode?: string
          decision_note?: string | null
          eligible_for_promotion?: boolean
          final_decision_status?: string
          id?: string
          override_reason?: string | null
          policy_decision_status?: string
          policy_version?: string
          review_required?: boolean
          scoring_model?: string
        }
        Relationships: [
          {
            foreignKeyName: "actor_promotion_decisions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "ai_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actor_promotion_decisions_actor_version_id_fkey"
            columns: ["actor_version_id"]
            isOneToOne: false
            referencedRelation: "ai_actor_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_actor_assets: {
        Row: {
          actor_version_id: string
          asset_type: string
          created_at: string
          id: string
          meta_json: Json
          public_url: string
          storage_path: string
        }
        Insert: {
          actor_version_id: string
          asset_type?: string
          created_at?: string
          id?: string
          meta_json?: Json
          public_url?: string
          storage_path?: string
        }
        Update: {
          actor_version_id?: string
          asset_type?: string
          created_at?: string
          id?: string
          meta_json?: Json
          public_url?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actor_assets_actor_version_id_fkey"
            columns: ["actor_version_id"]
            isOneToOne: false
            referencedRelation: "ai_actor_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_actor_versions: {
        Row: {
          actor_id: string
          created_at: string
          created_by: string | null
          id: string
          is_approved: boolean
          recipe_json: Json
          version_number: number
        }
        Insert: {
          actor_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_approved?: boolean
          recipe_json?: Json
          version_number?: number
        }
        Update: {
          actor_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_approved?: boolean
          recipe_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_actor_versions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "ai_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_actors: {
        Row: {
          anchor_coherence_status: string
          anchor_coverage_status: string
          approved_version_id: string | null
          created_at: string
          current_promotion_decision_id: string | null
          description: string
          id: string
          name: string
          negative_prompt: string
          promotion_policy_version: string | null
          promotion_status: string | null
          promotion_updated_at: string | null
          roster_ready: boolean
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          anchor_coherence_status?: string
          anchor_coverage_status?: string
          approved_version_id?: string | null
          created_at?: string
          current_promotion_decision_id?: string | null
          description?: string
          id?: string
          name?: string
          negative_prompt?: string
          promotion_policy_version?: string | null
          promotion_status?: string | null
          promotion_updated_at?: string | null
          roster_ready?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          anchor_coherence_status?: string
          anchor_coverage_status?: string
          approved_version_id?: string | null
          created_at?: string
          current_promotion_decision_id?: string | null
          description?: string
          id?: string
          name?: string
          negative_prompt?: string
          promotion_policy_version?: string | null
          promotion_status?: string | null
          promotion_updated_at?: string | null
          roster_ready?: boolean
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_actors_approved_version_id_fkey"
            columns: ["approved_version_id"]
            isOneToOne: false
            referencedRelation: "ai_actor_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generated_media: {
        Row: {
          created_at: string
          created_by: string | null
          generation_params: Json
          id: string
          media_type: string
          project_id: string
          selected: boolean
          shot_id: string | null
          storage_path: string
          trailer_shotlist_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          generation_params?: Json
          id?: string
          media_type: string
          project_id: string
          selected?: boolean
          shot_id?: string | null
          storage_path: string
          trailer_shotlist_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          generation_params?: Json
          id?: string
          media_type?: string
          project_id?: string
          selected?: boolean
          shot_id?: string | null
          storage_path?: string
          trailer_shotlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_media_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "scene_shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_media_trailer_shotlist_id_fkey"
            columns: ["trailer_shotlist_id"]
            isOneToOne: false
            referencedRelation: "trailer_shotlists"
            referencedColumns: ["id"]
          },
        ]
      }
      animatic_events: {
        Row: {
          animatic_run_id: string
          created_at: string
          created_by: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          animatic_run_id: string
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          animatic_run_id?: string
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "animatic_events_animatic_run_id_fkey"
            columns: ["animatic_run_id"]
            isOneToOne: false
            referencedRelation: "animatic_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      animatic_markers: {
        Row: {
          animatic_id: string
          created_at: string | null
          created_by: string
          id: string
          marker_type: string
          text: string
          time_seconds: number
        }
        Insert: {
          animatic_id: string
          created_at?: string | null
          created_by: string
          id?: string
          marker_type?: string
          text?: string
          time_seconds?: number
        }
        Update: {
          animatic_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          marker_type?: string
          text?: string
          time_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "animatic_markers_animatic_id_fkey"
            columns: ["animatic_id"]
            isOneToOne: false
            referencedRelation: "animatics"
            referencedColumns: ["id"]
          },
        ]
      }
      animatic_panels: {
        Row: {
          animatic_id: string
          created_at: string | null
          duration_seconds: number
          id: string
          locked: boolean | null
          order_index: number
          scene_number: string
          shot_number: number
          storyboard_board_id: string
          transition: string | null
          updated_at: string | null
        }
        Insert: {
          animatic_id: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          locked?: boolean | null
          order_index?: number
          scene_number?: string
          shot_number?: number
          storyboard_board_id: string
          transition?: string | null
          updated_at?: string | null
        }
        Update: {
          animatic_id?: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          locked?: boolean | null
          order_index?: number
          scene_number?: string
          shot_number?: number
          storyboard_board_id?: string
          transition?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animatic_panels_animatic_id_fkey"
            columns: ["animatic_id"]
            isOneToOne: false
            referencedRelation: "animatics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animatic_panels_storyboard_board_id_fkey"
            columns: ["storyboard_board_id"]
            isOneToOne: false
            referencedRelation: "storyboard_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      animatic_runs: {
        Row: {
          created_at: string
          created_by: string
          error: string | null
          id: string
          options: Json
          ordering: Json
          project_id: string
          public_url: string | null
          status: string
          storage_path: string | null
          storyboard_run_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          options?: Json
          ordering?: Json
          project_id: string
          public_url?: string | null
          status?: string
          storage_path?: string | null
          storyboard_run_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          options?: Json
          ordering?: Json
          project_id?: string
          public_url?: string | null
          status?: string
          storage_path?: string | null
          storyboard_run_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      animatics: {
        Row: {
          aspect_ratio: string | null
          created_at: string | null
          created_by: string
          episode_number: number | null
          fps: number | null
          id: string
          project_id: string
          render_asset_path: string | null
          scope: Json | null
          shot_list_id: string
          status: string | null
          timing_asset_path: string | null
          updated_at: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string | null
          created_by: string
          episode_number?: number | null
          fps?: number | null
          id?: string
          project_id: string
          render_asset_path?: string | null
          scope?: Json | null
          shot_list_id: string
          status?: string | null
          timing_asset_path?: string | null
          updated_at?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string | null
          created_by?: string
          episode_number?: number | null
          fps?: number | null
          id?: string
          project_id?: string
          render_asset_path?: string | null
          scope?: Json | null
          shot_list_id?: string
          status?: string | null
          timing_asset_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animatics_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_sources: {
        Row: {
          added_by: string
          created_at: string
          format: string
          id: string
          license_reference: string
          rights_status: string
          source_url: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          added_by?: string
          created_at?: string
          format?: string
          id?: string
          license_reference?: string
          rights_status?: string
          source_url?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          format?: string
          id?: string
          license_reference?: string
          rights_status?: string
          source_url?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      archive_assets: {
        Row: {
          asset_type: string | null
          clearance_notes: string | null
          cost_estimate: number | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          priority: string | null
          project_id: string
          rights_status: string | null
          source: string | null
          user_id: string
        }
        Insert: {
          asset_type?: string | null
          clearance_notes?: string | null
          cost_estimate?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          priority?: string | null
          project_id: string
          rights_status?: string | null
          source?: string | null
          user_id: string
        }
        Update: {
          asset_type?: string | null
          clearance_notes?: string | null
          cost_estimate?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          priority?: string | null
          project_id?: string
          rights_status?: string | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      atoms: {
        Row: {
          atom_type: string
          attributes: Json
          canonical_name: string
          confidence: number | null
          created_at: string
          curated_at: string | null
          do_not_resolve: boolean | null
          entity_id: string | null
          generated_image_ref: string | null
          generation_status: string | null
          id: string
          narrative_role: string | null
          origin_doc_id: string | null
          priority: number | null
          project_id: string
          readiness_state: string | null
          scene_id: string | null
          updated_at: string
        }
        Insert: {
          atom_type: string
          attributes?: Json
          canonical_name: string
          confidence?: number | null
          created_at?: string
          curated_at?: string | null
          do_not_resolve?: boolean | null
          entity_id?: string | null
          generated_image_ref?: string | null
          generation_status?: string | null
          id?: string
          narrative_role?: string | null
          origin_doc_id?: string | null
          priority?: number | null
          project_id: string
          readiness_state?: string | null
          scene_id?: string | null
          updated_at?: string
        }
        Update: {
          atom_type?: string
          attributes?: Json
          canonical_name?: string
          confidence?: number | null
          created_at?: string
          curated_at?: string | null
          do_not_resolve?: boolean | null
          entity_id?: string | null
          generated_image_ref?: string | null
          generation_status?: string | null
          id?: string
          narrative_role?: string | null
          origin_doc_id?: string | null
          priority?: number | null
          project_id?: string
          readiness_state?: string | null
          scene_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atoms_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atoms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "atoms_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_jobs: {
        Row: {
          created_at: string
          id: string
          message: string | null
          options: Json
          output_url: string | null
          owner_id: string
          progress_pct: number
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          options?: Json
          output_url?: string | null
          owner_id: string
          progress_pct?: number
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          options?: Json
          output_url?: string | null
          owner_id?: string
          progress_pct?: number
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "audio_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_run_jobs: {
        Row: {
          allow_defaults: boolean
          approval_payload: Json | null
          approval_required_for_doc_type: string | null
          approval_type: string | null
          awaiting_approval: boolean
          best_blocker_count: number | null
          best_blocker_score: number | null
          best_ci: number | null
          best_document_id: string | null
          best_gp: number | null
          best_score: number | null
          best_version_id: string | null
          converge_target_json: Json
          created_at: string | null
          current_document: string
          current_stage_index: number | null
          error: string | null
          follow_latest: boolean
          frontier_attempts: number
          frontier_ci: number | null
          frontier_gp: number | null
          frontier_version_id: string | null
          id: string
          is_processing: boolean
          last_analyzed_version_id: string | null
          last_blocker_count: number | null
          last_ci: number | null
          last_confidence: number | null
          last_error: string | null
          last_gap: number | null
          last_gp: number | null
          last_heartbeat_at: string | null
          last_readiness: number | null
          last_risk_flags: Json | null
          last_step_at: string | null
          last_ui_message: string | null
          lock_expires_at: string | null
          max_stage_loops: number
          max_total_steps: number
          max_versions_per_doc_per_job: number | null
          mode: string
          pause_reason: string | null
          pending_decisions: Json | null
          pending_doc_id: string | null
          pending_doc_type: string | null
          pending_next_doc_type: string | null
          pending_version_id: string | null
          pinned_inputs: Json | null
          pipeline_key: string | null
          processing_started_at: string | null
          project_id: string
          resume_document_id: string | null
          resume_version_id: string | null
          stage_exhaustion_default: number
          stage_exhaustion_remaining: number
          stage_history: Json | null
          stage_loop_count: number
          stagnation_no_blocker_count: number | null
          start_document: string
          status: string
          step_count: number
          stop_reason: string | null
          target_document: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_defaults?: boolean
          approval_payload?: Json | null
          approval_required_for_doc_type?: string | null
          approval_type?: string | null
          awaiting_approval?: boolean
          best_blocker_count?: number | null
          best_blocker_score?: number | null
          best_ci?: number | null
          best_document_id?: string | null
          best_gp?: number | null
          best_score?: number | null
          best_version_id?: string | null
          converge_target_json?: Json
          created_at?: string | null
          current_document: string
          current_stage_index?: number | null
          error?: string | null
          follow_latest?: boolean
          frontier_attempts?: number
          frontier_ci?: number | null
          frontier_gp?: number | null
          frontier_version_id?: string | null
          id?: string
          is_processing?: boolean
          last_analyzed_version_id?: string | null
          last_blocker_count?: number | null
          last_ci?: number | null
          last_confidence?: number | null
          last_error?: string | null
          last_gap?: number | null
          last_gp?: number | null
          last_heartbeat_at?: string | null
          last_readiness?: number | null
          last_risk_flags?: Json | null
          last_step_at?: string | null
          last_ui_message?: string | null
          lock_expires_at?: string | null
          max_stage_loops?: number
          max_total_steps?: number
          max_versions_per_doc_per_job?: number | null
          mode?: string
          pause_reason?: string | null
          pending_decisions?: Json | null
          pending_doc_id?: string | null
          pending_doc_type?: string | null
          pending_next_doc_type?: string | null
          pending_version_id?: string | null
          pinned_inputs?: Json | null
          pipeline_key?: string | null
          processing_started_at?: string | null
          project_id: string
          resume_document_id?: string | null
          resume_version_id?: string | null
          stage_exhaustion_default?: number
          stage_exhaustion_remaining?: number
          stage_history?: Json | null
          stage_loop_count?: number
          stagnation_no_blocker_count?: number | null
          start_document: string
          status?: string
          step_count?: number
          stop_reason?: string | null
          target_document?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_defaults?: boolean
          approval_payload?: Json | null
          approval_required_for_doc_type?: string | null
          approval_type?: string | null
          awaiting_approval?: boolean
          best_blocker_count?: number | null
          best_blocker_score?: number | null
          best_ci?: number | null
          best_document_id?: string | null
          best_gp?: number | null
          best_score?: number | null
          best_version_id?: string | null
          converge_target_json?: Json
          created_at?: string | null
          current_document?: string
          current_stage_index?: number | null
          error?: string | null
          follow_latest?: boolean
          frontier_attempts?: number
          frontier_ci?: number | null
          frontier_gp?: number | null
          frontier_version_id?: string | null
          id?: string
          is_processing?: boolean
          last_analyzed_version_id?: string | null
          last_blocker_count?: number | null
          last_ci?: number | null
          last_confidence?: number | null
          last_error?: string | null
          last_gap?: number | null
          last_gp?: number | null
          last_heartbeat_at?: string | null
          last_readiness?: number | null
          last_risk_flags?: Json | null
          last_step_at?: string | null
          last_ui_message?: string | null
          lock_expires_at?: string | null
          max_stage_loops?: number
          max_total_steps?: number
          max_versions_per_doc_per_job?: number | null
          mode?: string
          pause_reason?: string | null
          pending_decisions?: Json | null
          pending_doc_id?: string | null
          pending_doc_type?: string | null
          pending_next_doc_type?: string | null
          pending_version_id?: string | null
          pinned_inputs?: Json | null
          pipeline_key?: string | null
          processing_started_at?: string | null
          project_id?: string
          resume_document_id?: string | null
          resume_version_id?: string | null
          stage_exhaustion_default?: number
          stage_exhaustion_remaining?: number
          stage_history?: Json | null
          stage_loop_count?: number
          stagnation_no_blocker_count?: number | null
          start_document?: string
          status?: string
          step_count?: number
          stop_reason?: string | null
          target_document?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auto_run_steps: {
        Row: {
          action: string
          ci: number | null
          confidence: number | null
          created_at: string | null
          document: string
          gap: number | null
          gp: number | null
          id: string
          job_id: string
          output_ref: Json | null
          output_text: string | null
          readiness: number | null
          risk_flags: Json | null
          step_index: number
          step_resolver_hash: string | null
          summary: string | null
        }
        Insert: {
          action: string
          ci?: number | null
          confidence?: number | null
          created_at?: string | null
          document: string
          gap?: number | null
          gp?: number | null
          id?: string
          job_id: string
          output_ref?: Json | null
          output_text?: string | null
          readiness?: number | null
          risk_flags?: Json | null
          step_index: number
          step_resolver_hash?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          ci?: number | null
          confidence?: number | null
          created_at?: string | null
          document?: string
          gap?: number | null
          gp?: number | null
          id?: string
          job_id?: string
          output_ref?: Json | null
          output_text?: string | null
          readiness?: number | null
          risk_flags?: Json | null
          step_index?: number
          step_resolver_hash?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_run_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "auto_run_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcaster_fit_scores: {
        Row: {
          broadcaster_name: string
          budget_match: number | null
          created_at: string
          fit_score: number | null
          genre_match: number | null
          id: string
          last_assessed_at: string | null
          notes: string | null
          project_id: string
          slot_fit: string | null
          territory: string | null
          tone_match: number | null
          user_id: string
        }
        Insert: {
          broadcaster_name?: string
          budget_match?: number | null
          created_at?: string
          fit_score?: number | null
          genre_match?: number | null
          id?: string
          last_assessed_at?: string | null
          notes?: string | null
          project_id: string
          slot_fit?: string | null
          territory?: string | null
          tone_match?: number | null
          user_id: string
        }
        Update: {
          broadcaster_name?: string
          budget_match?: number | null
          created_at?: string
          fit_score?: number | null
          genre_match?: number | null
          id?: string
          last_assessed_at?: string | null
          notes?: string | null
          project_id?: string
          slot_fit?: string | null
          territory?: string | null
          tone_match?: number | null
          user_id?: string
        }
        Relationships: []
      }
      budget_assumptions: {
        Row: {
          budget_band: string | null
          cast_level: string | null
          created_at: string
          currency: string | null
          estimated_total: number | null
          id: string
          location_count: number | null
          notes: string | null
          project_id: string
          schedule_weeks: number | null
          shoot_days: number | null
          union_level: string | null
          updated_at: string
          user_id: string
          version: number | null
          vfx_level: string | null
        }
        Insert: {
          budget_band?: string | null
          cast_level?: string | null
          created_at?: string
          currency?: string | null
          estimated_total?: number | null
          id?: string
          location_count?: number | null
          notes?: string | null
          project_id: string
          schedule_weeks?: number | null
          shoot_days?: number | null
          union_level?: string | null
          updated_at?: string
          user_id: string
          version?: number | null
          vfx_level?: string | null
        }
        Update: {
          budget_band?: string | null
          cast_level?: string | null
          created_at?: string
          currency?: string | null
          estimated_total?: number | null
          id?: string
          location_count?: number | null
          notes?: string | null
          project_id?: string
          schedule_weeks?: number | null
          shoot_days?: number | null
          union_level?: string | null
          updated_at?: string
          user_id?: string
          version?: number | null
          vfx_level?: string | null
        }
        Relationships: []
      }
      buyer_contacts: {
        Row: {
          appetite_notes: string
          buyer_name: string
          company: string
          company_type: string
          created_at: string
          email: string
          genres_interest: string[]
          id: string
          last_contact_at: string | null
          phone: string
          relationship_status: string
          territories: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          appetite_notes?: string
          buyer_name?: string
          company?: string
          company_type?: string
          created_at?: string
          email?: string
          genres_interest?: string[]
          id?: string
          last_contact_at?: string | null
          phone?: string
          relationship_status?: string
          territories?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          appetite_notes?: string
          buyer_name?: string
          company?: string
          company_type?: string
          created_at?: string
          email?: string
          genres_interest?: string[]
          id?: string
          last_contact_at?: string | null
          phone?: string
          relationship_status?: string
          territories?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_meetings: {
        Row: {
          buyer_contact_id: string
          created_at: string
          follow_up: string
          id: string
          location: string
          meeting_date: string
          meeting_type: string
          notes: string
          outcome: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          buyer_contact_id: string
          created_at?: string
          follow_up?: string
          id?: string
          location?: string
          meeting_date?: string
          meeting_type?: string
          notes?: string
          outcome?: string
          project_id?: string | null
          user_id: string
        }
        Update: {
          buyer_contact_id?: string
          created_at?: string
          follow_up?: string
          id?: string
          location?: string
          meeting_date?: string
          meeting_type?: string
          notes?: string
          outcome?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_meetings_buyer_contact_id_fkey"
            columns: ["buyer_contact_id"]
            isOneToOne: false
            referencedRelation: "buyer_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_profiles: {
        Row: {
          buyer_key: string
          created_at: string
          description: string
          embedding: string | null
          id: string
          risk_profile: number | null
        }
        Insert: {
          buyer_key: string
          created_at?: string
          description: string
          embedding?: string | null
          id?: string
          risk_profile?: number | null
        }
        Update: {
          buyer_key?: string
          created_at?: string
          description?: string
          embedding?: string | null
          id?: string
          risk_profile?: number | null
        }
        Relationships: []
      }
      canon_cascade_jobs: {
        Row: {
          created_at: string | null
          direction: string
          id: string
          project_id: string
          safe_target_limit: number | null
          status: string
          trigger_doc_id: string
          trigger_doc_type: string
          trigger_version_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          direction?: string
          id?: string
          project_id: string
          safe_target_limit?: number | null
          status?: string
          trigger_doc_id: string
          trigger_doc_type: string
          trigger_version_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          id?: string
          project_id?: string
          safe_target_limit?: number | null
          status?: string
          trigger_doc_id?: string
          trigger_doc_type?: string
          trigger_version_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canon_cascade_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "canon_cascade_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_cascade_targets: {
        Row: {
          cascade_job_id: string
          cascade_order: number
          ci_score: number | null
          composite_score: number | null
          created_at: string | null
          direction: string
          error_message: string | null
          gp_score: number | null
          id: string
          new_version_id: string | null
          override_allowed: boolean | null
          promotion_allowed: boolean | null
          retry_count: number | null
          sr_score: number | null
          sr_status: string | null
          status: string
          target_doc_id: string
          target_doc_type: string
          updated_at: string | null
        }
        Insert: {
          cascade_job_id: string
          cascade_order: number
          ci_score?: number | null
          composite_score?: number | null
          created_at?: string | null
          direction: string
          error_message?: string | null
          gp_score?: number | null
          id?: string
          new_version_id?: string | null
          override_allowed?: boolean | null
          promotion_allowed?: boolean | null
          retry_count?: number | null
          sr_score?: number | null
          sr_status?: string | null
          status?: string
          target_doc_id: string
          target_doc_type: string
          updated_at?: string | null
        }
        Update: {
          cascade_job_id?: string
          cascade_order?: number
          ci_score?: number | null
          composite_score?: number | null
          created_at?: string | null
          direction?: string
          error_message?: string | null
          gp_score?: number | null
          id?: string
          new_version_id?: string | null
          override_allowed?: boolean | null
          promotion_allowed?: boolean | null
          retry_count?: number | null
          sr_score?: number | null
          sr_status?: string | null
          status?: string
          target_doc_id?: string
          target_doc_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canon_cascade_targets_cascade_job_id_fkey"
            columns: ["cascade_job_id"]
            isOneToOne: false
            referencedRelation: "canon_cascade_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_cascade_targets_target_doc_id_fkey"
            columns: ["target_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_facts: {
        Row: {
          confidence: number
          created_at: string
          fact_type: string
          first_order_key: string | null
          first_scene_id: string | null
          id: string
          is_active: boolean
          last_order_key: string | null
          last_scene_id: string | null
          object: string
          predicate: string
          project_id: string
          sources: Json
          subject: string
          value: Json
        }
        Insert: {
          confidence?: number
          created_at?: string
          fact_type: string
          first_order_key?: string | null
          first_scene_id?: string | null
          id?: string
          is_active?: boolean
          last_order_key?: string | null
          last_scene_id?: string | null
          object: string
          predicate: string
          project_id: string
          sources?: Json
          subject: string
          value?: Json
        }
        Update: {
          confidence?: number
          created_at?: string
          fact_type?: string
          first_order_key?: string | null
          first_scene_id?: string | null
          id?: string
          is_active?: boolean
          last_order_key?: string | null
          last_scene_id?: string | null
          object?: string
          predicate?: string
          project_id?: string
          sources?: Json
          subject?: string
          value?: Json
        }
        Relationships: []
      }
      canon_locations: {
        Row: {
          active: boolean
          associated_characters: string[]
          canonical_name: string
          created_at: string
          description: string | null
          era_relevance: string | null
          geography: string | null
          id: string
          interior_or_exterior: string | null
          location_type: string
          normalized_name: string
          project_id: string
          provenance: string | null
          recurring: boolean
          source_document_ids: string[]
          story_importance: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          associated_characters?: string[]
          canonical_name: string
          created_at?: string
          description?: string | null
          era_relevance?: string | null
          geography?: string | null
          id?: string
          interior_or_exterior?: string | null
          location_type?: string
          normalized_name: string
          project_id: string
          provenance?: string | null
          recurring?: boolean
          source_document_ids?: string[]
          story_importance?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          associated_characters?: string[]
          canonical_name?: string
          created_at?: string
          description?: string | null
          era_relevance?: string | null
          geography?: string | null
          id?: string
          interior_or_exterior?: string | null
          location_type?: string
          normalized_name?: string
          project_id?: string
          provenance?: string | null
          recurring?: boolean
          source_document_ids?: string[]
          story_importance?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "canon_locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          override: Json
          project_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          override?: Json
          project_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          override?: Json
          project_id?: string
          status?: string
        }
        Relationships: []
      }
      canon_snapshots: {
        Row: {
          blueprint_version_id: string | null
          character_bible_version_id: string | null
          created_at: string
          episode_1_version_id: string | null
          episode_grid_version_id: string | null
          id: string
          invalidated_at: string | null
          invalidation_reason: string | null
          project_id: string
          season_episode_count: number
          snapshot_data: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blueprint_version_id?: string | null
          character_bible_version_id?: string | null
          created_at?: string
          episode_1_version_id?: string | null
          episode_grid_version_id?: string | null
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          project_id: string
          season_episode_count: number
          snapshot_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blueprint_version_id?: string | null
          character_bible_version_id?: string | null
          created_at?: string
          episode_1_version_id?: string | null
          episode_grid_version_id?: string | null
          id?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          project_id?: string
          season_episode_count?: number
          snapshot_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      canon_unit_mentions: {
        Row: {
          confidence: number
          created_at: string
          document_id: string
          id: string
          offset_end: number | null
          offset_start: number | null
          unit_id: string
          version_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          document_id: string
          id?: string
          offset_end?: number | null
          offset_start?: number | null
          unit_id: string
          version_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          document_id?: string
          id?: string
          offset_end?: number | null
          offset_start?: number | null
          unit_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_unit_mentions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_unit_mentions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "canon_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_unit_mentions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_unit_relations: {
        Row: {
          attributes: Json
          confidence: number
          created_at: string
          id: string
          project_id: string
          relation_type: string
          unit_id_from: string
          unit_id_to: string
        }
        Insert: {
          attributes?: Json
          confidence?: number
          created_at?: string
          id?: string
          project_id: string
          relation_type: string
          unit_id_from: string
          unit_id_to: string
        }
        Update: {
          attributes?: Json
          confidence?: number
          created_at?: string
          id?: string
          project_id?: string
          relation_type?: string
          unit_id_from?: string
          unit_id_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_unit_relations_unit_id_from_fkey"
            columns: ["unit_id_from"]
            isOneToOne: false
            referencedRelation: "canon_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_unit_relations_unit_id_to_fkey"
            columns: ["unit_id_to"]
            isOneToOne: false
            referencedRelation: "canon_units"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_units: {
        Row: {
          attributes: Json
          confidence: number
          created_at: string
          id: string
          is_active: boolean
          label: string
          project_id: string
          provenance_hash: string | null
          source_document_id: string | null
          source_version_id: string | null
          unit_type: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          confidence?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          project_id: string
          provenance_hash?: string | null
          source_document_id?: string | null
          source_version_id?: string | null
          unit_type: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          confidence?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          project_id?: string
          provenance_hash?: string | null
          source_document_id?: string | null
          source_version_id?: string | null
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_units_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canon_units_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_trends: {
        Row: {
          actor_name: string
          age_band: string
          archived_at: string | null
          budget_tier: string
          created_at: string
          cycle_phase: string
          explanation: string
          first_detected_at: string
          forecast: string
          genre_relevance: string[]
          id: string
          last_updated_at: string
          market_alignment: string
          production_type: string
          refresh_run_id: string | null
          region: string
          sales_leverage: string
          saturation_risk: string
          source_citations: Json | null
          status: string
          strength: number
          target_buyer: string
          timing_window: string
          trend_type: string
          velocity: string
        }
        Insert: {
          actor_name: string
          age_band?: string
          archived_at?: string | null
          budget_tier?: string
          created_at?: string
          cycle_phase?: string
          explanation: string
          first_detected_at?: string
          forecast?: string
          genre_relevance?: string[]
          id?: string
          last_updated_at?: string
          market_alignment?: string
          production_type?: string
          refresh_run_id?: string | null
          region?: string
          sales_leverage?: string
          saturation_risk?: string
          source_citations?: Json | null
          status?: string
          strength?: number
          target_buyer?: string
          timing_window?: string
          trend_type?: string
          velocity?: string
        }
        Update: {
          actor_name?: string
          age_band?: string
          archived_at?: string | null
          budget_tier?: string
          created_at?: string
          cycle_phase?: string
          explanation?: string
          first_detected_at?: string
          forecast?: string
          genre_relevance?: string[]
          id?: string
          last_updated_at?: string
          market_alignment?: string
          production_type?: string
          refresh_run_id?: string | null
          region?: string
          sales_leverage?: string
          saturation_risk?: string
          source_citations?: Json | null
          status?: string
          strength?: number
          target_buyer?: string
          timing_window?: string
          trend_type?: string
          velocity?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_trends_refresh_run_id_fkey"
            columns: ["refresh_run_id"]
            isOneToOne: false
            referencedRelation: "trend_refresh_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      casting_candidates: {
        Row: {
          additional_refs: string[] | null
          batch_id: string
          character_key: string
          created_at: string
          display_name: string | null
          full_body_url: string | null
          generation_config: Json | null
          headshot_url: string | null
          id: string
          project_id: string
          promoted_actor_id: string | null
          promoted_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_refs?: string[] | null
          batch_id?: string
          character_key: string
          created_at?: string
          display_name?: string | null
          full_body_url?: string | null
          generation_config?: Json | null
          headshot_url?: string | null
          id?: string
          project_id: string
          promoted_actor_id?: string | null
          promoted_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_refs?: string[] | null
          batch_id?: string
          character_key?: string
          created_at?: string
          display_name?: string | null
          full_body_url?: string | null
          generation_config?: Json | null
          headshot_url?: string | null
          id?: string
          project_id?: string
          promoted_actor_id?: string | null
          promoted_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "casting_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "casting_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casting_candidates_promoted_actor_id_fkey"
            columns: ["promoted_actor_id"]
            isOneToOne: false
            referencedRelation: "ai_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      character_performance_bible_jobs: {
        Row: {
          character_id: string
          created_at: string
          error: string | null
          id: string
          project_id: string
          result_bible_id: string | null
          result_content: Json | null
          result_hash: string | null
          result_version: number | null
          status: string
          updated_at: string
        }
        Insert: {
          character_id: string
          created_at?: string
          error?: string | null
          id: string
          project_id: string
          result_bible_id?: string | null
          result_content?: Json | null
          result_hash?: string | null
          result_version?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          character_id?: string
          created_at?: string
          error?: string | null
          id?: string
          project_id?: string
          result_bible_id?: string | null
          result_content?: Json | null
          result_hash?: string | null
          result_version?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_performance_bible_jobs_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_performance_bible_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_performance_bible_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_performance_bibles: {
        Row: {
          character_id: string
          content: Json
          created_at: string
          depends_on_resolver_hash: string | null
          id: string
          invalidated_at: string | null
          is_current: boolean
          project_id: string
          updated_at: string
          version_number: number
        }
        Insert: {
          character_id: string
          content: Json
          created_at?: string
          depends_on_resolver_hash?: string | null
          id?: string
          invalidated_at?: string | null
          is_current?: boolean
          project_id: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          character_id?: string
          content?: Json
          created_at?: string
          depends_on_resolver_hash?: string | null
          id?: string
          invalidated_at?: string | null
          is_current?: boolean
          project_id?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "character_performance_bibles_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_performance_bibles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_performance_bibles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_scene_context_cache: {
        Row: {
          cached_at: string
          character_id: string
          content_hash: string
          context: Json
          id: string
          invalidated_at: string | null
          project_id: string
          relations_hash: string
          scene_id: string
          scene_version_id: string
          ttl_expires_at: string
        }
        Insert: {
          cached_at?: string
          character_id: string
          content_hash: string
          context: Json
          id?: string
          invalidated_at?: string | null
          project_id: string
          relations_hash: string
          scene_id: string
          scene_version_id: string
          ttl_expires_at?: string
        }
        Update: {
          cached_at?: string
          character_id?: string
          content_hash?: string
          context?: Json
          id?: string
          invalidated_at?: string | null
          project_id?: string
          relations_hash?: string
          scene_id?: string
          scene_version_id?: string
          ttl_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_scene_context_cache_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_scene_context_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_scene_context_cache_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_scene_contexts: {
        Row: {
          allies_in_scene: string[] | null
          antagonists_in_scene: string[] | null
          cached_at: string | null
          character_id: string
          character_name: string
          content_hash: string
          emotional_arc: string | null
          emotional_beat: string | null
          emotional_state: string | null
          id: string
          is_protagonist: boolean | null
          project_id: string
          protagonist_id: string | null
          protagonist_name: string | null
          protagonist_name_ref: string | null
          relationship_context: string | null
          scene_id: string
          scene_number: string | null
          tension_level: number | null
          thematic_tags: string[] | null
        }
        Insert: {
          allies_in_scene?: string[] | null
          antagonists_in_scene?: string[] | null
          cached_at?: string | null
          character_id: string
          character_name: string
          content_hash: string
          emotional_arc?: string | null
          emotional_beat?: string | null
          emotional_state?: string | null
          id?: string
          is_protagonist?: boolean | null
          project_id: string
          protagonist_id?: string | null
          protagonist_name?: string | null
          protagonist_name_ref?: string | null
          relationship_context?: string | null
          scene_id: string
          scene_number?: string | null
          tension_level?: number | null
          thematic_tags?: string[] | null
        }
        Update: {
          allies_in_scene?: string[] | null
          antagonists_in_scene?: string[] | null
          cached_at?: string | null
          character_id?: string
          character_name?: string
          content_hash?: string
          emotional_arc?: string | null
          emotional_beat?: string | null
          emotional_state?: string | null
          id?: string
          is_protagonist?: boolean | null
          project_id?: string
          protagonist_id?: string | null
          protagonist_name?: string | null
          protagonist_name_ref?: string | null
          relationship_context?: string | null
          scene_id?: string
          scene_number?: string | null
          tension_level?: number | null
          thematic_tags?: string[] | null
        }
        Relationships: []
      }
      character_visual_dna: {
        Row: {
          age_range: string | null
          binding_markers: Json | null
          biological_sex: string | null
          body_type: string | null
          character_name: string
          contradiction_flags: Json
          created_at: string
          created_by: string | null
          ethnicity: string[] | null
          facial_archetype: string | null
          flexible_axes: Json
          gender_presentation: string | null
          height_class: string | null
          id: string
          identity_confidence: Json | null
          identity_evidence: Json | null
          identity_inference_type: Json | null
          identity_signature: Json | null
          identity_strength: string | null
          inferred_guidance: Json
          is_current: boolean
          locked_invariants: Json
          missing_clarifications: Json
          narrative_markers: Json
          physical_categories: Json | null
          producer_guidance: Json
          project_id: string
          role_archetype: string | null
          script_truth: Json
          social_class: string | null
          traits_json: Json | null
          user_override: boolean | null
          version_number: number
          voice_quality: string | null
          wardrobe_signals: Json | null
        }
        Insert: {
          age_range?: string | null
          binding_markers?: Json | null
          biological_sex?: string | null
          body_type?: string | null
          character_name: string
          contradiction_flags?: Json
          created_at?: string
          created_by?: string | null
          ethnicity?: string[] | null
          facial_archetype?: string | null
          flexible_axes?: Json
          gender_presentation?: string | null
          height_class?: string | null
          id?: string
          identity_confidence?: Json | null
          identity_evidence?: Json | null
          identity_inference_type?: Json | null
          identity_signature?: Json | null
          identity_strength?: string | null
          inferred_guidance?: Json
          is_current?: boolean
          locked_invariants?: Json
          missing_clarifications?: Json
          narrative_markers?: Json
          physical_categories?: Json | null
          producer_guidance?: Json
          project_id: string
          role_archetype?: string | null
          script_truth?: Json
          social_class?: string | null
          traits_json?: Json | null
          user_override?: boolean | null
          version_number?: number
          voice_quality?: string | null
          wardrobe_signals?: Json | null
        }
        Update: {
          age_range?: string | null
          binding_markers?: Json | null
          biological_sex?: string | null
          body_type?: string | null
          character_name?: string
          contradiction_flags?: Json
          created_at?: string
          created_by?: string | null
          ethnicity?: string[] | null
          facial_archetype?: string | null
          flexible_axes?: Json
          gender_presentation?: string | null
          height_class?: string | null
          id?: string
          identity_confidence?: Json | null
          identity_evidence?: Json | null
          identity_inference_type?: Json | null
          identity_signature?: Json | null
          identity_strength?: string | null
          inferred_guidance?: Json
          is_current?: boolean
          locked_invariants?: Json
          missing_clarifications?: Json
          narrative_markers?: Json
          physical_categories?: Json | null
          producer_guidance?: Json
          project_id?: string
          role_archetype?: string | null
          script_truth?: Json
          social_class?: string | null
          traits_json?: Json | null
          user_override?: boolean | null
          version_number?: number
          voice_quality?: string | null
          wardrobe_signals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "character_visual_dna_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_visual_dna_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cinematic_quality_attempts: {
        Row: {
          adapter_metrics_json: Json
          attempt_index: number
          created_at: string
          diagnostic_flags: string[]
          expected_unit_count: number | null
          failures: string[]
          hard_failures: string[]
          id: string
          input_summary_json: Json
          metrics_json: Json | null
          model: string
          output_json: Json
          pass: boolean
          prompt_version: string | null
          repair_instruction: string | null
          run_id: string
          score: number
          timing_json: Json
          unit_count: number | null
          units_json: Json | null
        }
        Insert: {
          adapter_metrics_json?: Json
          attempt_index?: number
          created_at?: string
          diagnostic_flags?: string[]
          expected_unit_count?: number | null
          failures?: string[]
          hard_failures?: string[]
          id?: string
          input_summary_json?: Json
          metrics_json?: Json | null
          model?: string
          output_json?: Json
          pass?: boolean
          prompt_version?: string | null
          repair_instruction?: string | null
          run_id: string
          score?: number
          timing_json?: Json
          unit_count?: number | null
          units_json?: Json | null
        }
        Update: {
          adapter_metrics_json?: Json
          attempt_index?: number
          created_at?: string
          diagnostic_flags?: string[]
          expected_unit_count?: number | null
          failures?: string[]
          hard_failures?: string[]
          id?: string
          input_summary_json?: Json
          metrics_json?: Json | null
          model?: string
          output_json?: Json
          pass?: boolean
          prompt_version?: string | null
          repair_instruction?: string | null
          run_id?: string
          score?: number
          timing_json?: Json
          unit_count?: number | null
          units_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "cinematic_quality_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "cinematic_quality_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cinematic_quality_runs: {
        Row: {
          adapter_mode: string | null
          attempt_count: number
          created_at: string
          created_by: string | null
          diagnostic_flags: string[]
          doc_id: string | null
          engine: string
          final_pass: boolean
          final_score: number
          hard_failures: string[]
          id: string
          lane: string | null
          metrics_json: Json
          model: string
          project_id: string
          run_source: string
          settings_json: Json | null
          strictness_mode: string
        }
        Insert: {
          adapter_mode?: string | null
          attempt_count?: number
          created_at?: string
          created_by?: string | null
          diagnostic_flags?: string[]
          doc_id?: string | null
          engine: string
          final_pass?: boolean
          final_score?: number
          hard_failures?: string[]
          id?: string
          lane?: string | null
          metrics_json?: Json
          model: string
          project_id: string
          run_source?: string
          settings_json?: Json | null
          strictness_mode?: string
        }
        Update: {
          adapter_mode?: string | null
          attempt_count?: number
          created_at?: string
          created_by?: string | null
          diagnostic_flags?: string[]
          doc_id?: string | null
          engine?: string
          final_pass?: boolean
          final_score?: number
          hard_failures?: string[]
          id?: string
          lane?: string | null
          metrics_json?: Json
          model?: string
          project_id?: string
          run_source?: string
          settings_json?: Json | null
          strictness_mode?: string
        }
        Relationships: []
      }
      coherence_checks_runs: {
        Row: {
          created_at: string
          created_by: string | null
          findings: Json
          id: string
          inputs: Json
          mode: string
          project_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          inputs?: Json
          mode?: string
          project_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          findings?: Json
          id?: string
          inputs?: Json
          mode?: string
          project_id?: string
          status?: string
        }
        Relationships: []
      }
      coherence_findings: {
        Row: {
          created_at: string
          detail: string
          finding_type: string
          id: string
          is_open: boolean
          project_id: string
          related_doc_refs: Json
          related_scene_ids: Json
          run_id: string
          severity: string
          suggested_repairs: Json
          title: string
        }
        Insert: {
          created_at?: string
          detail: string
          finding_type: string
          id?: string
          is_open?: boolean
          project_id: string
          related_doc_refs?: Json
          related_scene_ids?: Json
          run_id: string
          severity: string
          suggested_repairs?: Json
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          finding_type?: string
          id?: string
          is_open?: boolean
          project_id?: string
          related_doc_refs?: Json
          related_scene_ids?: Json
          run_id?: string
          severity?: string
          suggested_repairs?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "coherence_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "coherence_checks_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_proof: {
        Row: {
          active: boolean
          audience_target: string
          budget_tier: string
          concept_simplicity: string
          created_at: string
          dataset_type: string
          format: string
          franchise_potential: string
          genre: string
          hook_clarity: string
          id: string
          international_travelability: string
          production_budget_est: string | null
          roi_tier: string
          streamer_appeal: string
          title: string
          trailer_moment_density: string
          updated_at: string
          weight: string
          worldwide_gross_est: string | null
          year: number
        }
        Insert: {
          active?: boolean
          audience_target?: string
          budget_tier?: string
          concept_simplicity?: string
          created_at?: string
          dataset_type?: string
          format?: string
          franchise_potential?: string
          genre: string
          hook_clarity?: string
          id?: string
          international_travelability?: string
          production_budget_est?: string | null
          roi_tier?: string
          streamer_appeal?: string
          title: string
          trailer_moment_density?: string
          updated_at?: string
          weight?: string
          worldwide_gross_est?: string | null
          year: number
        }
        Update: {
          active?: boolean
          audience_target?: string
          budget_tier?: string
          concept_simplicity?: string
          created_at?: string
          dataset_type?: string
          format?: string
          franchise_potential?: string
          genre?: string
          hook_clarity?: string
          id?: string
          international_travelability?: string
          production_budget_est?: string | null
          roi_tier?: string
          streamer_appeal?: string
          title?: string
          trailer_moment_density?: string
          updated_at?: string
          weight?: string
          worldwide_gross_est?: string | null
          year?: number
        }
        Relationships: []
      }
      company_intelligence_profiles: {
        Row: {
          attachment_tier_range: string
          bias_weighting_modifier: number
          budget_sweet_spot_max: number | null
          budget_sweet_spot_min: number | null
          company_id: string | null
          company_name: string
          created_at: string
          created_by: string
          finance_tolerance: string
          genre_bias_list: string[] | null
          id: string
          mode_name: string
          packaging_strength: string
          series_track_record: string
          strategic_priorities: string | null
          streamer_bias_list: string[] | null
          updated_at: string
        }
        Insert: {
          attachment_tier_range?: string
          bias_weighting_modifier?: number
          budget_sweet_spot_max?: number | null
          budget_sweet_spot_min?: number | null
          company_id?: string | null
          company_name: string
          created_at?: string
          created_by: string
          finance_tolerance?: string
          genre_bias_list?: string[] | null
          id?: string
          mode_name?: string
          packaging_strength?: string
          series_track_record?: string
          strategic_priorities?: string | null
          streamer_bias_list?: string[] | null
          updated_at?: string
        }
        Update: {
          attachment_tier_range?: string
          bias_weighting_modifier?: number
          budget_sweet_spot_max?: number | null
          budget_sweet_spot_min?: number | null
          company_id?: string | null
          company_name?: string
          created_at?: string
          created_by?: string
          finance_tolerance?: string
          genre_bias_list?: string[] | null
          id?: string
          mode_name?: string
          packaging_strength?: string
          series_track_record?: string
          strategic_priorities?: string | null
          streamer_bias_list?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_intelligence_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "production_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          default_role: string
          display_name: string
          email: string
          id: string
          invited_by: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_role?: string
          display_name?: string
          email?: string
          id?: string
          invited_by: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_role?: string
          display_name?: string
          email?: string
          id?: string
          invited_by?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "production_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      comparable_candidates: {
        Row: {
          confidence: number
          created_at: string
          created_by: string
          format: string
          genres: Json
          id: string
          lane: string
          project_id: string
          query: Json
          rationale: string
          region: string | null
          source_urls: Json
          title: string
          year: number | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by: string
          format?: string
          genres?: Json
          id?: string
          lane: string
          project_id: string
          query?: Json
          rationale?: string
          region?: string | null
          source_urls?: Json
          title: string
          year?: number | null
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string
          format?: string
          genres?: Json
          id?: string
          lane?: string
          project_id?: string
          query?: Json
          rationale?: string
          region?: string | null
          source_urls?: Json
          title?: string
          year?: number | null
        }
        Relationships: []
      }
      comparable_influencers: {
        Row: {
          avoid_tags: Json
          candidate_id: string
          created_at: string
          created_by: string
          emulate_tags: Json
          id: string
          influence_dimensions: Json
          influencer_weight: number
          lane: string
          project_id: string
        }
        Insert: {
          avoid_tags?: Json
          candidate_id: string
          created_at?: string
          created_by: string
          emulate_tags?: Json
          id?: string
          influence_dimensions?: Json
          influencer_weight?: number
          lane: string
          project_id: string
        }
        Update: {
          avoid_tags?: Json
          candidate_id?: string
          created_at?: string
          created_by?: string
          emulate_tags?: Json
          id?: string
          influence_dimensions?: Json
          influencer_weight?: number
          lane?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparable_influencers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "comparable_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      comparable_script_sources: {
        Row: {
          char_count: number | null
          comp_title: string
          created_at: string
          file_name: string | null
          id: string
          lane: string
          metadata: Json | null
          project_doc_id: string | null
          project_id: string
          source_type: string
          source_url: string | null
          storage_path: string | null
          user_id: string
        }
        Insert: {
          char_count?: number | null
          comp_title: string
          created_at?: string
          file_name?: string | null
          id?: string
          lane?: string
          metadata?: Json | null
          project_doc_id?: string | null
          project_id: string
          source_type?: string
          source_url?: string | null
          storage_path?: string | null
          user_id: string
        }
        Update: {
          char_count?: number | null
          comp_title?: string
          created_at?: string
          file_name?: string | null
          id?: string
          lane?: string
          metadata?: Json | null
          project_doc_id?: string | null
          project_id?: string
          source_type?: string
          source_url?: string | null
          storage_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparable_script_sources_project_doc_id_fkey"
            columns: ["project_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_brief_sections: {
        Row: {
          canon_drift_json: Json | null
          convergence_score_json: Json | null
          created_at: string | null
          id: string
          last_rewrite_at: string | null
          plaintext: string | null
          project_id: string
          rewrite_attempts: number | null
          section_key: string
          section_label: string
          status: string
          updated_at: string | null
          version_id: string
        }
        Insert: {
          canon_drift_json?: Json | null
          convergence_score_json?: Json | null
          created_at?: string | null
          id?: string
          last_rewrite_at?: string | null
          plaintext?: string | null
          project_id: string
          rewrite_attempts?: number | null
          section_key: string
          section_label: string
          status?: string
          updated_at?: string | null
          version_id: string
        }
        Update: {
          canon_drift_json?: Json | null
          convergence_score_json?: Json | null
          created_at?: string | null
          id?: string
          last_rewrite_at?: string | null
          plaintext?: string | null
          project_id?: string
          rewrite_attempts?: number | null
          section_key?: string
          section_label?: string
          status?: string
          updated_at?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_brief_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "concept_brief_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_brief_sections_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_brief_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          image_selections: Json
          project_id: string
          scoring_summary: Json
          sections: Json
          status: string
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_selections?: Json
          project_id: string
          scoring_summary?: Json
          sections?: Json
          status?: string
          title?: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_selections?: Json
          project_id?: string
          scoring_summary?: Json
          sections?: Json
          status?: string
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_brief_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "concept_brief_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_expansions: {
        Row: {
          arc_map: string
          character_bible: string
          created_at: string
          id: string
          pitch_idea_id: string
          production_type: string
          raw_response: Json | null
          tone_doc: string
          treatment: string
          updated_at: string
          user_id: string
          version: number
          world_bible: string
        }
        Insert: {
          arc_map?: string
          character_bible?: string
          created_at?: string
          id?: string
          pitch_idea_id: string
          production_type?: string
          raw_response?: Json | null
          tone_doc?: string
          treatment?: string
          updated_at?: string
          user_id: string
          version?: number
          world_bible?: string
        }
        Update: {
          arc_map?: string
          character_bible?: string
          created_at?: string
          id?: string
          pitch_idea_id?: string
          production_type?: string
          raw_response?: Json | null
          tone_doc?: string
          treatment?: string
          updated_at?: string
          user_id?: string
          version?: number
          world_bible?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_expansions_pitch_idea_id_fkey"
            columns: ["pitch_idea_id"]
            isOneToOne: false
            referencedRelation: "pitch_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_lock_documents: {
        Row: {
          content: string
          created_at: string
          doc_type: string
          id: string
          pitch_idea_id: string
          project_id: string
          title: string
          user_id: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          doc_type?: string
          id?: string
          pitch_idea_id: string
          project_id: string
          title?: string
          user_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          doc_type?: string
          id?: string
          pitch_idea_id?: string
          project_id?: string
          title?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_lock_documents_pitch_idea_id_fkey"
            columns: ["pitch_idea_id"]
            isOneToOne: false
            referencedRelation: "pitch_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_lock_versions: {
        Row: {
          expansion_id: string | null
          id: string
          locked_at: string
          locked_fields: Json
          pitch_idea_id: string
          stress_test_id: string | null
          unlock_reason: string | null
          unlocked_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          expansion_id?: string | null
          id?: string
          locked_at?: string
          locked_fields?: Json
          pitch_idea_id: string
          stress_test_id?: string | null
          unlock_reason?: string | null
          unlocked_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          expansion_id?: string | null
          id?: string
          locked_at?: string
          locked_fields?: Json
          pitch_idea_id?: string
          stress_test_id?: string | null
          unlock_reason?: string | null
          unlocked_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_lock_versions_expansion_id_fkey"
            columns: ["expansion_id"]
            isOneToOne: false
            referencedRelation: "concept_expansions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_lock_versions_pitch_idea_id_fkey"
            columns: ["pitch_idea_id"]
            isOneToOne: false
            referencedRelation: "pitch_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_lock_versions_stress_test_id_fkey"
            columns: ["stress_test_id"]
            isOneToOne: false
            referencedRelation: "concept_stress_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_stress_tests: {
        Row: {
          created_at: string
          details: Json | null
          expansion_id: string
          id: string
          passed: boolean
          score_creative_structure: number
          score_engine_sustainability: number
          score_market_alignment: number
          score_total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          expansion_id: string
          id?: string
          passed?: boolean
          score_creative_structure?: number
          score_engine_sustainability?: number
          score_market_alignment?: number
          score_total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          expansion_id?: string
          id?: string
          passed?: boolean
          score_creative_structure?: number
          score_engine_sustainability?: number
          score_market_alignment?: number
          score_total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_stress_tests_expansion_id_fkey"
            columns: ["expansion_id"]
            isOneToOne: false
            referencedRelation: "concept_expansions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_forms: {
        Row: {
          created_at: string
          expiry_date: string | null
          file_path: string | null
          form_type: string | null
          id: string
          interview_subject_id: string | null
          notes: string | null
          project_id: string
          signed_date: string | null
          status: string | null
          subject_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          file_path?: string | null
          form_type?: string | null
          id?: string
          interview_subject_id?: string | null
          notes?: string | null
          project_id: string
          signed_date?: string | null
          status?: string | null
          subject_name?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          file_path?: string | null
          form_type?: string | null
          id?: string
          interview_subject_id?: string | null
          notes?: string | null
          project_id?: string
          signed_date?: string | null
          status?: string | null
          subject_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_forms_interview_subject_id_fkey"
            columns: ["interview_subject_id"]
            isOneToOne: false
            referencedRelation: "interview_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      convergence_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          document_id: string | null
          error: string | null
          id: string
          project_id: string | null
          result_json: Json | null
          status: string | null
          version_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          error?: string | null
          id?: string
          project_id?: string | null
          result_json?: Json | null
          status?: string | null
          version_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          document_id?: string | null
          error?: string | null
          id?: string
          project_id?: string | null
          result_json?: Json | null
          status?: string | null
          version_id?: string | null
        }
        Relationships: []
      }
      convergence_scores: {
        Row: {
          allowed_gap: number
          analysis_mode: string
          convergence_status: string
          created_at: string
          creative_integrity_score: number
          development_stage: string
          executive_guidance: string | null
          executive_snapshot: string | null
          format_advisory: Json | null
          full_result: Json | null
          gap: number
          greenlight_probability: number
          id: string
          leverage_moves: Json | null
          primary_commercial_risk: string | null
          primary_creative_risk: string | null
          project_id: string
          strategic_priority: string
          trajectory: string | null
          user_id: string
        }
        Insert: {
          allowed_gap?: number
          analysis_mode?: string
          convergence_status?: string
          created_at?: string
          creative_integrity_score?: number
          development_stage?: string
          executive_guidance?: string | null
          executive_snapshot?: string | null
          format_advisory?: Json | null
          full_result?: Json | null
          gap?: number
          greenlight_probability?: number
          id?: string
          leverage_moves?: Json | null
          primary_commercial_risk?: string | null
          primary_creative_risk?: string | null
          project_id: string
          strategic_priority?: string
          trajectory?: string | null
          user_id: string
        }
        Update: {
          allowed_gap?: number
          analysis_mode?: string
          convergence_status?: string
          created_at?: string
          creative_integrity_score?: number
          development_stage?: string
          executive_guidance?: string | null
          executive_snapshot?: string | null
          format_advisory?: Json | null
          full_result?: Json | null
          gap?: number
          greenlight_probability?: number
          id?: string
          leverage_moves?: Json | null
          primary_commercial_risk?: string | null
          primary_creative_risk?: string | null
          project_id?: string
          strategic_priority?: string
          trajectory?: string | null
          user_id?: string
        }
        Relationships: []
      }
      copro_frameworks: {
        Row: {
          confidence: string
          created_at: string
          cultural_requirements: string
          eligible_countries: string[]
          id: string
          last_verified_at: string
          max_share_pct: number | null
          min_share_pct: number | null
          name: string
          notes: string
          source_url: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          cultural_requirements?: string
          eligible_countries?: string[]
          id?: string
          last_verified_at?: string
          max_share_pct?: number | null
          min_share_pct?: number | null
          name: string
          notes?: string
          source_url?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          confidence?: string
          created_at?: string
          cultural_requirements?: string
          eligible_countries?: string[]
          id?: string
          last_verified_at?: string
          max_share_pct?: number | null
          min_share_pct?: number | null
          name?: string
          notes?: string
          source_url?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      corpus_character_profiles: {
        Row: {
          arc_type: string | null
          character_name: string | null
          corpus_script_id: string
          created_at: string | null
          dialogue_ratio: number | null
          id: string
          protagonist_flag: boolean | null
          user_id: string
        }
        Insert: {
          arc_type?: string | null
          character_name?: string | null
          corpus_script_id: string
          created_at?: string | null
          dialogue_ratio?: number | null
          id?: string
          protagonist_flag?: boolean | null
          user_id: string
        }
        Update: {
          arc_type?: string | null
          character_name?: string | null
          corpus_script_id?: string
          created_at?: string | null
          dialogue_ratio?: number | null
          id?: string
          protagonist_flag?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_character_profiles_corpus_script_id_fkey"
            columns: ["corpus_script_id"]
            isOneToOne: false
            referencedRelation: "corpus_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_status: string | null
          embedding_updated_at: string | null
          id: string
          script_id: string
          search_vector: unknown
          user_id: string
        }
        Insert: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_status?: string | null
          embedding_updated_at?: string | null
          id?: string
          script_id: string
          search_vector?: unknown
          user_id: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_status?: string | null
          embedding_updated_at?: string | null
          id?: string
          script_id?: string
          search_vector?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_chunks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "corpus_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_derived_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          id: string
          json_data: Json
          script_id: string
          user_id: string
        }
        Insert: {
          artifact_type?: string
          created_at?: string
          id?: string
          json_data?: Json
          script_id: string
          user_id: string
        }
        Update: {
          artifact_type?: string
          created_at?: string
          id?: string
          json_data?: Json
          script_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_derived_artifacts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "corpus_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_insights: {
        Row: {
          created_at: string | null
          id: string
          insight_type: string
          lane: string | null
          pattern: Json | null
          production_type: string | null
          user_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          insight_type: string
          lane?: string | null
          pattern?: Json | null
          production_type?: string | null
          user_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          insight_type?: string
          lane?: string | null
          pattern?: Json | null
          production_type?: string | null
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      corpus_scene_patterns: {
        Row: {
          act_estimate: number | null
          conflict_type: string | null
          corpus_script_id: string
          created_at: string | null
          has_turn: boolean | null
          id: string
          scene_length_est: number | null
          scene_number: number | null
          user_id: string
        }
        Insert: {
          act_estimate?: number | null
          conflict_type?: string | null
          corpus_script_id: string
          created_at?: string | null
          has_turn?: boolean | null
          id?: string
          scene_length_est?: number | null
          scene_number?: number | null
          user_id: string
        }
        Update: {
          act_estimate?: number | null
          conflict_type?: string | null
          corpus_script_id?: string
          created_at?: string | null
          has_turn?: boolean | null
          id?: string
          scene_length_est?: number | null
          scene_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_scene_patterns_corpus_script_id_fkey"
            columns: ["corpus_script_id"]
            isOneToOne: false
            referencedRelation: "corpus_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_scenes: {
        Row: {
          created_at: string
          id: string
          location: string
          scene_number: number
          scene_text: string
          script_id: string
          slugline: string
          time_of_day: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string
          scene_number?: number
          scene_text?: string
          script_id: string
          slugline?: string
          time_of_day?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string
          scene_number?: number
          scene_text?: string
          script_id?: string
          slugline?: string
          time_of_day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corpus_scenes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "corpus_scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      corpus_scripts: {
        Row: {
          analysis_status: string | null
          avg_dialogue_ratio: number | null
          avg_scene_length: number | null
          budget_tier_est: string | null
          cast_count: number | null
          checksum: string
          clean_word_count: number | null
          climax_position: number | null
          created_at: string
          day_night_ratio: number | null
          exclude_from_baselines: boolean | null
          format_subtype: string | null
          genre: string | null
          gold_flag: boolean
          id: string
          ingestion_log: string
          ingestion_source: string | null
          ingestion_status: string
          int_ext_ratio: number | null
          is_transcript: boolean | null
          is_truncated: boolean | null
          line_count: number | null
          location_count: number | null
          market_success_flag: boolean | null
          midpoint_position: number | null
          normalization_removed_lines: number | null
          normalized_page_est: number | null
          page_count: number | null
          page_count_estimate: number | null
          parse_confidence: number | null
          parsed_storage_path: string
          production_type: string | null
          quality_score_est: number | null
          raw_page_est: number | null
          raw_storage_path: string
          raw_text_length_chars: number | null
          runtime_est: number | null
          scene_count: number | null
          source_id: string
          subgenre: string | null
          title: string | null
          transcript_confidence: number | null
          truncation_reason: string | null
          updated_at: string
          user_id: string
          vfx_flag: boolean | null
          word_count: number | null
        }
        Insert: {
          analysis_status?: string | null
          avg_dialogue_ratio?: number | null
          avg_scene_length?: number | null
          budget_tier_est?: string | null
          cast_count?: number | null
          checksum?: string
          clean_word_count?: number | null
          climax_position?: number | null
          created_at?: string
          day_night_ratio?: number | null
          exclude_from_baselines?: boolean | null
          format_subtype?: string | null
          genre?: string | null
          gold_flag?: boolean
          id?: string
          ingestion_log?: string
          ingestion_source?: string | null
          ingestion_status?: string
          int_ext_ratio?: number | null
          is_transcript?: boolean | null
          is_truncated?: boolean | null
          line_count?: number | null
          location_count?: number | null
          market_success_flag?: boolean | null
          midpoint_position?: number | null
          normalization_removed_lines?: number | null
          normalized_page_est?: number | null
          page_count?: number | null
          page_count_estimate?: number | null
          parse_confidence?: number | null
          parsed_storage_path?: string
          production_type?: string | null
          quality_score_est?: number | null
          raw_page_est?: number | null
          raw_storage_path?: string
          raw_text_length_chars?: number | null
          runtime_est?: number | null
          scene_count?: number | null
          source_id: string
          subgenre?: string | null
          title?: string | null
          transcript_confidence?: number | null
          truncation_reason?: string | null
          updated_at?: string
          user_id: string
          vfx_flag?: boolean | null
          word_count?: number | null
        }
        Update: {
          analysis_status?: string | null
          avg_dialogue_ratio?: number | null
          avg_scene_length?: number | null
          budget_tier_est?: string | null
          cast_count?: number | null
          checksum?: string
          clean_word_count?: number | null
          climax_position?: number | null
          created_at?: string
          day_night_ratio?: number | null
          exclude_from_baselines?: boolean | null
          format_subtype?: string | null
          genre?: string | null
          gold_flag?: boolean
          id?: string
          ingestion_log?: string
          ingestion_source?: string | null
          ingestion_status?: string
          int_ext_ratio?: number | null
          is_transcript?: boolean | null
          is_truncated?: boolean | null
          line_count?: number | null
          location_count?: number | null
          market_success_flag?: boolean | null
          midpoint_position?: number | null
          normalization_removed_lines?: number | null
          normalized_page_est?: number | null
          page_count?: number | null
          page_count_estimate?: number | null
          parse_confidence?: number | null
          parsed_storage_path?: string
          production_type?: string | null
          quality_score_est?: number | null
          raw_page_est?: number | null
          raw_storage_path?: string
          raw_text_length_chars?: number | null
          runtime_est?: number | null
          scene_count?: number | null
          source_id?: string
          subgenre?: string | null
          title?: string | null
          transcript_confidence?: number | null
          truncation_reason?: string | null
          updated_at?: string
          user_id?: string
          vfx_flag?: boolean | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "corpus_scripts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "approved_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      costume_run_commands: {
        Row: {
          character_key: string | null
          command_type: string
          consumed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          payload_json: Json | null
          project_id: string
          reason: string | null
          result_json: Json | null
          run_id: string
          slot_key: string | null
          state_key: string | null
          status: string
        }
        Insert: {
          character_key?: string | null
          command_type: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          payload_json?: Json | null
          project_id: string
          reason?: string | null
          result_json?: Json | null
          run_id: string
          slot_key?: string | null
          state_key?: string | null
          status?: string
        }
        Update: {
          character_key?: string | null
          command_type?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          payload_json?: Json | null
          project_id?: string
          reason?: string | null
          result_json?: Json | null
          run_id?: string
          slot_key?: string | null
          state_key?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "costume_run_commands_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "costume_run_commands_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      costume_runs: {
        Row: {
          created_by: string | null
          ended_at: string | null
          id: string
          manifest_json: Json
          project_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_by?: string | null
          ended_at?: string | null
          id: string
          manifest_json?: Json
          project_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_by?: string | null
          ended_at?: string | null
          id?: string
          manifest_json?: Json
          project_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "costume_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "costume_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_benchmark_runs: {
        Row: {
          benchmark_id: string
          coverage_run_id: string
          created_at: string
          created_by: string | null
          id: string
          model: string
          prompt_version_id: string
          scores: Json
        }
        Insert: {
          benchmark_id: string
          coverage_run_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          model: string
          prompt_version_id: string
          scores?: Json
        }
        Update: {
          benchmark_id?: string
          coverage_run_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string
          prompt_version_id?: string
          scores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "coverage_benchmark_runs_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "coverage_benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_benchmark_runs_coverage_run_id_fkey"
            columns: ["coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_benchmark_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "coverage_prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_benchmarks: {
        Row: {
          created_at: string
          created_by: string | null
          gold_notes: string | null
          id: string
          must_catch_issues: Json
          name: string
          project_type: string
          script_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gold_notes?: string | null
          id?: string
          must_catch_issues?: Json
          name: string
          project_type: string
          script_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gold_notes?: string | null
          id?: string
          must_catch_issues?: Json
          name?: string
          project_type?: string
          script_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_benchmarks_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_feedback: {
        Row: {
          accuracy_to_script: number
          actionability: number
          coverage_run_id: string
          created_at: string
          created_by: string
          free_text: string | null
          id: string
          market_realism: number
          overall_usefulness: number
          specificity: number
        }
        Insert: {
          accuracy_to_script?: number
          actionability?: number
          coverage_run_id: string
          created_at?: string
          created_by: string
          free_text?: string | null
          id?: string
          market_realism?: number
          overall_usefulness?: number
          specificity?: number
        }
        Update: {
          accuracy_to_script?: number
          actionability?: number
          coverage_run_id?: string
          created_at?: string
          created_by?: string
          free_text?: string | null
          id?: string
          market_realism?: number
          overall_usefulness?: number
          specificity?: number
        }
        Relationships: [
          {
            foreignKeyName: "coverage_feedback_coverage_run_id_fkey"
            columns: ["coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_feedback_notes: {
        Row: {
          category: string | null
          coverage_run_id: string
          created_at: string
          created_by: string
          id: string
          last_updated_at: string | null
          note_id: string
          note_snapshot: Json | null
          priority: number | null
          reason: string | null
          section: string | null
          tag: string
          user_edit: string | null
          writer_status: string
        }
        Insert: {
          category?: string | null
          coverage_run_id: string
          created_at?: string
          created_by: string
          id?: string
          last_updated_at?: string | null
          note_id: string
          note_snapshot?: Json | null
          priority?: number | null
          reason?: string | null
          section?: string | null
          tag: string
          user_edit?: string | null
          writer_status?: string
        }
        Update: {
          category?: string | null
          coverage_run_id?: string
          created_at?: string
          created_by?: string
          id?: string
          last_updated_at?: string | null
          note_id?: string
          note_snapshot?: Json | null
          priority?: number | null
          reason?: string | null
          section?: string | null
          tag?: string
          user_edit?: string | null
          writer_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_feedback_notes_coverage_run_id_fkey"
            columns: ["coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_note_comments: {
        Row: {
          comment: string
          created_at: string
          created_by: string
          id: string
          thread_id: string
        }
        Insert: {
          comment: string
          created_at?: string
          created_by: string
          id?: string
          thread_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          created_by?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_note_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coverage_note_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_note_threads: {
        Row: {
          coverage_run_id: string
          created_at: string
          created_by: string
          id: string
          note_id: string
        }
        Insert: {
          coverage_run_id: string
          created_at?: string
          created_by: string
          id?: string
          note_id: string
        }
        Update: {
          coverage_run_id?: string
          created_at?: string
          created_by?: string
          id?: string
          note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coverage_note_threads_coverage_run_id_fkey"
            columns: ["coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_prompt_versions: {
        Row: {
          analyst_prompt: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          output_contract: Json
          producer_prompt: string
          project_type_scope: string[]
          qc_prompt: string
          status: string
        }
        Insert: {
          analyst_prompt: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          output_contract?: Json
          producer_prompt: string
          project_type_scope?: string[]
          qc_prompt: string
          status?: string
        }
        Update: {
          analyst_prompt?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          output_contract?: Json
          producer_prompt?: string
          project_type_scope?: string[]
          qc_prompt?: string
          status?: string
        }
        Relationships: []
      }
      coverage_runs: {
        Row: {
          created_at: string
          created_by: string
          deliverable_type: string | null
          development_behavior: string | null
          draft_label: string
          episode_target_duration_seconds: number | null
          final_coverage: string
          format: string | null
          id: string
          inputs: Json
          lane: string | null
          metrics: Json
          model: string
          pass_a: string
          pass_b: string
          pass_c: string
          project_id: string
          project_type: string
          prompt_version_id: string
          schema_version: string | null
          script_id: string
          structured_notes: Json | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deliverable_type?: string | null
          development_behavior?: string | null
          draft_label?: string
          episode_target_duration_seconds?: number | null
          final_coverage?: string
          format?: string | null
          id?: string
          inputs?: Json
          lane?: string | null
          metrics?: Json
          model: string
          pass_a?: string
          pass_b?: string
          pass_c?: string
          project_id: string
          project_type: string
          prompt_version_id: string
          schema_version?: string | null
          script_id: string
          structured_notes?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deliverable_type?: string | null
          development_behavior?: string | null
          draft_label?: string
          episode_target_duration_seconds?: number | null
          final_coverage?: string
          format?: string | null
          id?: string
          inputs?: Json
          lane?: string | null
          metrics?: Json
          model?: string
          pass_a?: string
          pass_b?: string
          pass_c?: string
          project_id?: string
          project_type?: string
          prompt_version_id?: string
          schema_version?: string | null
          script_id?: string
          structured_notes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "coverage_runs_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "coverage_prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_runs_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_framing_strategies: {
        Row: {
          audience_target: string
          canon_lock_summary: string
          content_type: string
          created_at: string
          created_by: string | null
          creative_angle: string
          full_brief: string
          generated_at: string
          id: string
          intent: string
          is_selected: boolean
          meta_json: Json
          project_id: string
          risk_level: string
          strategy_key: string
          strategy_type: string
          trope_handling: string
          updated_at: string
          visual_language: string
        }
        Insert: {
          audience_target?: string
          canon_lock_summary?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          creative_angle?: string
          full_brief?: string
          generated_at?: string
          id?: string
          intent?: string
          is_selected?: boolean
          meta_json?: Json
          project_id: string
          risk_level?: string
          strategy_key: string
          strategy_type: string
          trope_handling?: string
          updated_at?: string
          visual_language?: string
        }
        Update: {
          audience_target?: string
          canon_lock_summary?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          creative_angle?: string
          full_brief?: string
          generated_at?: string
          id?: string
          intent?: string
          is_selected?: boolean
          meta_json?: Json
          project_id?: string
          risk_level?: string
          strategy_key?: string
          strategy_type?: string
          trope_handling?: string
          updated_at?: string
          visual_language?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_framing_strategies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "creative_framing_strategies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          created_at: string
          data_staleness_score: number
          description: string
          id: string
          intelligence_layer: string
          last_refresh: string | null
          production_types_supported: string[]
          refresh_frequency: string
          region: string
          reliability_score: number
          source_name: string
          source_type: string
          status: string
          updated_at: string
          volatility_score: number
        }
        Insert: {
          created_at?: string
          data_staleness_score?: number
          description?: string
          id?: string
          intelligence_layer?: string
          last_refresh?: string | null
          production_types_supported?: string[]
          refresh_frequency?: string
          region?: string
          reliability_score?: number
          source_name: string
          source_type?: string
          status?: string
          updated_at?: string
          volatility_score?: number
        }
        Update: {
          created_at?: string
          data_staleness_score?: number
          description?: string
          id?: string
          intelligence_layer?: string
          last_refresh?: string | null
          production_types_supported?: string[]
          refresh_frequency?: string
          region?: string
          reliability_score?: number
          source_name?: string
          source_type?: string
          status?: string
          updated_at?: string
          volatility_score?: number
        }
        Relationships: []
      }
      decision_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          decision_key: string
          decision_text: string
          decision_value: Json | null
          id: string
          locked: boolean
          meta: Json | null
          project_id: string
          scope: string
          source: string
          source_issue_id: string | null
          source_note_id: string | null
          source_run_id: string | null
          status: string
          superseded_by: string | null
          targets: Json | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision_key: string
          decision_text: string
          decision_value?: Json | null
          id?: string
          locked?: boolean
          meta?: Json | null
          project_id: string
          scope?: string
          source: string
          source_issue_id?: string | null
          source_note_id?: string | null
          source_run_id?: string | null
          status?: string
          superseded_by?: string | null
          targets?: Json | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision_key?: string
          decision_text?: string
          decision_value?: Json | null
          id?: string
          locked?: boolean
          meta?: Json | null
          project_id?: string
          scope?: string
          source?: string
          source_issue_id?: string | null
          source_note_id?: string | null
          source_run_id?: string | null
          status?: string
          superseded_by?: string | null
          targets?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_ledger_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_bundles: {
        Row: {
          bundle_id: string
          created_at: string
          demo_run_id: string | null
          id: string
          manifest_json: Json
          project_id: string
          storage_path: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          demo_run_id?: string | null
          id?: string
          manifest_json?: Json
          project_id: string
          storage_path: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          demo_run_id?: string | null
          id?: string
          manifest_json?: Json
          project_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_bundles_demo_run_id_fkey"
            columns: ["demo_run_id"]
            isOneToOne: false
            referencedRelation: "demo_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_runs: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          lane: string
          last_error: string | null
          links_json: Json
          log_json: Json
          project_id: string
          settings_json: Json
          status: string
          step: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          lane: string
          last_error?: string | null
          links_json?: Json
          log_json?: Json
          project_id: string
          settings_json?: Json
          status?: string
          step?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          lane?: string
          last_error?: string | null
          links_json?: Json
          log_json?: Json
          project_id?: string
          settings_json?: Json
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_engine_convergence_history: {
        Row: {
          allowed_gap: number | null
          convergence_status: string | null
          created_at: string
          creative_score: number
          document_id: string
          gap: number
          greenlight_score: number
          id: string
          project_id: string
          trajectory: string | null
          user_id: string
          version_id: string
        }
        Insert: {
          allowed_gap?: number | null
          convergence_status?: string | null
          created_at?: string
          creative_score?: number
          document_id: string
          gap?: number
          greenlight_score?: number
          id?: string
          project_id: string
          trajectory?: string | null
          user_id: string
          version_id: string
        }
        Update: {
          allowed_gap?: number | null
          convergence_status?: string | null
          created_at?: string
          creative_score?: number
          document_id?: string
          gap?: number
          greenlight_score?: number
          id?: string
          project_id?: string
          trajectory?: string | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_engine_convergence_history_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_engine_convergence_history_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_engine_iterations: {
        Row: {
          approved_notes: Json | null
          changes_summary: string | null
          character_enhancements: Json | null
          ci_score: number | null
          clarify_items: Json | null
          commercial_improvements: string | null
          convergence_status: string | null
          created_at: string
          creative_preserved: string | null
          delta_ci: number | null
          delta_gap: number | null
          delta_gp: number | null
          elevate_items: Json | null
          escalation_improvements: Json | null
          gap: number | null
          gp_score: number | null
          id: string
          iteration_number: number
          lane_clarity_moves: Json | null
          packaging_magnetism_moves: Json | null
          phase: string
          primary_commercial_risk: string | null
          primary_creative_risk: string | null
          protect_items: Json | null
          raw_ai_response: Json | null
          reassess_ci: number | null
          reassess_convergence: string | null
          reassess_gap: number | null
          reassess_gp: number | null
          remove_items: Json | null
          rewritten_text: string | null
          risk_mitigation_fixes: Json | null
          session_id: string
          strengthen_items: Json | null
          structural_adjustments: Json | null
          trajectory: string | null
          user_decision: string | null
          user_id: string
        }
        Insert: {
          approved_notes?: Json | null
          changes_summary?: string | null
          character_enhancements?: Json | null
          ci_score?: number | null
          clarify_items?: Json | null
          commercial_improvements?: string | null
          convergence_status?: string | null
          created_at?: string
          creative_preserved?: string | null
          delta_ci?: number | null
          delta_gap?: number | null
          delta_gp?: number | null
          elevate_items?: Json | null
          escalation_improvements?: Json | null
          gap?: number | null
          gp_score?: number | null
          id?: string
          iteration_number?: number
          lane_clarity_moves?: Json | null
          packaging_magnetism_moves?: Json | null
          phase?: string
          primary_commercial_risk?: string | null
          primary_creative_risk?: string | null
          protect_items?: Json | null
          raw_ai_response?: Json | null
          reassess_ci?: number | null
          reassess_convergence?: string | null
          reassess_gap?: number | null
          reassess_gp?: number | null
          remove_items?: Json | null
          rewritten_text?: string | null
          risk_mitigation_fixes?: Json | null
          session_id: string
          strengthen_items?: Json | null
          structural_adjustments?: Json | null
          trajectory?: string | null
          user_decision?: string | null
          user_id: string
        }
        Update: {
          approved_notes?: Json | null
          changes_summary?: string | null
          character_enhancements?: Json | null
          ci_score?: number | null
          clarify_items?: Json | null
          commercial_improvements?: string | null
          convergence_status?: string | null
          created_at?: string
          creative_preserved?: string | null
          delta_ci?: number | null
          delta_gap?: number | null
          delta_gp?: number | null
          elevate_items?: Json | null
          escalation_improvements?: Json | null
          gap?: number | null
          gp_score?: number | null
          id?: string
          iteration_number?: number
          lane_clarity_moves?: Json | null
          packaging_magnetism_moves?: Json | null
          phase?: string
          primary_commercial_risk?: string | null
          primary_creative_risk?: string | null
          protect_items?: Json | null
          raw_ai_response?: Json | null
          reassess_ci?: number | null
          reassess_convergence?: string | null
          reassess_gap?: number | null
          reassess_gp?: number | null
          remove_items?: Json | null
          rewritten_text?: string | null
          risk_mitigation_fixes?: Json | null
          session_id?: string
          strengthen_items?: Json | null
          structural_adjustments?: Json | null
          trajectory?: string | null
          user_decision?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_engine_iterations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dev_engine_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_engine_sessions: {
        Row: {
          budget: string | null
          convergence_status: string | null
          created_at: string
          current_iteration: number
          format: string | null
          genres: string[] | null
          id: string
          input_text: string
          input_type: string
          lane: string | null
          latest_ci: number | null
          latest_gap: number | null
          latest_gp: number | null
          project_id: string | null
          status: string
          title: string
          trajectory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget?: string | null
          convergence_status?: string | null
          created_at?: string
          current_iteration?: number
          format?: string | null
          genres?: string[] | null
          id?: string
          input_text?: string
          input_type?: string
          lane?: string | null
          latest_ci?: number | null
          latest_gap?: number | null
          latest_gp?: number | null
          project_id?: string | null
          status?: string
          title?: string
          trajectory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget?: string | null
          convergence_status?: string | null
          created_at?: string
          current_iteration?: number
          format?: string | null
          genres?: string[] | null
          id?: string
          input_text?: string
          input_type?: string
          lane?: string | null
          latest_ci?: number | null
          latest_gap?: number | null
          latest_gp?: number | null
          project_id?: string | null
          status?: string
          title?: string
          trajectory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dev_seed_v2_axes: {
        Row: {
          axis_confidence: number | null
          axis_key: string
          axis_priority: number | null
          axis_role: string | null
          axis_statement: string | null
          created_at: string | null
          id: string
          project_id: string
          seed_id: string
        }
        Insert: {
          axis_confidence?: number | null
          axis_key: string
          axis_priority?: number | null
          axis_role?: string | null
          axis_statement?: string | null
          created_at?: string | null
          id?: string
          project_id: string
          seed_id: string
        }
        Update: {
          axis_confidence?: number | null
          axis_key?: string
          axis_priority?: number | null
          axis_role?: string | null
          axis_statement?: string | null
          created_at?: string | null
          id?: string
          project_id?: string
          seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_axes_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_beats: {
        Row: {
          beat_description: string | null
          beat_key: string
          created_at: string | null
          id: string
          project_id: string | null
          seed_id: string
        }
        Insert: {
          beat_description?: string | null
          beat_key: string
          created_at?: string | null
          id?: string
          project_id?: string | null
          seed_id: string
        }
        Update: {
          beat_description?: string | null
          beat_key?: string
          created_at?: string | null
          id?: string
          project_id?: string | null
          seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_beats_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_canon_rules: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          rule_description: string
          rule_key: string
          rule_scope: string | null
          seed_id: string
          severity: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          rule_description: string
          rule_key: string
          rule_scope?: string | null
          seed_id: string
          severity?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          rule_description?: string
          rule_key?: string
          rule_scope?: string | null
          seed_id?: string
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_canon_rules_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_entities: {
        Row: {
          created_at: string | null
          entity_key: string
          entity_type: string | null
          id: string
          project_id: string | null
          seed_id: string
          story_critical_flag: boolean | null
        }
        Insert: {
          created_at?: string | null
          entity_key: string
          entity_type?: string | null
          id?: string
          project_id?: string | null
          seed_id: string
          story_critical_flag?: boolean | null
        }
        Update: {
          created_at?: string | null
          entity_key?: string
          entity_type?: string | null
          id?: string
          project_id?: string | null
          seed_id?: string
          story_critical_flag?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_entities_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_entity_relations: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          relation_type: string | null
          seed_id: string
          source_entity_key: string | null
          target_entity_key: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          relation_type?: string | null
          seed_id: string
          source_entity_key?: string | null
          target_entity_key?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          relation_type?: string | null
          seed_id?: string
          source_entity_key?: string | null
          target_entity_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_entity_relations_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_generation_intent: {
        Row: {
          created_at: string | null
          id: string
          mystery_opacity: number | null
          project_id: string | null
          projection_targets: Json | null
          seed_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          mystery_opacity?: number | null
          project_id?: string | null
          projection_targets?: Json | null
          seed_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          mystery_opacity?: number | null
          project_id?: string | null
          projection_targets?: Json | null
          seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_generation_intent_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_premise: {
        Row: {
          created_at: string | null
          emotional_promise: string | null
          id: string
          premise: string | null
          project_id: string | null
          seed_id: string
          theme_vector: Json | null
        }
        Insert: {
          created_at?: string | null
          emotional_promise?: string | null
          id?: string
          premise?: string | null
          project_id?: string | null
          seed_id: string
          theme_vector?: Json | null
        }
        Update: {
          created_at?: string | null
          emotional_promise?: string | null
          id?: string
          premise?: string | null
          project_id?: string | null
          seed_id?: string
          theme_vector?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_premise_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_seed_v2_projects: {
        Row: {
          created_at: string | null
          derivation_source: string | null
          derived: boolean
          id: string
          project_id: string
          promoted_at: string | null
          promotion_summary: Json | null
        }
        Insert: {
          created_at?: string | null
          derivation_source?: string | null
          derived?: boolean
          id?: string
          project_id: string
          promoted_at?: string | null
          promotion_summary?: Json | null
        }
        Update: {
          created_at?: string | null
          derivation_source?: string | null
          derived?: boolean
          id?: string
          project_id?: string
          promoted_at?: string | null
          promotion_summary?: Json | null
        }
        Relationships: []
      }
      dev_seed_v2_units: {
        Row: {
          axis_source: string | null
          created_at: string | null
          dependency_position: string | null
          failure_mode: string | null
          id: string
          initial_alignment_status: string | null
          project_id: string
          seed_id: string
          success_state: string | null
          unit_key: string
          unit_statement: string | null
          unit_type: string
        }
        Insert: {
          axis_source?: string | null
          created_at?: string | null
          dependency_position?: string | null
          failure_mode?: string | null
          id?: string
          initial_alignment_status?: string | null
          project_id: string
          seed_id: string
          success_state?: string | null
          unit_key: string
          unit_statement?: string | null
          unit_type: string
        }
        Update: {
          axis_source?: string | null
          created_at?: string | null
          dependency_position?: string | null
          failure_mode?: string | null
          id?: string
          initial_alignment_status?: string | null
          project_id?: string
          seed_id?: string
          success_state?: string | null
          unit_key?: string
          unit_statement?: string | null
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_seed_v2_units_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "dev_seed_v2_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      development_branches: {
        Row: {
          branch_name: string
          branch_type: string
          created_at: string
          id: string
          parent_branch_id: string | null
          project_id: string
          status: string
          user_id: string
        }
        Insert: {
          branch_name?: string
          branch_type?: string
          created_at?: string
          id?: string
          parent_branch_id?: string | null
          project_id: string
          status?: string
          user_id: string
        }
        Update: {
          branch_name?: string
          branch_type?: string
          created_at?: string
          id?: string
          parent_branch_id?: string | null
          project_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "development_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      development_briefs: {
        Row: {
          audience_demo: string | null
          budget_band: string | null
          created_at: string
          genre: string
          id: string
          lane_preference: string | null
          name: string
          notes: string | null
          platform_target: string | null
          production_type: string
          region: string | null
          risk_appetite: string | null
          status: string
          subgenre: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_demo?: string | null
          budget_band?: string | null
          created_at?: string
          genre: string
          id?: string
          lane_preference?: string | null
          name?: string
          notes?: string | null
          platform_target?: string | null
          production_type: string
          region?: string | null
          risk_appetite?: string | null
          status?: string
          subgenre?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_demo?: string | null
          budget_band?: string | null
          created_at?: string
          genre?: string
          id?: string
          lane_preference?: string | null
          name?: string
          notes?: string | null
          platform_target?: string | null
          production_type?: string
          region?: string | null
          risk_appetite?: string | null
          status?: string
          subgenre?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      development_notes: {
        Row: {
          apply_timing: string | null
          category: string | null
          confidence: number | null
          created_at: string | null
          description: string | null
          do_not_resolve: boolean | null
          document_id: string
          document_version_id: string
          evidence_references: string[] | null
          id: string
          note_key: string
          note_source: string | null
          project_id: string
          regressed: boolean | null
          resolved: boolean | null
          resolved_in_version: string | null
          severity: string | null
          target_deliverable_type: string | null
          why_it_matters: string | null
        }
        Insert: {
          apply_timing?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          do_not_resolve?: boolean | null
          document_id: string
          document_version_id: string
          evidence_references?: string[] | null
          id?: string
          note_key: string
          note_source?: string | null
          project_id: string
          regressed?: boolean | null
          resolved?: boolean | null
          resolved_in_version?: string | null
          severity?: string | null
          target_deliverable_type?: string | null
          why_it_matters?: string | null
        }
        Update: {
          apply_timing?: string | null
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          description?: string | null
          do_not_resolve?: boolean | null
          document_id?: string
          document_version_id?: string
          evidence_references?: string[] | null
          id?: string
          note_key?: string
          note_source?: string | null
          project_id?: string
          regressed?: boolean | null
          resolved?: boolean | null
          resolved_in_version?: string | null
          severity?: string | null
          target_deliverable_type?: string | null
          why_it_matters?: string | null
        }
        Relationships: []
      }
      development_runs: {
        Row: {
          analysis_mode: string | null
          created_at: string
          deliverable_type: string | null
          development_behavior: string | null
          development_stage: string | null
          document_id: string
          episode_target_duration_seconds: number | null
          format: string | null
          id: string
          output_json: Json | null
          production_type: string | null
          project_id: string
          run_type: string
          schema_version: string | null
          source: string | null
          strategic_priority: string | null
          user_id: string
          version_id: string
        }
        Insert: {
          analysis_mode?: string | null
          created_at?: string
          deliverable_type?: string | null
          development_behavior?: string | null
          development_stage?: string | null
          document_id: string
          episode_target_duration_seconds?: number | null
          format?: string | null
          id?: string
          output_json?: Json | null
          production_type?: string | null
          project_id: string
          run_type?: string
          schema_version?: string | null
          source?: string | null
          strategic_priority?: string | null
          user_id: string
          version_id: string
        }
        Update: {
          analysis_mode?: string | null
          created_at?: string
          deliverable_type?: string | null
          development_behavior?: string | null
          development_stage?: string | null
          document_id?: string
          episode_target_duration_seconds?: number | null
          format?: string | null
          id?: string
          output_json?: Json | null
          production_type?: string | null
          project_id?: string
          run_type?: string
          schema_version?: string | null
          source?: string | null
          strategic_priority?: string | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "development_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      devseed_job_items: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_type: string
          episode_index: number | null
          error_code: string | null
          error_detail: string | null
          gate_failures: string[] | null
          gate_score: number | null
          id: string
          item_key: string
          job_id: string
          output_doc_id: string | null
          output_version_id: string | null
          phase: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_type: string
          episode_index?: number | null
          error_code?: string | null
          error_detail?: string | null
          gate_failures?: string[] | null
          gate_score?: number | null
          id?: string
          item_key: string
          job_id: string
          output_doc_id?: string | null
          output_version_id?: string | null
          phase?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_type?: string
          episode_index?: number | null
          error_code?: string | null
          error_detail?: string | null
          gate_failures?: string[] | null
          gate_score?: number | null
          id?: string
          item_key?: string
          job_id?: string
          output_doc_id?: string | null
          output_version_id?: string | null
          phase?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devseed_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "devseed_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      devseed_jobs: {
        Row: {
          created_at: string
          created_by: string
          error: string | null
          id: string
          include_dev_pack: boolean
          lane: string | null
          mode: string
          pitch_idea_id: string
          progress_json: Json
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          include_dev_pack?: boolean
          lane?: string | null
          mode?: string
          pitch_idea_id: string
          progress_json?: Json
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          include_dev_pack?: boolean
          lane?: string | null
          mode?: string
          pitch_idea_id?: string
          progress_json?: Json
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      devseed_plateau_diagnoses: {
        Row: {
          auto_run_job_id: string | null
          best_ci_seen: number | null
          confidence: string
          created_at: string
          diagnosis_version: string
          evidence_summary: Json
          final_ci: number | null
          final_gp: number | null
          generation_mode: string | null
          halted_doc_type: string | null
          halted_reason: string | null
          id: string
          optimizer_mode: string | null
          pitch_idea_id: string | null
          primary_cause: string
          project_id: string
          recommendation_bundle: Json
          rewriteable: boolean
          secondary_causes: Json
          seed_limited: boolean
          source_blueprint_id: string | null
          source_blueprint_run_id: string | null
          source_dna_profile_id: string | null
          target_ci: number
          target_gp: number
          user_id: string
        }
        Insert: {
          auto_run_job_id?: string | null
          best_ci_seen?: number | null
          confidence?: string
          created_at?: string
          diagnosis_version?: string
          evidence_summary?: Json
          final_ci?: number | null
          final_gp?: number | null
          generation_mode?: string | null
          halted_doc_type?: string | null
          halted_reason?: string | null
          id?: string
          optimizer_mode?: string | null
          pitch_idea_id?: string | null
          primary_cause?: string
          project_id: string
          recommendation_bundle?: Json
          rewriteable?: boolean
          secondary_causes?: Json
          seed_limited?: boolean
          source_blueprint_id?: string | null
          source_blueprint_run_id?: string | null
          source_dna_profile_id?: string | null
          target_ci?: number
          target_gp?: number
          user_id: string
        }
        Update: {
          auto_run_job_id?: string | null
          best_ci_seen?: number | null
          confidence?: string
          created_at?: string
          diagnosis_version?: string
          evidence_summary?: Json
          final_ci?: number | null
          final_gp?: number | null
          generation_mode?: string | null
          halted_doc_type?: string | null
          halted_reason?: string | null
          id?: string
          optimizer_mode?: string | null
          pitch_idea_id?: string | null
          primary_cause?: string
          project_id?: string
          recommendation_bundle?: Json
          rewriteable?: boolean
          secondary_causes?: Json
          seed_limited?: boolean
          source_blueprint_id?: string | null
          source_blueprint_run_id?: string | null
          source_dna_profile_id?: string | null
          target_ci?: number
          target_gp?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devseed_plateau_diagnoses_auto_run_job_id_fkey"
            columns: ["auto_run_job_id"]
            isOneToOne: false
            referencedRelation: "auto_run_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devseed_plateau_diagnoses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "devseed_plateau_diagnoses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_change_proposals: {
        Row: {
          created_at: string
          draft_new_version_id: string | null
          id: string
          project_id: string
          proposal_text: string
          selected_span: Json | null
          status: string
          target_doc_type: string
          target_version_id: string | null
          test_report: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_new_version_id?: string | null
          id?: string
          project_id: string
          proposal_text: string
          selected_span?: Json | null
          status?: string
          target_doc_type: string
          target_version_id?: string | null
          test_report?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          draft_new_version_id?: string | null
          id?: string
          project_id?: string
          proposal_text?: string
          selected_span?: Json | null
          status?: string
          target_doc_type?: string
          target_version_id?: string | null
          test_report?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      doc_fact_ledger_items: {
        Row: {
          claim: string
          created_at: string
          evidence_link: string | null
          evidence_type: string
          id: string
          notes: string
          project_id: string
          status: string
          user_id: string | null
        }
        Insert: {
          claim: string
          created_at?: string
          evidence_link?: string | null
          evidence_type?: string
          id?: string
          notes?: string
          project_id: string
          status?: string
          user_id?: string | null
        }
        Update: {
          claim?: string
          created_at?: string
          evidence_link?: string | null
          evidence_type?: string
          id?: string
          notes?: string
          project_id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      doc_queries: {
        Row: {
          created_at: string
          doc_type: string | null
          doc_version_id: string | null
          id: string
          project_id: string
          query_text: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          doc_version_id?: string | null
          id?: string
          project_id: string
          query_text: string
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          doc_version_id?: string | null
          id?: string
          project_id?: string
          query_text?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      doc_query_answers: {
        Row: {
          answer_text: string
          citations: Json | null
          created_at: string
          doc_query_id: string
          id: string
        }
        Insert: {
          answer_text: string
          citations?: Json | null
          created_at?: string
          doc_query_id: string
          id?: string
        }
        Update: {
          answer_text?: string
          citations?: Json | null
          created_at?: string
          doc_query_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_query_answers_doc_query_id_fkey"
            columns: ["doc_query_id"]
            isOneToOne: false
            referencedRelation: "doc_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      document_assistant_actions: {
        Row: {
          action_type: string
          created_at: string
          created_by: string
          human_summary: string
          id: string
          patch: Json
          proposed_by_message_id: string | null
          status: string
          target_ref: Json
          thread_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by: string
          human_summary: string
          id?: string
          patch?: Json
          proposed_by_message_id?: string | null
          status?: string
          target_ref?: Json
          thread_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string
          human_summary?: string
          id?: string
          patch?: Json
          proposed_by_message_id?: string | null
          status?: string
          target_ref?: Json
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_assistant_actions_proposed_by_message_id_fkey"
            columns: ["proposed_by_message_id"]
            isOneToOne: false
            referencedRelation: "document_assistant_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_assistant_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "document_assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      document_assistant_apply_runs: {
        Row: {
          action_id: string
          details: Json
          finished_at: string | null
          id: string
          logs: string
          started_at: string
          started_by: string
          status: string
          summary: string | null
        }
        Insert: {
          action_id: string
          details?: Json
          finished_at?: string | null
          id?: string
          logs?: string
          started_at?: string
          started_by: string
          status?: string
          summary?: string | null
        }
        Update: {
          action_id?: string
          details?: Json
          finished_at?: string | null
          id?: string
          logs?: string
          started_at?: string
          started_by?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_assistant_apply_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "document_assistant_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_assistant_messages: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          metadata: Json
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "document_assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      document_assistant_test_runs: {
        Row: {
          action_id: string
          details: Json
          finished_at: string | null
          id: string
          logs: string
          started_at: string
          started_by: string
          status: string
          summary: string | null
        }
        Insert: {
          action_id: string
          details?: Json
          finished_at?: string | null
          id?: string
          logs?: string
          started_at?: string
          started_by: string
          status?: string
          summary?: string | null
        }
        Update: {
          action_id?: string
          details?: Json
          finished_at?: string | null
          id?: string
          logs?: string
          started_at?: string
          started_by?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_assistant_test_runs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "document_assistant_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_assistant_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_drift_events: {
        Row: {
          acknowledged: boolean | null
          created_at: string | null
          document_version_id: string
          drift_items: Json | null
          drift_level: string
          id: string
          project_id: string
          resolution_type: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          created_at?: string | null
          document_version_id: string
          drift_items?: Json | null
          drift_level?: string
          id?: string
          project_id: string
          resolution_type?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          created_at?: string | null
          document_version_id?: string
          drift_items?: Json | null
          drift_level?: string
          id?: string
          project_id?: string
          resolution_type?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      document_ingestions: {
        Row: {
          char_count: number
          created_at: string
          error: string | null
          file_path: string
          id: string
          pages_processed: number | null
          project_id: string
          source_type: string
          status: string
          user_id: string
        }
        Insert: {
          char_count?: number
          created_at?: string
          error?: string | null
          file_path: string
          id?: string
          pages_processed?: number | null
          project_id: string
          source_type?: string
          status?: string
          user_id: string
        }
        Update: {
          char_count?: number
          created_at?: string
          error?: string | null
          file_path?: string
          id?: string
          pages_processed?: number | null
          project_id?: string
          source_type?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      document_version_subscores: {
        Row: {
          category: string
          confidence: number | null
          created_at: string | null
          delta_from_previous: number | null
          dimension: string
          id: string
          is_valid: boolean
          run_id: string | null
          score: number
          trend: string | null
          validation_error: string | null
          version_id: string
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string | null
          delta_from_previous?: number | null
          dimension: string
          id?: string
          is_valid?: boolean
          run_id?: string | null
          score: number
          trend?: string | null
          validation_error?: string | null
          version_id: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string | null
          delta_from_previous?: number | null
          dimension?: string
          id?: string
          is_valid?: boolean
          run_id?: string | null
          score?: number
          trend?: string | null
          validation_error?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_version_subscores_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "development_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_version_subscores_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      documentary_coverage_runs: {
        Row: {
          access_risk: string | null
          created_at: string
          cultural_relevance: string | null
          festival_probability: number
          grant_probability: number
          greenlight_score: number
          id: string
          impact_score: number
          market_fit: string | null
          project_id: string
          recommendations: string[] | null
          risk_flags: string[] | null
          user_id: string
        }
        Insert: {
          access_risk?: string | null
          created_at?: string
          cultural_relevance?: string | null
          festival_probability?: number
          grant_probability?: number
          greenlight_score?: number
          id?: string
          impact_score?: number
          market_fit?: string | null
          project_id: string
          recommendations?: string[] | null
          risk_flags?: string[] | null
          user_id: string
        }
        Update: {
          access_risk?: string | null
          created_at?: string
          cultural_relevance?: string | null
          festival_probability?: number
          grant_probability?: number
          greenlight_score?: number
          id?: string
          impact_score?: number
          market_fit?: string | null
          project_id?: string
          recommendations?: string[] | null
          risk_flags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      documentary_profiles: {
        Row: {
          access_level: string | null
          access_notes: string | null
          archive_cost_estimate: number | null
          archive_status: string | null
          broadcaster_targets: string[] | null
          central_question: string | null
          character_reliability: string | null
          created_at: string
          festival_targets: string[] | null
          grant_status: string | null
          id: string
          impact_strategy: string | null
          insurance_risk: string | null
          legal_exposure: string | null
          political_sensitivity: string | null
          project_id: string
          story_type: string | null
          subject_count: number | null
          thematic_focus: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string | null
          access_notes?: string | null
          archive_cost_estimate?: number | null
          archive_status?: string | null
          broadcaster_targets?: string[] | null
          central_question?: string | null
          character_reliability?: string | null
          created_at?: string
          festival_targets?: string[] | null
          grant_status?: string | null
          id?: string
          impact_strategy?: string | null
          insurance_risk?: string | null
          legal_exposure?: string | null
          political_sensitivity?: string | null
          project_id: string
          story_type?: string | null
          subject_count?: number | null
          thematic_focus?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string | null
          access_notes?: string | null
          archive_cost_estimate?: number | null
          archive_status?: string | null
          broadcaster_targets?: string[] | null
          central_question?: string | null
          character_reliability?: string | null
          created_at?: string
          festival_targets?: string[] | null
          grant_status?: string | null
          id?: string
          impact_strategy?: string | null
          insurance_risk?: string | null
          legal_exposure?: string | null
          political_sensitivity?: string | null
          project_id?: string
          story_type?: string | null
          subject_count?: number | null
          thematic_focus?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      drift_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          alert_type: string
          created_at: string
          current_value: number | null
          id: string
          layer: string
          message: string
          metric_key: string
          previous_value: number | null
          project_id: string
          scenario_id: string | null
          severity: string
          threshold: number | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          alert_type: string
          created_at?: string
          current_value?: number | null
          id?: string
          layer: string
          message: string
          metric_key: string
          previous_value?: number | null
          project_id: string
          scenario_id?: string | null
          severity?: string
          threshold?: number | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          alert_type?: string
          created_at?: string
          current_value?: number | null
          id?: string
          layer?: string
          message?: string
          metric_key?: string
          previous_value?: number | null
          project_id?: string
          scenario_id?: string | null
          severity?: string
          threshold?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drift_alerts_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_versions: {
        Row: {
          created_at: string
          id: string
          notes: string
          project_id: string
          screening_score: number | null
          user_id: string
          version_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          project_id: string
          screening_score?: number | null
          user_id: string
          version_label?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          project_id?: string
          screening_score?: number | null
          user_id?: string
          version_label?: string
        }
        Relationships: []
      }
      engine_overrides: {
        Row: {
          created_at: string
          created_by: string
          id: string
          lane: string
          patch: Json
          patch_summary: string
          project_id: string
          scope: string
          target_run_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          lane: string
          patch: Json
          patch_summary?: string
          project_id: string
          scope?: string
          target_run_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          lane?: string
          patch?: Json
          patch_summary?: string
          project_id?: string
          scope?: string
          target_run_id?: string | null
        }
        Relationships: []
      }
      engine_profiles: {
        Row: {
          conflicts: Json
          created_at: string
          created_by: string
          derived_from_influencers: Json
          id: string
          is_active: boolean
          lane: string
          name: string
          project_id: string
          rules: Json
          rules_summary: string
        }
        Insert: {
          conflicts?: Json
          created_at?: string
          created_by: string
          derived_from_influencers?: Json
          id?: string
          is_active?: boolean
          lane: string
          name?: string
          project_id: string
          rules: Json
          rules_summary?: string
        }
        Update: {
          conflicts?: Json
          created_at?: string
          created_by?: string
          derived_from_influencers?: Json
          id?: string
          is_active?: boolean
          lane?: string
          name?: string
          project_id?: string
          rules?: Json
          rules_summary?: string
        }
        Relationships: []
      }
      engine_source_map: {
        Row: {
          created_at: string
          engine_id: string
          id: string
          source_id: string
          source_weight: number
          status: string
          updated_at: string
          validation_method: string
        }
        Insert: {
          created_at?: string
          engine_id: string
          id?: string
          source_id: string
          source_weight?: number
          status?: string
          updated_at?: string
          validation_method?: string
        }
        Update: {
          created_at?: string
          engine_id?: string
          id?: string
          source_id?: string
          source_weight?: number
          status?: string
          updated_at?: string
          validation_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_source_map_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "trend_engines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_source_map_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_weight_snapshots: {
        Row: {
          created_at: string
          id: string
          notes: string
          production_type: string
          snapshot_label: string
          trigger_type: string
          weights: Json
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          production_type: string
          snapshot_label?: string
          trigger_type?: string
          weights?: Json
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          production_type?: string
          snapshot_label?: string
          trigger_type?: string
          weights?: Json
        }
        Relationships: []
      }
      entity_visual_states: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          canonical_description: string | null
          confidence: string
          created_at: string
          entity_id: string | null
          entity_name: string
          entity_type: string
          id: string
          parent_state_id: string | null
          project_id: string
          source_reason: string | null
          state_category: string
          state_key: string
          state_label: string
          story_phase: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          canonical_description?: string | null
          confidence?: string
          created_at?: string
          entity_id?: string | null
          entity_name: string
          entity_type: string
          id?: string
          parent_state_id?: string | null
          project_id: string
          source_reason?: string | null
          state_category: string
          state_key: string
          state_label: string
          story_phase?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          canonical_description?: string | null
          confidence?: string
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          parent_state_id?: string | null
          project_id?: string
          source_reason?: string | null
          state_category?: string
          state_key?: string
          state_label?: string
          story_phase?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_visual_states_parent_state_id_fkey"
            columns: ["parent_state_id"]
            isOneToOne: false
            referencedRelation: "entity_visual_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_visual_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "entity_visual_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          episode_id: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          episode_id?: string | null
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          episode_id?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_activity_log_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "series_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_continuity_notes: {
        Row: {
          created_at: string
          episode_number: number
          id: string
          project_id: string
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          episode_number: number
          id?: string
          project_id: string
          summary?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          episode_number?: number
          id?: string
          project_id?: string
          summary?: Json
          user_id?: string
        }
        Relationships: []
      }
      episode_handoffs: {
        Row: {
          cancelled_at: string | null
          context_doc_keys: string[] | null
          created_at: string
          created_by: string
          desired_outcome: string | null
          dev_engine_doc_id: string | null
          dev_engine_version_id: string | null
          episode_id: string
          episode_number: number
          from_script_id: string | null
          id: string
          issue_description: string | null
          issue_title: string | null
          project_id: string
          return_script_id: string | null
          returned_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          context_doc_keys?: string[] | null
          created_at?: string
          created_by: string
          desired_outcome?: string | null
          dev_engine_doc_id?: string | null
          dev_engine_version_id?: string | null
          episode_id: string
          episode_number: number
          from_script_id?: string | null
          id?: string
          issue_description?: string | null
          issue_title?: string | null
          project_id: string
          return_script_id?: string | null
          returned_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          context_doc_keys?: string[] | null
          created_at?: string
          created_by?: string
          desired_outcome?: string | null
          dev_engine_doc_id?: string | null
          dev_engine_version_id?: string | null
          episode_id?: string
          episode_number?: number
          from_script_id?: string | null
          id?: string
          issue_description?: string | null
          issue_title?: string | null
          project_id?: string
          return_script_id?: string | null
          returned_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_handoffs_dev_engine_doc_id_fkey"
            columns: ["dev_engine_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_handoffs_dev_engine_version_id_fkey"
            columns: ["dev_engine_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_handoffs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "series_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_handoffs_from_script_id_fkey"
            columns: ["from_script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_handoffs_return_script_id_fkey"
            columns: ["return_script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_patch_runs: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_version_id: string | null
          completed_at: string | null
          context_doc_ids: string[] | null
          created_at: string
          desired_outcome: string
          episode_id: string
          episode_script_text: string | null
          error_message: string | null
          id: string
          issue_description: string
          issue_title: string
          patch_summary: string | null
          project_id: string
          proposed_changes: Json | null
          references_used: Json | null
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          source_notes: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_version_id?: string | null
          completed_at?: string | null
          context_doc_ids?: string[] | null
          created_at?: string
          desired_outcome?: string
          episode_id: string
          episode_script_text?: string | null
          error_message?: string | null
          id?: string
          issue_description?: string
          issue_title?: string
          patch_summary?: string | null
          project_id: string
          proposed_changes?: Json | null
          references_used?: Json | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source_notes?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_version_id?: string | null
          completed_at?: string | null
          context_doc_ids?: string[] | null
          created_at?: string
          desired_outcome?: string
          episode_id?: string
          episode_script_text?: string | null
          error_message?: string | null
          id?: string
          issue_description?: string
          issue_title?: string
          patch_summary?: string | null
          project_id?: string
          proposed_changes?: Json | null
          references_used?: Json | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source_notes?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_patch_runs_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "series_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      episode_validations: {
        Row: {
          canon_snapshot_id: string | null
          character_consistency_score: number | null
          created_at: string
          emotional_escalation_score: number | null
          episode_id: string
          id: string
          issues: Json | null
          location_limit_score: number | null
          overall_score: number | null
          passed: boolean | null
          project_id: string
          relationship_continuity_score: number | null
          season_arc_alignment_score: number | null
          user_id: string
        }
        Insert: {
          canon_snapshot_id?: string | null
          character_consistency_score?: number | null
          created_at?: string
          emotional_escalation_score?: number | null
          episode_id: string
          id?: string
          issues?: Json | null
          location_limit_score?: number | null
          overall_score?: number | null
          passed?: boolean | null
          project_id: string
          relationship_continuity_score?: number | null
          season_arc_alignment_score?: number | null
          user_id: string
        }
        Update: {
          canon_snapshot_id?: string | null
          character_consistency_score?: number | null
          created_at?: string
          emotional_escalation_score?: number | null
          episode_id?: string
          id?: string
          issues?: Json | null
          location_limit_score?: number | null
          overall_score?: number | null
          passed?: boolean | null
          project_id?: string
          relationship_continuity_score?: number | null
          season_arc_alignment_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_validations_canon_snapshot_id_fkey"
            columns: ["canon_snapshot_id"]
            isOneToOne: false
            referencedRelation: "canon_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_validations_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "series_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      failure_contrast: {
        Row: {
          active: boolean
          box_office_est: string | null
          budget_est: string | null
          conflict_density: string
          costless_climax: boolean
          created_at: string
          dataset_type: string
          development_outcome: string
          dialogue_subtext_level: string
          flat_escalation: boolean
          format: string
          genre: string
          id: string
          inciting_incident_page: number | null
          late_inciting_incident: boolean
          midpoint_strength: string
          no_midpoint_shift: boolean
          notes: string | null
          on_the_nose_dialogue: boolean
          passive_protagonist: boolean
          primary_weakness: string
          produced: boolean
          protagonist_agency: string
          third_act_strength: string
          title: string
          updated_at: string
          weight: string
          year: number | null
        }
        Insert: {
          active?: boolean
          box_office_est?: string | null
          budget_est?: string | null
          conflict_density?: string
          costless_climax?: boolean
          created_at?: string
          dataset_type?: string
          development_outcome?: string
          dialogue_subtext_level?: string
          flat_escalation?: boolean
          format?: string
          genre: string
          id?: string
          inciting_incident_page?: number | null
          late_inciting_incident?: boolean
          midpoint_strength?: string
          no_midpoint_shift?: boolean
          notes?: string | null
          on_the_nose_dialogue?: boolean
          passive_protagonist?: boolean
          primary_weakness?: string
          produced?: boolean
          protagonist_agency?: string
          third_act_strength?: string
          title: string
          updated_at?: string
          weight?: string
          year?: number | null
        }
        Update: {
          active?: boolean
          box_office_est?: string | null
          budget_est?: string | null
          conflict_density?: string
          costless_climax?: boolean
          created_at?: string
          dataset_type?: string
          development_outcome?: string
          dialogue_subtext_level?: string
          flat_escalation?: boolean
          format?: string
          genre?: string
          id?: string
          inciting_incident_page?: number | null
          late_inciting_incident?: boolean
          midpoint_strength?: string
          no_midpoint_shift?: boolean
          notes?: string | null
          on_the_nose_dialogue?: boolean
          passive_protagonist?: boolean
          primary_weakness?: string
          produced?: boolean
          protagonist_agency?: string
          third_act_strength?: string
          title?: string
          updated_at?: string
          weight?: string
          year?: number | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string | null
          is_enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          is_enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          is_enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      format_archetypes: {
        Row: {
          created_at: string
          description: string
          embedding: string | null
          format_key: string
          id: string
        }
        Insert: {
          created_at?: string
          description: string
          embedding?: string | null
          format_key: string
          id?: string
        }
        Update: {
          created_at?: string
          description?: string
          embedding?: string | null
          format_key?: string
          id?: string
        }
        Relationships: []
      }
      grant_matches: {
        Row: {
          application_notes: string | null
          created_at: string
          currency: string | null
          deadline: string | null
          eligibility_match: number | null
          fund_body: string | null
          fund_name: string
          geography_match: number | null
          id: string
          max_amount: number | null
          project_id: string
          status: string | null
          topic_relevance: number | null
          url: string | null
          user_id: string
        }
        Insert: {
          application_notes?: string | null
          created_at?: string
          currency?: string | null
          deadline?: string | null
          eligibility_match?: number | null
          fund_body?: string | null
          fund_name?: string
          geography_match?: number | null
          id?: string
          max_amount?: number | null
          project_id: string
          status?: string | null
          topic_relevance?: number | null
          url?: string | null
          user_id: string
        }
        Update: {
          application_notes?: string | null
          created_at?: string
          currency?: string | null
          deadline?: string | null
          eligibility_match?: number | null
          fund_body?: string | null
          fund_name?: string
          geography_match?: number | null
          id?: string
          max_amount?: number | null
          project_id?: string
          status?: string | null
          topic_relevance?: number | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      graph_mutation_proposals: {
        Row: {
          applied_at: string | null
          created_at: string | null
          entity_type: string
          error_log: string | null
          id: string
          mutation_type: string
          project_id: string
          proposal_json: Json
          proposal_status: string
          review_comment: string | null
          reviewed_at: string | null
          run_id: string | null
          source_note_id: string | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string | null
          entity_type?: string
          error_log?: string | null
          id?: string
          mutation_type?: string
          project_id: string
          proposal_json: Json
          proposal_status?: string
          review_comment?: string | null
          reviewed_at?: string | null
          run_id?: string | null
          source_note_id?: string | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string | null
          entity_type?: string
          error_log?: string | null
          id?: string
          mutation_type?: string
          project_id?: string
          proposal_json?: Json
          proposal_status?: string
          review_comment?: string | null
          reviewed_at?: string | null
          run_id?: string | null
          source_note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graph_mutation_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "graph_mutation_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      great_notes_library: {
        Row: {
          budget_band: string | null
          created_at: string
          created_by: string
          evidence_style: string | null
          genre: string | null
          id: string
          note_text: string
          problem_type: string
          project_type: string
          source_coverage_run_id: string | null
          tags: string[]
        }
        Insert: {
          budget_band?: string | null
          created_at?: string
          created_by: string
          evidence_style?: string | null
          genre?: string | null
          id?: string
          note_text: string
          problem_type: string
          project_type: string
          source_coverage_run_id?: string | null
          tags?: string[]
        }
        Update: {
          budget_band?: string | null
          created_at?: string
          created_by?: string
          evidence_style?: string | null
          genre?: string | null
          id?: string
          note_text?: string
          problem_type?: string
          project_type?: string
          source_coverage_run_id?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "great_notes_library_source_coverage_run_id_fkey"
            columns: ["source_coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      house_style: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          preferences: Json
          style_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          preferences?: Json
          style_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          preferences?: Json
          style_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      image_evaluations: {
        Row: {
          canon_match: string
          continuity_match: string
          contradiction_flags: Json
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          decision_reason: string | null
          decision_type: string | null
          destination: string | null
          dna_version_id: string | null
          drift_risk: string
          evaluation_method: string
          evaluation_summary: string | null
          id: string
          image_id: string
          lore_compatibility: string | null
          narrative_fit: string
          period_plausibility: string | null
          project_id: string
          traits_satisfied: Json
          traits_violated: Json
          wardrobe_fit: string
        }
        Insert: {
          canon_match?: string
          continuity_match?: string
          contradiction_flags?: Json
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          decision_reason?: string | null
          decision_type?: string | null
          destination?: string | null
          dna_version_id?: string | null
          drift_risk?: string
          evaluation_method?: string
          evaluation_summary?: string | null
          id?: string
          image_id: string
          lore_compatibility?: string | null
          narrative_fit?: string
          period_plausibility?: string | null
          project_id: string
          traits_satisfied?: Json
          traits_violated?: Json
          wardrobe_fit?: string
        }
        Update: {
          canon_match?: string
          continuity_match?: string
          contradiction_flags?: Json
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          decision_reason?: string | null
          decision_type?: string | null
          destination?: string | null
          dna_version_id?: string | null
          drift_risk?: string
          evaluation_method?: string
          evaluation_summary?: string | null
          id?: string
          image_id?: string
          lore_compatibility?: string | null
          narrative_fit?: string
          period_plausibility?: string | null
          project_id?: string
          traits_satisfied?: Json
          traits_violated?: Json
          wardrobe_fit?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_evaluations_dna_version_id_fkey"
            columns: ["dna_version_id"]
            isOneToOne: false
            referencedRelation: "character_visual_dna"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "image_evaluations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_partners: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contribution: string | null
          created_at: string
          engagement_status: string | null
          id: string
          notes: string | null
          partner_name: string
          partner_type: string | null
          project_id: string
          territory: string | null
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contribution?: string | null
          created_at?: string
          engagement_status?: string | null
          id?: string
          notes?: string | null
          partner_name?: string
          partner_type?: string | null
          project_id: string
          territory?: string | null
          user_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contribution?: string | null
          created_at?: string
          engagement_status?: string | null
          id?: string
          notes?: string | null
          partner_name?: string
          partner_type?: string | null
          project_id?: string
          territory?: string | null
          user_id?: string
        }
        Relationships: []
      }
      improvement_runs: {
        Row: {
          after_scores: Json
          after_version_id: string | null
          before_scores: Json
          before_version_id: string | null
          changes_summary: string
          created_at: string
          deliverable_type: string | null
          development_behavior: string | null
          episode_target_duration_seconds: number | null
          format: string | null
          goal: string
          id: string
          inflation_flag: boolean | null
          inflation_reason: string | null
          intensity: string
          owner_id: string
          playbooks_used: Json
          post_rewrite_breakdown: Json | null
          post_rewrite_viability: number | null
          pre_rewrite_breakdown: Json | null
          pre_rewrite_viability: number | null
          project_id: string
          regression_detected: boolean
          rolled_back: boolean
          scene_ops: Json
          schema_version: string | null
          score_deltas: Json
          script_id: string
          status: string
          viability_delta: number | null
        }
        Insert: {
          after_scores?: Json
          after_version_id?: string | null
          before_scores?: Json
          before_version_id?: string | null
          changes_summary?: string
          created_at?: string
          deliverable_type?: string | null
          development_behavior?: string | null
          episode_target_duration_seconds?: number | null
          format?: string | null
          goal?: string
          id?: string
          inflation_flag?: boolean | null
          inflation_reason?: string | null
          intensity?: string
          owner_id: string
          playbooks_used?: Json
          post_rewrite_breakdown?: Json | null
          post_rewrite_viability?: number | null
          pre_rewrite_breakdown?: Json | null
          pre_rewrite_viability?: number | null
          project_id: string
          regression_detected?: boolean
          rolled_back?: boolean
          scene_ops?: Json
          schema_version?: string | null
          score_deltas?: Json
          script_id: string
          status?: string
          viability_delta?: number | null
        }
        Update: {
          after_scores?: Json
          after_version_id?: string | null
          before_scores?: Json
          before_version_id?: string | null
          changes_summary?: string
          created_at?: string
          deliverable_type?: string | null
          development_behavior?: string | null
          episode_target_duration_seconds?: number | null
          format?: string | null
          goal?: string
          id?: string
          inflation_flag?: boolean | null
          inflation_reason?: string | null
          intensity?: string
          owner_id?: string
          playbooks_used?: Json
          post_rewrite_breakdown?: Json | null
          post_rewrite_viability?: number | null
          pre_rewrite_breakdown?: Json | null
          pre_rewrite_viability?: number | null
          project_id?: string
          regression_detected?: boolean
          rolled_back?: boolean
          scene_ops?: Json
          schema_version?: string | null
          score_deltas?: Json
          script_id?: string
          status?: string
          viability_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "improvement_runs_after_version_id_fkey"
            columns: ["after_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "improvement_runs_before_version_id_fkey"
            columns: ["before_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      incentive_programs: {
        Row: {
          caps_limits: string
          confidence: string
          country_code: string
          created_at: string
          eligibility_summary: string
          formats_supported: string[]
          headline_rate: string
          id: string
          jurisdiction: string
          last_verified_at: string
          name: string
          notes: string
          payment_timing: string
          qualifying_spend_rules: string
          source_url: string
          stackability: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          caps_limits?: string
          confidence?: string
          country_code?: string
          created_at?: string
          eligibility_summary?: string
          formats_supported?: string[]
          headline_rate?: string
          id?: string
          jurisdiction: string
          last_verified_at?: string
          name: string
          notes?: string
          payment_timing?: string
          qualifying_spend_rules?: string
          source_url?: string
          stackability?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          caps_limits?: string
          confidence?: string
          country_code?: string
          created_at?: string
          eligibility_summary?: string
          formats_supported?: string[]
          headline_rate?: string
          id?: string
          jurisdiction?: string
          last_verified_at?: string
          name?: string
          notes?: string
          payment_timing?: string
          qualifying_spend_rules?: string
          source_url?: string
          stackability?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          connection_type: string
          created_at: string
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          metadata: Json | null
          project_id: string
          provider_id: string
          user_id: string
        }
        Insert: {
          connection_type?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          metadata?: Json | null
          project_id: string
          provider_id: string
          user_id: string
        }
        Update: {
          connection_type?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          metadata?: Json | null
          project_id?: string
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_imports: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_summary: Json | null
          file_name: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          import_type: string
          parse_status: string
          project_id: string
          provider_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_summary?: Json | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          import_type: string
          parse_status?: string
          project_id: string
          provider_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_summary?: Json | null
          file_name?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          import_type?: string
          parse_status?: string
          project_id?: string
          provider_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_imports_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "integration_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_providers: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          region: string[]
          supported_export_types: string[]
          supported_import_types: string[]
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          region?: string[]
          supported_export_types?: string[]
          supported_import_types?: string[]
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          region?: string[]
          supported_export_types?: string[]
          supported_import_types?: string[]
        }
        Relationships: []
      }
      intel_alerts: {
        Row: {
          delivered_at: string
          event_id: string
          id: string
          status: string
          surface: string
        }
        Insert: {
          delivered_at?: string
          event_id: string
          id?: string
          status?: string
          surface: string
        }
        Update: {
          delivered_at?: string
          event_id?: string
          id?: string
          status?: string
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intel_events"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_convergence_state: {
        Row: {
          contributing_citations: Json | null
          contributing_signal_ids: string[]
          contributing_signal_names: string[]
          created_at: string
          id: string
          key: string
          key_base: string
          key_scoped: string
          last_seen_at: string
          observations: number
          scope_modality: string | null
          scope_production_type: string | null
          scope_project_id: string | null
          score: number
          updated_at: string
          week_bucket: string
        }
        Insert: {
          contributing_citations?: Json | null
          contributing_signal_ids?: string[]
          contributing_signal_names?: string[]
          created_at?: string
          id?: string
          key: string
          key_base?: string
          key_scoped?: string
          last_seen_at?: string
          observations?: number
          scope_modality?: string | null
          scope_production_type?: string | null
          scope_project_id?: string | null
          score?: number
          updated_at?: string
          week_bucket: string
        }
        Update: {
          contributing_citations?: Json | null
          contributing_signal_ids?: string[]
          contributing_signal_names?: string[]
          created_at?: string
          id?: string
          key?: string
          key_base?: string
          key_scoped?: string
          last_seen_at?: string
          observations?: number
          scope_modality?: string | null
          scope_production_type?: string | null
          scope_project_id?: string | null
          score?: number
          updated_at?: string
          week_bucket?: string
        }
        Relationships: []
      }
      intel_event_links: {
        Row: {
          cast_id: string | null
          created_at: string
          event_id: string
          id: string
          meta: Json | null
          signal_id: string | null
        }
        Insert: {
          cast_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          meta?: Json | null
          signal_id?: string | null
        }
        Update: {
          cast_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          meta?: Json | null
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_event_links_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "cast_trends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_event_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "intel_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_event_links_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "trend_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_events: {
        Row: {
          created_at: string
          event_fingerprint: string
          event_type: string
          id: string
          payload: Json
          project_id: string | null
          severity: string
          status: string
          surface: string | null
        }
        Insert: {
          created_at?: string
          event_fingerprint: string
          event_type: string
          id?: string
          payload: Json
          project_id?: string | null
          severity: string
          status?: string
          surface?: string | null
        }
        Update: {
          created_at?: string
          event_fingerprint?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string | null
          severity?: string
          status?: string
          surface?: string | null
        }
        Relationships: []
      }
      intel_policies: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          policy: Json
          priority: number
          scope_key: string
          scope_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          policy: Json
          priority?: number
          scope_key: string
          scope_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          policy?: Json
          priority?: number
          scope_key?: string
          scope_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      intel_runs: {
        Row: {
          created_at: string
          engine_name: string
          error: string | null
          id: string
          model_grounding: string | null
          model_synthesis: string | null
          ok: boolean
          requested_filters: Json | null
          scope: string
          stats: Json | null
          trigger: string
        }
        Insert: {
          created_at?: string
          engine_name: string
          error?: string | null
          id?: string
          model_grounding?: string | null
          model_synthesis?: string | null
          ok?: boolean
          requested_filters?: Json | null
          scope: string
          stats?: Json | null
          trigger: string
        }
        Update: {
          created_at?: string
          engine_name?: string
          error?: string | null
          id?: string
          model_grounding?: string | null
          model_synthesis?: string | null
          ok?: boolean
          requested_filters?: Json | null
          scope?: string
          stats?: Json | null
          trigger?: string
        }
        Relationships: []
      }
      interview_subjects: {
        Row: {
          access_status: string | null
          consent_status: string | null
          contact_info: string | null
          created_at: string
          id: string
          interview_notes: string | null
          location: string | null
          name: string
          project_id: string
          reliability_rating: string | null
          role_in_story: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_status?: string | null
          consent_status?: string | null
          contact_info?: string | null
          created_at?: string
          id?: string
          interview_notes?: string | null
          location?: string | null
          name?: string
          project_id: string
          reliability_rating?: string | null
          role_in_story?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_status?: string | null
          consent_status?: string | null
          contact_info?: string | null
          created_at?: string
          id?: string
          interview_notes?: string | null
          location?: string | null
          name?: string
          project_id?: string
          reliability_rating?: string | null
          role_in_story?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lane_profiles: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          created_at: string
          description: string
          embedding: string | null
          heat_preference: number | null
          id: string
          lane_key: string
          risk_tolerance: number | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          description: string
          embedding?: string | null
          heat_preference?: number | null
          id?: string
          lane_key: string
          risk_tolerance?: number | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          description?: string
          embedding?: string | null
          heat_preference?: number | null
          id?: string
          lane_key?: string
          risk_tolerance?: number | null
        }
        Relationships: []
      }
      learned_nicknames: {
        Row: {
          canonical: string
          created_at: string | null
          created_by: string | null
          id: string
          nickname: string
          project_id: string | null
        }
        Insert: {
          canonical: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          nickname: string
          project_id?: string | null
        }
        Update: {
          canonical?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          nickname?: string
          project_id?: string | null
        }
        Relationships: []
      }
      legal_flags: {
        Row: {
          affected_subjects: string | null
          created_at: string
          description: string | null
          flag_type: string | null
          id: string
          mitigation_plan: string | null
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          affected_subjects?: string | null
          created_at?: string
          description?: string | null
          flag_type?: string | null
          id?: string
          mitigation_plan?: string | null
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          affected_subjects?: string | null
          created_at?: string
          description?: string | null
          flag_type?: string | null
          id?: string
          mitigation_plan?: string | null
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      llm_call_logs: {
        Row: {
          caller_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          model: string
          project_id: string | null
          status: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          caller_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model: string
          project_id?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          caller_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string
          project_id?: string | null
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_call_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "llm_call_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      location_visual_datasets: {
        Row: {
          atmosphere_behavior: Json
          canon_location_id: string | null
          completeness_score: number | null
          contextual_dressing: Json
          created_at: string
          created_by: string | null
          dataset_version: number
          freshness_status: string
          id: string
          inherits_from_parent: boolean
          is_current: boolean
          location_class: string
          location_name: string
          non_inheritable_traits: string[]
          occupation_trace: Json
          parent_location_id: string | null
          project_id: string
          provenance: Json
          slot_architectural_detail: Json
          slot_atmosphere: Json
          slot_establishing: Json
          slot_motif: Json
          slot_surface_language: Json
          slot_time_variant: Json
          source_canon_hash: string | null
          source_mode: string
          spatial_character: Json
          stale_reason: string | null
          status_expression_mode: string
          status_expression_notes: string | null
          status_signal: Json
          structural_substrate: Json
          surface_condition: Json
          symbolic_motif: Json
          updated_at: string
        }
        Insert: {
          atmosphere_behavior?: Json
          canon_location_id?: string | null
          completeness_score?: number | null
          contextual_dressing?: Json
          created_at?: string
          created_by?: string | null
          dataset_version?: number
          freshness_status?: string
          id?: string
          inherits_from_parent?: boolean
          is_current?: boolean
          location_class?: string
          location_name: string
          non_inheritable_traits?: string[]
          occupation_trace?: Json
          parent_location_id?: string | null
          project_id: string
          provenance?: Json
          slot_architectural_detail?: Json
          slot_atmosphere?: Json
          slot_establishing?: Json
          slot_motif?: Json
          slot_surface_language?: Json
          slot_time_variant?: Json
          source_canon_hash?: string | null
          source_mode?: string
          spatial_character?: Json
          stale_reason?: string | null
          status_expression_mode?: string
          status_expression_notes?: string | null
          status_signal?: Json
          structural_substrate?: Json
          surface_condition?: Json
          symbolic_motif?: Json
          updated_at?: string
        }
        Update: {
          atmosphere_behavior?: Json
          canon_location_id?: string | null
          completeness_score?: number | null
          contextual_dressing?: Json
          created_at?: string
          created_by?: string | null
          dataset_version?: number
          freshness_status?: string
          id?: string
          inherits_from_parent?: boolean
          is_current?: boolean
          location_class?: string
          location_name?: string
          non_inheritable_traits?: string[]
          occupation_trace?: Json
          parent_location_id?: string | null
          project_id?: string
          provenance?: Json
          slot_architectural_detail?: Json
          slot_atmosphere?: Json
          slot_establishing?: Json
          slot_motif?: Json
          slot_surface_language?: Json
          slot_time_variant?: Json
          source_canon_hash?: string | null
          source_mode?: string
          spatial_character?: Json
          stale_reason?: string | null
          status_expression_mode?: string
          status_expression_notes?: string | null
          status_signal?: Json
          structural_substrate?: Json
          surface_condition?: Json
          symbolic_motif?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_visual_datasets_canon_location_id_fkey"
            columns: ["canon_location_id"]
            isOneToOne: false
            referencedRelation: "canon_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_visual_datasets_parent_location_id_fkey"
            columns: ["parent_location_id"]
            isOneToOne: false
            referencedRelation: "location_visual_datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_visual_datasets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "location_visual_datasets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lookbook_sections: {
        Row: {
          created_at: string
          display_order: number
          id: string
          metadata: Json
          pack_count: number
          project_id: string
          readiness_state: string
          section_key: string
          section_label: string
          section_status: string
          slot_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          metadata?: Json
          pack_count?: number
          project_id: string
          readiness_state?: string
          section_key: string
          section_label: string
          section_status?: string
          slot_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          metadata?: Json
          pack_count?: number
          project_id?: string
          readiness_state?: string
          section_key?: string
          section_label?: string
          section_status?: string
          slot_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookbook_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "lookbook_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      market_buyers: {
        Row: {
          appetite_notes: string
          budget_sweet_spot: string[]
          company_type: string
          confidence: string
          created_at: string
          deal_types: string[]
          formats: string[]
          genres_acquired: string[]
          id: string
          last_verified_at: string
          market_presence: string
          name: string
          recent_acquisitions: string
          source_url: string
          status: string
          territories: string[]
          tone_preferences: string[]
          updated_at: string
        }
        Insert: {
          appetite_notes?: string
          budget_sweet_spot?: string[]
          company_type?: string
          confidence?: string
          created_at?: string
          deal_types?: string[]
          formats?: string[]
          genres_acquired?: string[]
          id?: string
          last_verified_at?: string
          market_presence?: string
          name: string
          recent_acquisitions?: string
          source_url?: string
          status?: string
          territories?: string[]
          tone_preferences?: string[]
          updated_at?: string
        }
        Update: {
          appetite_notes?: string
          budget_sweet_spot?: string[]
          company_type?: string
          confidence?: string
          created_at?: string
          deal_types?: string[]
          formats?: string[]
          genres_acquired?: string[]
          id?: string
          last_verified_at?: string
          market_presence?: string
          name?: string
          recent_acquisitions?: string
          source_url?: string
          status?: string
          territories?: string[]
          tone_preferences?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      masterwork_canon: {
        Row: {
          act1_break_pct: number | null
          act2_break_pct: number | null
          active: boolean
          awards_recognition: string
          box_office_tier: string
          budget_tier: string
          character_objective_clarity: string | null
          created_at: string
          dataset_type: string
          dialogue_compression: string | null
          dialogue_density: string
          emotional_layering: string | null
          escalation_pattern: string
          escalation_velocity: string | null
          format: string
          genre: string
          id: string
          inciting_incident_pct: number | null
          midpoint_pct: number | null
          monetisation_lane: string
          scene_purpose_density: string | null
          structural_model: string
          thematic_depth: string
          third_act_type: string
          title: string
          updated_at: string
          weight: string
          year: number
        }
        Insert: {
          act1_break_pct?: number | null
          act2_break_pct?: number | null
          active?: boolean
          awards_recognition?: string
          box_office_tier?: string
          budget_tier?: string
          character_objective_clarity?: string | null
          created_at?: string
          dataset_type?: string
          dialogue_compression?: string | null
          dialogue_density?: string
          emotional_layering?: string | null
          escalation_pattern?: string
          escalation_velocity?: string | null
          format?: string
          genre: string
          id?: string
          inciting_incident_pct?: number | null
          midpoint_pct?: number | null
          monetisation_lane?: string
          scene_purpose_density?: string | null
          structural_model?: string
          thematic_depth?: string
          third_act_type?: string
          title: string
          updated_at?: string
          weight?: string
          year: number
        }
        Update: {
          act1_break_pct?: number | null
          act2_break_pct?: number | null
          active?: boolean
          awards_recognition?: string
          box_office_tier?: string
          budget_tier?: string
          character_objective_clarity?: string | null
          created_at?: string
          dataset_type?: string
          dialogue_compression?: string | null
          dialogue_density?: string
          emotional_layering?: string | null
          escalation_pattern?: string
          escalation_velocity?: string | null
          format?: string
          genre?: string
          id?: string
          inciting_incident_pct?: number | null
          midpoint_pct?: number | null
          monetisation_lane?: string
          scene_purpose_density?: string | null
          structural_model?: string
          thematic_depth?: string
          third_act_type?: string
          title?: string
          updated_at?: string
          weight?: string
          year?: number
        }
        Relationships: []
      }
      model_accuracy_scores: {
        Row: {
          accuracy_pct: number
          avg_actual_outcome: number
          avg_predicted_score: number
          correct_predictions: number
          created_at: string
          engine_id: string | null
          id: string
          last_calculated_at: string
          production_type: string
          total_predictions: number
          updated_at: string
        }
        Insert: {
          accuracy_pct?: number
          avg_actual_outcome?: number
          avg_predicted_score?: number
          correct_predictions?: number
          created_at?: string
          engine_id?: string | null
          id?: string
          last_calculated_at?: string
          production_type?: string
          total_predictions?: number
          updated_at?: string
        }
        Update: {
          accuracy_pct?: number
          avg_actual_outcome?: number
          avg_predicted_score?: number
          correct_predictions?: number
          created_at?: string
          engine_id?: string | null
          id?: string
          last_calculated_at?: string
          production_type?: string
          total_predictions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_accuracy_scores_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "trend_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      model_version_log: {
        Row: {
          change_type: string
          changes: Json
          created_at: string
          id: string
          production_type: string
          reason: string
          triggered_by: string
          version_label: string
        }
        Insert: {
          change_type?: string
          changes?: Json
          created_at?: string
          id?: string
          production_type?: string
          reason?: string
          triggered_by?: string
          version_label?: string
        }
        Update: {
          change_type?: string
          changes?: Json
          created_at?: string
          id?: string
          production_type?: string
          reason?: string
          triggered_by?: string
          version_label?: string
        }
        Relationships: []
      }
      name_review_suggestions: {
        Row: {
          action: string
          confidence: string
          created_at: string | null
          extracted_name: string
          id: string
          matched_entity_id: string | null
          project_id: string
          reason: string
          status: string | null
          suggested_canonical: string | null
        }
        Insert: {
          action: string
          confidence: string
          created_at?: string | null
          extracted_name: string
          id?: string
          matched_entity_id?: string | null
          project_id: string
          reason: string
          status?: string | null
          suggested_canonical?: string | null
        }
        Update: {
          action?: string
          confidence?: string
          created_at?: string | null
          extracted_name?: string
          id?: string
          matched_entity_id?: string | null
          project_id?: string
          reason?: string
          status?: string | null
          suggested_canonical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "name_review_suggestions_matched_entity_id_fkey"
            columns: ["matched_entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "name_review_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "name_review_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_dna_profiles: {
        Row: {
          antagonist_pattern: string | null
          created_at: string
          emotional_cadence: string[] | null
          ending_logic: string | null
          escalation_architecture: string | null
          extraction_confidence: number | null
          extraction_json: Json
          extraction_model: string | null
          forbidden_carryovers: string[] | null
          id: string
          locked_at: string | null
          mutable_variables: string[] | null
          power_dynamic: string | null
          primary_engine_key: string | null
          secondary_engine_key: string | null
          set_piece_grammar: string | null
          source_corpus_script_id: string | null
          source_ref_json: Json
          source_text_hash: string | null
          source_text_length: number | null
          source_title: string
          source_type: string
          spine_json: Json
          status: string
          surface_expression_notes: string | null
          thematic_spine: string | null
          updated_at: string
          user_id: string
          world_logic_rules: string[] | null
        }
        Insert: {
          antagonist_pattern?: string | null
          created_at?: string
          emotional_cadence?: string[] | null
          ending_logic?: string | null
          escalation_architecture?: string | null
          extraction_confidence?: number | null
          extraction_json?: Json
          extraction_model?: string | null
          forbidden_carryovers?: string[] | null
          id?: string
          locked_at?: string | null
          mutable_variables?: string[] | null
          power_dynamic?: string | null
          primary_engine_key?: string | null
          secondary_engine_key?: string | null
          set_piece_grammar?: string | null
          source_corpus_script_id?: string | null
          source_ref_json?: Json
          source_text_hash?: string | null
          source_text_length?: number | null
          source_title: string
          source_type?: string
          spine_json?: Json
          status?: string
          surface_expression_notes?: string | null
          thematic_spine?: string | null
          updated_at?: string
          user_id: string
          world_logic_rules?: string[] | null
        }
        Update: {
          antagonist_pattern?: string | null
          created_at?: string
          emotional_cadence?: string[] | null
          ending_logic?: string | null
          escalation_architecture?: string | null
          extraction_confidence?: number | null
          extraction_json?: Json
          extraction_model?: string | null
          forbidden_carryovers?: string[] | null
          id?: string
          locked_at?: string | null
          mutable_variables?: string[] | null
          power_dynamic?: string | null
          primary_engine_key?: string | null
          secondary_engine_key?: string | null
          set_piece_grammar?: string | null
          source_corpus_script_id?: string | null
          source_ref_json?: Json
          source_text_hash?: string | null
          source_text_length?: number | null
          source_title?: string
          source_type?: string
          spine_json?: Json
          status?: string
          surface_expression_notes?: string | null
          thematic_spine?: string | null
          updated_at?: string
          user_id?: string
          world_logic_rules?: string[] | null
        }
        Relationships: []
      }
      narrative_engines: {
        Row: {
          active: boolean | null
          antagonist_topology: string | null
          created_at: string
          description: string
          engine_key: string
          engine_name: string
          escalation_pattern: string | null
          example_titles: string[] | null
          failure_modes: string[] | null
          id: string
          label: string | null
          protagonist_pressure_mode: string | null
          spatial_logic: string | null
          structural_pattern: string | null
          structural_traits: Json | null
          taxonomy_version: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          antagonist_topology?: string | null
          created_at?: string
          description: string
          engine_key: string
          engine_name: string
          escalation_pattern?: string | null
          example_titles?: string[] | null
          failure_modes?: string[] | null
          id?: string
          label?: string | null
          protagonist_pressure_mode?: string | null
          spatial_logic?: string | null
          structural_pattern?: string | null
          structural_traits?: Json | null
          taxonomy_version?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          antagonist_topology?: string | null
          created_at?: string
          description?: string
          engine_key?: string
          engine_name?: string
          escalation_pattern?: string | null
          example_titles?: string[] | null
          failure_modes?: string[] | null
          id?: string
          label?: string | null
          protagonist_pressure_mode?: string | null
          spatial_logic?: string | null
          structural_pattern?: string | null
          structural_traits?: Json | null
          taxonomy_version?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      narrative_entities: {
        Row: {
          authorial_intent: string | null
          canonical_name: string
          created_at: string
          do_not_resolve: boolean | null
          entity_key: string
          entity_type: string
          id: string
          inputs_used: Json
          meta_json: Json
          narrative_role: string | null
          project_id: string | null
          scene_count: number
          source_key: string | null
          source_kind: string
          status: string
          updated_at: string
        }
        Insert: {
          authorial_intent?: string | null
          canonical_name?: string
          created_at?: string
          do_not_resolve?: boolean | null
          entity_key: string
          entity_type?: string
          id?: string
          inputs_used?: Json
          meta_json?: Json
          narrative_role?: string | null
          project_id?: string | null
          scene_count?: number
          source_key?: string | null
          source_kind?: string
          status?: string
          updated_at?: string
        }
        Update: {
          authorial_intent?: string | null
          canonical_name?: string
          created_at?: string
          do_not_resolve?: boolean | null
          entity_key?: string
          entity_type?: string
          id?: string
          inputs_used?: Json
          meta_json?: Json
          narrative_role?: string | null
          project_id?: string | null
          scene_count?: number
          source_key?: string | null
          source_kind?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      narrative_entity_aliases: {
        Row: {
          alias_name: string
          alias_type: string | null
          canonical_entity_id: string
          confidence: number
          created_at: string
          id: string
          project_id: string
          reason: string | null
          source: string
        }
        Insert: {
          alias_name: string
          alias_type?: string | null
          canonical_entity_id: string
          confidence?: number
          created_at?: string
          id?: string
          project_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          alias_name?: string
          alias_type?: string | null
          canonical_entity_id?: string
          confidence?: number
          created_at?: string
          id?: string
          project_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_entity_aliases_canonical_entity_id_fkey"
            columns: ["canonical_entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_entity_relations: {
        Row: {
          confidence: number
          created_at: string
          id: string
          project_id: string
          relation_type: string
          source_entity_id: string
          source_kind: string
          target_entity_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          project_id: string
          relation_type?: string
          source_entity_id: string
          source_kind?: string
          target_entity_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          project_id?: string
          relation_type?: string
          source_entity_id?: string
          source_kind?: string
          target_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_entity_relations_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_entity_relations_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_obligations: {
        Row: {
          arc_id: string | null
          charge: number
          created_at: string
          description: string | null
          detection_confidence: number | null
          detection_mode: string
          discharged_at: string | null
          domain: string
          evidence_refs: Json
          human_verified: boolean
          id: string
          lifecycle_state: string
          narrative_weight: number
          obligation_id: string
          obligation_type: string
          project_id: string
          projection_scope: Json
          provenance: Json
          required_by: string | null
          severity_default: string
          source_key: string
          source_layer: string
          source_scene_id: string | null
          target_scene_id: string | null
          thread_label: string | null
        }
        Insert: {
          arc_id?: string | null
          charge?: number
          created_at?: string
          description?: string | null
          detection_confidence?: number | null
          detection_mode?: string
          discharged_at?: string | null
          domain?: string
          evidence_refs?: Json
          human_verified?: boolean
          id?: string
          lifecycle_state?: string
          narrative_weight?: number
          obligation_id: string
          obligation_type: string
          project_id: string
          projection_scope?: Json
          provenance?: Json
          required_by?: string | null
          severity_default?: string
          source_key: string
          source_layer: string
          source_scene_id?: string | null
          target_scene_id?: string | null
          thread_label?: string | null
        }
        Update: {
          arc_id?: string | null
          charge?: number
          created_at?: string
          description?: string | null
          detection_confidence?: number | null
          detection_mode?: string
          discharged_at?: string | null
          domain?: string
          evidence_refs?: Json
          human_verified?: boolean
          id?: string
          lifecycle_state?: string
          narrative_weight?: number
          obligation_id?: string
          obligation_type?: string
          project_id?: string
          projection_scope?: Json
          provenance?: Json
          required_by?: string | null
          severity_default?: string
          source_key?: string
          source_layer?: string
          source_scene_id?: string | null
          target_scene_id?: string | null
          thread_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "narrative_obligations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "narrative_obligations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_obligations_source_scene_id_fkey"
            columns: ["source_scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "narrative_obligations_target_scene_id_fkey"
            columns: ["target_scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_repairs: {
        Row: {
          created_at: string
          diagnostic_type: string
          executed_at: string | null
          priority_score: number
          project_id: string | null
          recommended_action: string | null
          repair_id: string
          repair_type: string
          repairability: string
          scope_key: string | null
          scope_type: string
          skipped_reason: string | null
          source_diagnostic_id: string
          source_system: string
          status: string
          strategy: string
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          diagnostic_type?: string
          executed_at?: string | null
          priority_score?: number
          project_id?: string | null
          recommended_action?: string | null
          repair_id?: string
          repair_type?: string
          repairability?: string
          scope_key?: string | null
          scope_type?: string
          skipped_reason?: string | null
          source_diagnostic_id: string
          source_system?: string
          status?: string
          strategy?: string
          summary?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          diagnostic_type?: string
          executed_at?: string | null
          priority_score?: number
          project_id?: string | null
          recommended_action?: string | null
          repair_id?: string
          repair_type?: string
          repairability?: string
          scope_key?: string | null
          scope_type?: string
          skipped_reason?: string | null
          source_diagnostic_id?: string
          source_system?: string
          status?: string
          strategy?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      narrative_scene_entity_links: {
        Row: {
          confidence: string
          created_at: string
          entity_id: string
          id: string
          inputs_used: Json
          project_id: string | null
          relation_type: string
          scene_id: string
          source_version_id: string | null
          updated_at: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          entity_id: string
          id?: string
          inputs_used?: Json
          project_id?: string | null
          relation_type: string
          scene_id: string
          source_version_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string
          created_at?: string
          entity_id?: string
          id?: string
          inputs_used?: Json
          project_id?: string | null
          relation_type?: string
          scene_id?: string
          source_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nsel_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "narrative_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nsel_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nsel_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_units: {
        Row: {
          confidence: number
          created_at: string
          extraction_method: string
          id: string
          payload_json: Json
          project_id: string | null
          scene_count: number
          source_doc_type: string
          source_doc_version_id: string | null
          stale_reason: string | null
          status: string | null
          unit_key: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          extraction_method?: string
          id?: string
          payload_json?: Json
          project_id?: string | null
          scene_count?: number
          source_doc_type: string
          source_doc_version_id?: string | null
          stale_reason?: string | null
          status?: string | null
          unit_key: string
          unit_type: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          extraction_method?: string
          id?: string
          payload_json?: Json
          project_id?: string | null
          scene_count?: number
          source_doc_type?: string
          source_doc_version_id?: string | null
          stale_reason?: string | null
          status?: string | null
          unit_key?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "narrative_units_source_doc_version_id_fkey"
            columns: ["source_doc_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      neural_validation_runs: {
        Row: {
          created_at: string
          divergence_json: Json
          document_id: string | null
          document_version_id: string | null
          id: string
          input_text_hash: string
          input_text_preview: string | null
          layer_type: string
          model_version: string
          output_json: Json
          prediction_source: string | null
          project_id: string
          status: string
          target_json: Json
        }
        Insert: {
          created_at?: string
          divergence_json?: Json
          document_id?: string | null
          document_version_id?: string | null
          id?: string
          input_text_hash: string
          input_text_preview?: string | null
          layer_type: string
          model_version: string
          output_json?: Json
          prediction_source?: string | null
          project_id: string
          status?: string
          target_json?: Json
        }
        Update: {
          created_at?: string
          divergence_json?: Json
          document_id?: string | null
          document_version_id?: string | null
          id?: string
          input_text_hash?: string
          input_text_preview?: string | null
          layer_type?: string
          model_version?: string
          output_json?: Json
          prediction_source?: string | null
          project_id?: string
          status?: string
          target_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "neural_validation_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neural_validation_runs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neural_validation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "neural_validation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      note_change_events: {
        Row: {
          base_version_id: string | null
          created_at: string
          diff_summary: string | null
          document_id: string
          error: string | null
          id: string
          note_id: string
          project_id: string
          proposed_patch: Json
          result_version_id: string | null
          status: string
        }
        Insert: {
          base_version_id?: string | null
          created_at?: string
          diff_summary?: string | null
          document_id: string
          error?: string | null
          id?: string
          note_id: string
          project_id: string
          proposed_patch?: Json
          result_version_id?: string | null
          status?: string
        }
        Update: {
          base_version_id?: string | null
          created_at?: string
          diff_summary?: string | null
          document_id?: string
          error?: string | null
          id?: string
          note_id?: string
          project_id?: string
          proposed_patch?: Json
          result_version_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_change_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "project_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_change_plans: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          id: string
          plan: Json
          project_id: string
          status: string
          thread_id: string
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          document_id: string
          id?: string
          plan?: Json
          project_id: string
          status?: string
          thread_id: string
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          plan?: Json
          project_id?: string
          status?: string
          thread_id?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_change_plans_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_change_plans_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "note_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_change_plans_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      note_threads: {
        Row: {
          created_at: string
          created_by: string
          document_id: string | null
          id: string
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          id?: string
          project_id: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_threads_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string
          project_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          link?: string
          project_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string
          project_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nuance_runs: {
        Row: {
          anti_tropes: Json
          attempt: number
          causal_grammar: string
          constraint_pack: Json
          created_at: string
          doc_type: string
          document_id: string | null
          drama_budget: number
          fingerprint: Json
          id: string
          melodrama_score: number
          nuance_gate: Json
          nuance_metrics: Json
          nuance_score: number
          project_id: string
          repaired_from_run_id: string | null
          restraint: number
          similarity_risk: number
          story_engine: string
          updated_at: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          anti_tropes?: Json
          attempt?: number
          causal_grammar?: string
          constraint_pack?: Json
          created_at?: string
          doc_type?: string
          document_id?: string | null
          drama_budget?: number
          fingerprint?: Json
          id?: string
          melodrama_score?: number
          nuance_gate?: Json
          nuance_metrics?: Json
          nuance_score?: number
          project_id: string
          repaired_from_run_id?: string | null
          restraint?: number
          similarity_risk?: number
          story_engine?: string
          updated_at?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          anti_tropes?: Json
          attempt?: number
          causal_grammar?: string
          constraint_pack?: Json
          created_at?: string
          doc_type?: string
          document_id?: string | null
          drama_budget?: number
          fingerprint?: Json
          id?: string
          melodrama_score?: number
          nuance_gate?: Json
          nuance_metrics?: Json
          nuance_score?: number
          project_id?: string
          repaired_from_run_id?: string | null
          restraint?: number
          similarity_risk?: number
          story_engine?: string
          updated_at?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nuance_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuance_runs_repaired_from_run_id_fkey"
            columns: ["repaired_from_run_id"]
            isOneToOne: false
            referencedRelation: "nuance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nuance_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_deltas: {
        Row: {
          actual_budget_range: string | null
          actual_lane: string | null
          budget_achieved: boolean | null
          budget_range_prediction_correct: boolean | null
          commercial_score_delta: number | null
          computed_at: string | null
          development_time_months: number | null
          distribution_offer: boolean | null
          festival_selection: boolean | null
          finance_prediction_correct: boolean | null
          financed: boolean | null
          greenlight_prediction_correct: boolean | null
          id: string
          initial_commercial_score: number | null
          initial_finance_confidence: string | null
          initial_greenlight_verdict: string | null
          initial_structural_score: number | null
          lane_prediction_correct: boolean | null
          notes: Json | null
          predicted_budget_range: string | null
          predicted_lane: string | null
          predicted_to_actual_gap_score: number | null
          presales_secured: boolean | null
          project_id: string
          recoup_achieved: boolean | null
          streamer_interest: boolean | null
          talent_attached: boolean | null
          user_id: string
        }
        Insert: {
          actual_budget_range?: string | null
          actual_lane?: string | null
          budget_achieved?: boolean | null
          budget_range_prediction_correct?: boolean | null
          commercial_score_delta?: number | null
          computed_at?: string | null
          development_time_months?: number | null
          distribution_offer?: boolean | null
          festival_selection?: boolean | null
          finance_prediction_correct?: boolean | null
          financed?: boolean | null
          greenlight_prediction_correct?: boolean | null
          id?: string
          initial_commercial_score?: number | null
          initial_finance_confidence?: string | null
          initial_greenlight_verdict?: string | null
          initial_structural_score?: number | null
          lane_prediction_correct?: boolean | null
          notes?: Json | null
          predicted_budget_range?: string | null
          predicted_lane?: string | null
          predicted_to_actual_gap_score?: number | null
          presales_secured?: boolean | null
          project_id: string
          recoup_achieved?: boolean | null
          streamer_interest?: boolean | null
          talent_attached?: boolean | null
          user_id: string
        }
        Update: {
          actual_budget_range?: string | null
          actual_lane?: string | null
          budget_achieved?: boolean | null
          budget_range_prediction_correct?: boolean | null
          commercial_score_delta?: number | null
          computed_at?: string | null
          development_time_months?: number | null
          distribution_offer?: boolean | null
          festival_selection?: boolean | null
          finance_prediction_correct?: boolean | null
          financed?: boolean | null
          greenlight_prediction_correct?: boolean | null
          id?: string
          initial_commercial_score?: number | null
          initial_finance_confidence?: string | null
          initial_greenlight_verdict?: string | null
          initial_structural_score?: number | null
          lane_prediction_correct?: boolean | null
          notes?: Json | null
          predicted_budget_range?: string | null
          predicted_lane?: string | null
          predicted_to_actual_gap_score?: number | null
          presales_secured?: boolean | null
          project_id?: string
          recoup_achieved?: boolean | null
          streamer_interest?: boolean | null
          talent_attached?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      outcome_signals: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          payload: Json
          project_id: string
          script_version_id: string | null
          signal_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          payload?: Json
          project_id: string
          script_version_id?: string | null
          signal_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          payload?: Json
          project_id?: string
          script_version_id?: string | null
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_signals_script_version_id_fkey"
            columns: ["script_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_items: {
        Row: {
          archetype: string | null
          created_at: string
          id: string
          item_type: string
          name: string | null
          notes: string | null
          priority: number | null
          project_id: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archetype?: string | null
          created_at?: string
          id?: string
          item_type?: string
          name?: string | null
          notes?: string | null
          priority?: number | null
          project_id: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archetype?: string | null
          created_at?: string
          id?: string
          item_type?: string
          name?: string | null
          notes?: string | null
          priority?: number | null
          project_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_transitions: {
        Row: {
          analysis_run_id: string | null
          ci: number | null
          created_at: string
          created_by: string | null
          decision_id: string | null
          doc_type: string | null
          event_domain: string
          event_type: string
          gap: number | null
          generator_id: string | null
          gp: number | null
          id: string
          job_id: string | null
          lane: string | null
          previous_state: Json
          project_id: string
          resulting_state: Json
          resulting_version_id: string | null
          run_id: string | null
          source_of_truth: string | null
          source_version_id: string | null
          stage: string | null
          status: string
          trigger: string | null
        }
        Insert: {
          analysis_run_id?: string | null
          ci?: number | null
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          doc_type?: string | null
          event_domain?: string
          event_type: string
          gap?: number | null
          generator_id?: string | null
          gp?: number | null
          id?: string
          job_id?: string | null
          lane?: string | null
          previous_state?: Json
          project_id: string
          resulting_state?: Json
          resulting_version_id?: string | null
          run_id?: string | null
          source_of_truth?: string | null
          source_version_id?: string | null
          stage?: string | null
          status?: string
          trigger?: string | null
        }
        Update: {
          analysis_run_id?: string | null
          ci?: number | null
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          doc_type?: string | null
          event_domain?: string
          event_type?: string
          gap?: number | null
          generator_id?: string | null
          gp?: number | null
          id?: string
          job_id?: string | null
          lane?: string | null
          previous_state?: Json
          project_id?: string
          resulting_state?: Json
          resulting_version_id?: string | null
          run_id?: string | null
          source_of_truth?: string | null
          source_version_id?: string | null
          stage?: string | null
          status?: string
          trigger?: string | null
        }
        Relationships: []
      }
      pitch_decks: {
        Row: {
          created_at: string
          id: string
          project_id: string
          share_token: string | null
          slides: Json
          status: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          share_token?: string | null
          slides?: Json
          status?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          share_token?: string | null
          slides?: Json
          status?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pitch_feedback: {
        Row: {
          created_at: string
          direction: string | null
          id: string
          pitch_idea_id: string
          rating: string
          tags: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          direction?: string | null
          id?: string
          pitch_idea_id: string
          rating: string
          tags?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string | null
          id?: string
          pitch_idea_id?: string
          rating?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_feedback_pitch_idea_id_fkey"
            columns: ["pitch_idea_id"]
            isOneToOne: false
            referencedRelation: "pitch_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_ideas: {
        Row: {
          brief_id: string | null
          budget_band: string
          comps: string[]
          concept_lock_status: string
          concept_lock_version: number
          created_at: string
          development_sprint: Json
          devseed_canon_json: Json
          genre: string
          id: string
          lane_confidence: number
          learning_pool_eligibility_reason: string | null
          learning_pool_eligible: boolean
          learning_pool_qualified_at: string | null
          logline: string
          mode: string
          one_page_pitch: string
          packaging_suggestions: Json
          platform_target: string
          production_type: string
          project_id: string | null
          promoted_to_project_id: string | null
          raw_response: Json | null
          recommended_lane: string
          region: string
          risk_level: string
          risks_mitigations: Json
          score_company_fit: number | null
          score_feasibility: number | null
          score_lane_fit: number | null
          score_market_heat: number | null
          score_saturation_risk: number | null
          score_total: number | null
          source_coverage_run_id: string | null
          source_dna_profile_id: string | null
          source_engine_key: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          why_us: string
        }
        Insert: {
          brief_id?: string | null
          budget_band?: string
          comps?: string[]
          concept_lock_status?: string
          concept_lock_version?: number
          created_at?: string
          development_sprint?: Json
          devseed_canon_json?: Json
          genre?: string
          id?: string
          lane_confidence?: number
          learning_pool_eligibility_reason?: string | null
          learning_pool_eligible?: boolean
          learning_pool_qualified_at?: string | null
          logline?: string
          mode?: string
          one_page_pitch?: string
          packaging_suggestions?: Json
          platform_target?: string
          production_type?: string
          project_id?: string | null
          promoted_to_project_id?: string | null
          raw_response?: Json | null
          recommended_lane?: string
          region?: string
          risk_level?: string
          risks_mitigations?: Json
          score_company_fit?: number | null
          score_feasibility?: number | null
          score_lane_fit?: number | null
          score_market_heat?: number | null
          score_saturation_risk?: number | null
          score_total?: number | null
          source_coverage_run_id?: string | null
          source_dna_profile_id?: string | null
          source_engine_key?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
          why_us?: string
        }
        Update: {
          brief_id?: string | null
          budget_band?: string
          comps?: string[]
          concept_lock_status?: string
          concept_lock_version?: number
          created_at?: string
          development_sprint?: Json
          devseed_canon_json?: Json
          genre?: string
          id?: string
          lane_confidence?: number
          learning_pool_eligibility_reason?: string | null
          learning_pool_eligible?: boolean
          learning_pool_qualified_at?: string | null
          logline?: string
          mode?: string
          one_page_pitch?: string
          packaging_suggestions?: Json
          platform_target?: string
          production_type?: string
          project_id?: string | null
          promoted_to_project_id?: string | null
          raw_response?: Json | null
          recommended_lane?: string
          region?: string
          risk_level?: string
          risks_mitigations?: Json
          score_company_fit?: number | null
          score_feasibility?: number | null
          score_lane_fit?: number | null
          score_market_heat?: number | null
          score_saturation_risk?: number | null
          score_total?: number | null
          source_coverage_run_id?: string | null
          source_dna_profile_id?: string | null
          source_engine_key?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          why_us?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_ideas_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "development_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_ideas_source_coverage_run_id_fkey"
            columns: ["source_coverage_run_id"]
            isOneToOne: false
            referencedRelation: "coverage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      post_milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          due_date: string | null
          id: string
          label: string
          milestone_type: string
          notes: string
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          milestone_type?: string
          notes?: string
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          label?: string
          milestone_type?: string
          notes?: string
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      poster_candidates: {
        Row: {
          created_at: string
          id: string
          project_id: string
          rank_position: number
          score_json: Json
          selected_by: string | null
          selection_mode: string
          source_image_id: string
          status: string
          total_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          rank_position?: number
          score_json?: Json
          selected_by?: string | null
          selection_mode?: string
          source_image_id: string
          status?: string
          total_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          rank_position?: number
          score_json?: Json
          selected_by?: string | null
          selection_mode?: string
          source_image_id?: string
          status?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poster_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "poster_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      poster_credits: {
        Row: {
          based_on_credit: string | null
          company_name: string
          created_at: string
          created_by_credit: string | null
          id: string
          produced_by: string[]
          project_id: string
          tagline: string | null
          title_override: string | null
          updated_at: string
          user_id: string
          written_by: string[]
        }
        Insert: {
          based_on_credit?: string | null
          company_name?: string
          created_at?: string
          created_by_credit?: string | null
          id?: string
          produced_by?: string[]
          project_id: string
          tagline?: string | null
          title_override?: string | null
          updated_at?: string
          user_id: string
          written_by?: string[]
        }
        Update: {
          based_on_credit?: string | null
          company_name?: string
          created_at?: string
          created_by_credit?: string | null
          id?: string
          produced_by?: string[]
          project_id?: string
          tagline?: string | null
          title_override?: string | null
          updated_at?: string
          user_id?: string
          written_by?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "poster_credits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "poster_credits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_outcomes: {
        Row: {
          actual_financing_outcome: string
          created_at: string
          distribution_type: string
          id: string
          notes: string
          outcome_recorded_at: string | null
          predicted_at: string
          predicted_viability: number
          project_id: string
          revenue_if_known: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_financing_outcome?: string
          created_at?: string
          distribution_type?: string
          id?: string
          notes?: string
          outcome_recorded_at?: string | null
          predicted_at?: string
          predicted_viability?: number
          project_id: string
          revenue_if_known?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_financing_outcome?: string
          created_at?: string
          distribution_type?: string
          id?: string
          notes?: string
          outcome_recorded_at?: string | null
          predicted_at?: string
          predicted_viability?: number
          project_id?: string
          revenue_if_known?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      producer_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          decision: string
          divergence_id: string
          entity_tag: string | null
          id: string
          locked: boolean | null
          note_text: string | null
          project_id: string
          source_doc_type: string
          source_doc_version_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          decision: string
          divergence_id: string
          entity_tag?: string | null
          id?: string
          locked?: boolean | null
          note_text?: string | null
          project_id: string
          source_doc_type: string
          source_doc_version_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          decision?: string
          divergence_id?: string
          entity_tag?: string | null
          id?: string
          locked?: boolean | null
          note_text?: string | null
          project_id?: string
          source_doc_type?: string
          source_doc_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "producer_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      production_breakdowns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mode: string
          per_scene: Json
          project_id: string
          source_snapshot_id: string | null
          suggestions: Json
          totals: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          per_scene?: Json
          project_id: string
          source_snapshot_id?: string | null
          suggestions?: Json
          totals?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          per_scene?: Json
          project_id?: string
          source_snapshot_id?: string | null
          suggestions?: Json
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "production_breakdowns_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      production_companies: {
        Row: {
          color_accent: string
          created_at: string
          id: string
          jurisdiction: string
          logo_url: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_accent?: string
          created_at?: string
          id?: string
          jurisdiction?: string
          logo_url?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_accent?: string
          created_at?: string
          id?: string
          jurisdiction?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      production_cost_actuals: {
        Row: {
          actual: number
          budgeted: number
          created_at: string
          department: string
          id: string
          notes: string
          project_id: string
          updated_at: string
          user_id: string
          variance: number | null
          variance_pct: number | null
        }
        Insert: {
          actual?: number
          budgeted?: number
          created_at?: string
          department?: string
          id?: string
          notes?: string
          project_id: string
          updated_at?: string
          user_id: string
          variance?: number | null
          variance_pct?: number | null
        }
        Update: {
          actual?: number
          budgeted?: number
          created_at?: string
          department?: string
          id?: string
          notes?: string
          project_id?: string
          updated_at?: string
          user_id?: string
          variance?: number | null
          variance_pct?: number | null
        }
        Relationships: []
      }
      production_daily_reports: {
        Row: {
          call_time: string
          created_at: string
          id: string
          incident_severity: string
          incidents: string
          notes: string
          pages_shot: number
          project_id: string
          report_date: string
          scenes_shot: number
          setup_count: number
          updated_at: string
          user_id: string
          weather: string
          wrap_time: string
        }
        Insert: {
          call_time?: string
          created_at?: string
          id?: string
          incident_severity?: string
          incidents?: string
          notes?: string
          pages_shot?: number
          project_id: string
          report_date: string
          scenes_shot?: number
          setup_count?: number
          updated_at?: string
          user_id: string
          weather?: string
          wrap_time?: string
        }
        Update: {
          call_time?: string
          created_at?: string
          id?: string
          incident_severity?: string
          incidents?: string
          notes?: string
          pages_shot?: number
          project_id?: string
          report_date?: string
          scenes_shot?: number
          setup_count?: number
          updated_at?: string
          user_id?: string
          weather?: string
          wrap_time?: string
        }
        Relationships: []
      }
      production_engine_weights: {
        Row: {
          created_at: string
          engine_id: string
          id: string
          production_type: string
          updated_at: string
          weight_value: number
        }
        Insert: {
          created_at?: string
          engine_id: string
          id?: string
          production_type: string
          updated_at?: string
          weight_value?: number
        }
        Update: {
          created_at?: string
          engine_id?: string
          id?: string
          production_type?: string
          updated_at?: string
          weight_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_engine_weights_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "trend_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          mode_preference: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          mode_preference?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          mode_preference?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_active_docs: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          doc_type_key: string
          document_version_id: string
          id: string
          notes: string | null
          project_id: string
          source_flow: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          doc_type_key: string
          document_version_id: string
          id?: string
          notes?: string | null
          project_id: string
          source_flow?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          doc_type_key?: string
          document_version_id?: string
          id?: string
          notes?: string | null
          project_id?: string
          source_flow?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_active_docs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          project_id: string
          section: string
          summary: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          project_id: string
          section?: string
          summary?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          project_id?: string
          section?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      project_ai_cast: {
        Row: {
          ai_actor_id: string
          ai_actor_version_id: string | null
          character_key: string
          created_at: string
          id: string
          notes: string | null
          project_id: string
          updated_at: string
          wardrobe_pack: string | null
        }
        Insert: {
          ai_actor_id: string
          ai_actor_version_id?: string | null
          character_key?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id: string
          updated_at?: string
          wardrobe_pack?: string | null
        }
        Update: {
          ai_actor_id?: string
          ai_actor_version_id?: string | null
          character_key?: string
          created_at?: string
          id?: string
          notes?: string | null
          project_id?: string
          updated_at?: string
          wardrobe_pack?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_ai_cast_ai_actor_id_fkey"
            columns: ["ai_actor_id"]
            isOneToOne: false
            referencedRelation: "ai_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ai_cast_ai_actor_version_id_fkey"
            columns: ["ai_actor_version_id"]
            isOneToOne: false
            referencedRelation: "ai_actor_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_baselines: {
        Row: {
          budget_confidence: number | null
          id: string
          internal_commercial_tier: string | null
          internal_confidence: number | null
          notes: string | null
          packaging_confidence: number | null
          paradox_exec_confidence: number | null
          paradox_mode_flags: Json | null
          project_id: string
          recorded_at: string
          user_id: string
          would_pursue: boolean | null
        }
        Insert: {
          budget_confidence?: number | null
          id?: string
          internal_commercial_tier?: string | null
          internal_confidence?: number | null
          notes?: string | null
          packaging_confidence?: number | null
          paradox_exec_confidence?: number | null
          paradox_mode_flags?: Json | null
          project_id: string
          recorded_at?: string
          user_id?: string
          would_pursue?: boolean | null
        }
        Update: {
          budget_confidence?: number | null
          id?: string
          internal_commercial_tier?: string | null
          internal_confidence?: number | null
          notes?: string | null
          packaging_confidence?: number | null
          paradox_exec_confidence?: number | null
          paradox_mode_flags?: Json | null
          project_id?: string
          recorded_at?: string
          user_id?: string
          would_pursue?: boolean | null
        }
        Relationships: []
      }
      project_budget_lines: {
        Row: {
          amount: number
          budget_id: string
          category: string
          created_at: string
          id: string
          line_name: string
          notes: string
          project_id: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          budget_id: string
          category?: string
          created_at?: string
          id?: string
          line_name?: string
          notes?: string
          project_id: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          budget_id?: string
          category?: string
          created_at?: string
          id?: string
          line_name?: string
          notes?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "project_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      project_budgets: {
        Row: {
          created_at: string
          currency: string
          id: string
          lane_template: string
          notes: string
          project_id: string
          source: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
          version_label: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          lane_template?: string
          notes?: string
          project_id: string
          source?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
          version_label?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          lane_template?: string
          notes?: string
          project_id?: string
          source?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
          version_label?: string
        }
        Relationships: []
      }
      project_canon: {
        Row: {
          canon_json: Json
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canon_json?: Json
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canon_json?: Json
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      project_canon_versions: {
        Row: {
          approved_at: string | null
          canon_json: Json
          created_at: string
          created_by: string | null
          id: string
          is_approved: boolean
          project_id: string
          status: string
          summary: string | null
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          canon_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_approved?: boolean
          project_id: string
          status?: string
          summary?: string | null
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          canon_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_approved?: boolean
          project_id?: string
          status?: string
          summary?: string | null
          version_number?: number
        }
        Relationships: []
      }
      project_cashflow_sources: {
        Row: {
          amount: number
          created_at: string
          duration_months: number
          id: string
          name: string
          origin: string
          origin_ref_id: string | null
          project_id: string
          sort_order: number
          source_type: string
          start_month: number
          timing: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          duration_months?: number
          id?: string
          name?: string
          origin?: string
          origin_ref_id?: string | null
          project_id: string
          sort_order?: number
          source_type?: string
          start_month?: number
          timing?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          duration_months?: number
          id?: string
          name?: string
          origin?: string
          origin_ref_id?: string | null
          project_id?: string
          sort_order?: number
          source_type?: string
          start_month?: number
          timing?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_cast: {
        Row: {
          actor_name: string
          agency: string
          agent_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          id: string
          imdb_id: string
          manager_name: string
          market_value_tier: string
          notes: string
          project_id: string
          role_name: string
          status: string
          territory_tags: string[]
          tmdb_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_name?: string
          agency?: string
          agent_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          imdb_id?: string
          manager_name?: string
          market_value_tier?: string
          notes?: string
          project_id: string
          role_name?: string
          status?: string
          territory_tags?: string[]
          tmdb_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_name?: string
          agency?: string
          agent_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          id?: string
          imdb_id?: string
          manager_name?: string
          market_value_tier?: string
          notes?: string
          project_id?: string
          role_name?: string
          status?: string
          territory_tags?: string[]
          tmdb_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_characters: {
        Row: {
          character_key: string
          character_name: string
          created_at: string
          id: string
          metadata: Json | null
          project_id: string
          role_category: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          character_key: string
          character_name: string
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id: string
          role_category?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          character_key?: string
          character_name?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          role_category?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      project_collaborators: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          invited_by: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          project_id: string
          section: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id: string
          section?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id?: string
          section?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      project_company_links: {
        Row: {
          company_id: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_company_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "production_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comparables: {
        Row: {
          confidence: number | null
          created_at: string
          extraction_meta: Json | null
          id: string
          kind: string | null
          normalized_title: string
          project_id: string
          raw_text: string | null
          source: string
          source_doc_id: string | null
          source_version_id: string | null
          title: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extraction_meta?: Json | null
          id?: string
          kind?: string | null
          normalized_title: string
          project_id: string
          raw_text?: string | null
          source?: string
          source_doc_id?: string | null
          source_version_id?: string | null
          title: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extraction_meta?: Json | null
          id?: string
          kind?: string | null
          normalized_title?: string
          project_id?: string
          raw_text?: string | null
          source?: string
          source_doc_id?: string | null
          source_version_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comparables_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contracts: {
        Row: {
          contract_type: string
          created_at: string
          currency: string
          executed_at: string | null
          expires_at: string | null
          id: string
          key_terms: Json
          notes: string
          participant_id: string | null
          project_id: string
          rights_granted: string
          source: string
          status: string
          term_years: string
          territory: string
          title: string
          total_value: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          contract_type?: string
          created_at?: string
          currency?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          key_terms?: Json
          notes?: string
          participant_id?: string | null
          project_id: string
          rights_granted?: string
          source?: string
          status?: string
          term_years?: string
          territory?: string
          title?: string
          total_value?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          contract_type?: string
          created_at?: string
          currency?: string
          executed_at?: string | null
          expires_at?: string | null
          id?: string
          key_terms?: Json
          notes?: string
          participant_id?: string | null
          project_id?: string
          rights_granted?: string
          source?: string
          status?: string
          term_years?: string
          territory?: string
          title?: string
          total_value?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_contracts_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "project_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_copro_scenarios: {
        Row: {
          contributions: string
          copro_framework_id: string | null
          created_at: string
          eligibility_status: string
          id: string
          notes: string
          project_id: string
          proposed_splits: Json
          risks: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contributions?: string
          copro_framework_id?: string | null
          created_at?: string
          eligibility_status?: string
          id?: string
          notes?: string
          project_id: string
          proposed_splits?: Json
          risks?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contributions?: string
          copro_framework_id?: string | null
          created_at?: string
          eligibility_status?: string
          id?: string
          notes?: string
          project_id?: string
          proposed_splits?: Json
          risks?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_copro_scenarios_copro_framework_id_fkey"
            columns: ["copro_framework_id"]
            isOneToOne: false
            referencedRelation: "copro_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cost_entries: {
        Row: {
          amount: number
          budget_id: string | null
          category: string
          created_at: string
          description: string
          entry_date: string
          id: string
          notes: string
          project_id: string
          receipt_ref: string
          updated_at: string
          user_id: string
          vendor: string
        }
        Insert: {
          amount?: number
          budget_id?: string | null
          category?: string
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          notes?: string
          project_id: string
          receipt_ref?: string
          updated_at?: string
          user_id: string
          vendor?: string
        }
        Update: {
          amount?: number
          budget_id?: string | null
          category?: string
          created_at?: string
          description?: string
          entry_date?: string
          id?: string
          notes?: string
          project_id?: string
          receipt_ref?: string
          updated_at?: string
          user_id?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cost_entries_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "project_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      project_coverage_runs: {
        Row: {
          commercial_score: number | null
          confidence: number | null
          contradictions: Json | null
          created_at: string
          creative_score: number | null
          id: string
          missing_docs: Json | null
          model: string | null
          narrative_score: number | null
          output: Json
          project_id: string
          risk_flags: Json | null
          status: string
          subject_id: string
        }
        Insert: {
          commercial_score?: number | null
          confidence?: number | null
          contradictions?: Json | null
          created_at?: string
          creative_score?: number | null
          id?: string
          missing_docs?: Json | null
          model?: string | null
          narrative_score?: number | null
          output?: Json
          project_id: string
          risk_flags?: Json | null
          status?: string
          subject_id: string
        }
        Update: {
          commercial_score?: number | null
          confidence?: number | null
          contradictions?: Json | null
          created_at?: string
          creative_score?: number | null
          id?: string
          missing_docs?: Json | null
          model?: string | null
          narrative_score?: number | null
          output?: Json
          project_id?: string
          risk_flags?: Json | null
          status?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_coverage_runs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "project_coverage_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_coverage_subjects: {
        Row: {
          bundle_document_version_ids: Json | null
          bundle_key: string | null
          bundle_name: string | null
          bundle_rules: Json | null
          created_at: string
          document_version_id: string | null
          id: string
          project_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          bundle_document_version_ids?: Json | null
          bundle_key?: string | null
          bundle_name?: string | null
          bundle_rules?: Json | null
          created_at?: string
          document_version_id?: string | null
          id?: string
          project_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          bundle_document_version_ids?: Json | null
          bundle_key?: string | null
          bundle_name?: string | null
          bundle_rules?: Json | null
          created_at?: string
          document_version_id?: string | null
          id?: string
          project_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_coverage_subjects_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_deadlines: {
        Row: {
          completed: boolean
          created_at: string
          deadline_type: string
          due_date: string
          id: string
          label: string
          notes: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          deadline_type?: string
          due_date: string
          id?: string
          label?: string
          notes?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          deadline_type?: string
          due_date?: string
          id?: string
          label?: string
          notes?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_deals: {
        Row: {
          buyer_name: string
          closed_at: string | null
          created_at: string
          currency: string
          deal_type: string
          id: string
          minimum_guarantee: string
          notes: string
          offered_at: string | null
          project_id: string
          status: string
          territory: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_name?: string
          closed_at?: string | null
          created_at?: string
          currency?: string
          deal_type?: string
          id?: string
          minimum_guarantee?: string
          notes?: string
          offered_at?: string | null
          project_id: string
          status?: string
          territory?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_name?: string
          closed_at?: string | null
          created_at?: string
          currency?: string
          deal_type?: string
          id?: string
          minimum_guarantee?: string
          notes?: string
          offered_at?: string | null
          project_id?: string
          status?: string
          territory?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_decisions: {
        Row: {
          applied_to_metadata_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          context: string
          created_at: string
          decided_at: string
          decision: string
          decision_type: string
          field_path: string | null
          id: string
          new_value: Json | null
          outcome: string
          project_id: string
          reasoning: string
          resulting_resolver_hash: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_to_metadata_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          context?: string
          created_at?: string
          decided_at?: string
          decision?: string
          decision_type?: string
          field_path?: string | null
          id?: string
          new_value?: Json | null
          outcome?: string
          project_id: string
          reasoning?: string
          resulting_resolver_hash?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_to_metadata_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          context?: string
          created_at?: string
          decided_at?: string
          decision?: string
          decision_type?: string
          field_path?: string | null
          id?: string
          new_value?: Json | null
          outcome?: string
          project_id?: string
          reasoning?: string
          resulting_resolver_hash?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_deferred_notes: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          due_when: Json | null
          id: string
          last_checked_at: string | null
          last_seen_in_doc_type: string | null
          note_json: Json
          note_key: string
          pinned: boolean
          project_id: string
          resolution_method: string | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_in_stage: string | null
          severity: string | null
          source_doc_type: string
          source_version_id: string | null
          status: string
          suggested_fixes: Json | null
          target_deliverable_type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          due_when?: Json | null
          id?: string
          last_checked_at?: string | null
          last_seen_in_doc_type?: string | null
          note_json?: Json
          note_key?: string
          pinned?: boolean
          project_id: string
          resolution_method?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_in_stage?: string | null
          severity?: string | null
          source_doc_type?: string
          source_version_id?: string | null
          status?: string
          suggested_fixes?: Json | null
          target_deliverable_type?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          due_when?: Json | null
          id?: string
          last_checked_at?: string | null
          last_seen_in_doc_type?: string | null
          note_json?: Json
          note_key?: string
          pinned?: boolean
          project_id?: string
          resolution_method?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_in_stage?: string | null
          severity?: string | null
          source_doc_type?: string
          source_version_id?: string | null
          status?: string
          suggested_fixes?: Json | null
          target_deliverable_type?: string
        }
        Relationships: []
      }
      project_deliverables: {
        Row: {
          buyer_name: string
          created_at: string
          deliverable_type: string
          due_date: string | null
          format_spec: string
          id: string
          item_name: string
          notes: string
          project_id: string
          rights_window: string
          status: string
          territory: string
          updated_at: string
          user_id: string
        }
        Insert: {
          buyer_name?: string
          created_at?: string
          deliverable_type?: string
          due_date?: string | null
          format_spec?: string
          id?: string
          item_name?: string
          notes?: string
          project_id: string
          rights_window?: string
          status?: string
          territory?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          buyer_name?: string
          created_at?: string
          deliverable_type?: string
          due_date?: string | null
          format_spec?: string
          id?: string
          item_name?: string
          notes?: string
          project_id?: string
          rights_window?: string
          status?: string
          territory?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_dev_decision_state: {
        Row: {
          anchor: string | null
          chosen_option_id: string | null
          created_at: string
          decision_id: string
          doc_type: string
          episode_number: number | null
          goal: string
          id: string
          option_json: Json
          project_id: string
          scope_json: Json
          status: string
          updated_at: string
        }
        Insert: {
          anchor?: string | null
          chosen_option_id?: string | null
          created_at?: string
          decision_id: string
          doc_type: string
          episode_number?: number | null
          goal: string
          id?: string
          option_json?: Json
          project_id: string
          scope_json?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          anchor?: string | null
          chosen_option_id?: string | null
          created_at?: string
          decision_id?: string
          doc_type?: string
          episode_number?: number | null
          goal?: string
          id?: string
          option_json?: Json
          project_id?: string
          scope_json?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_dev_note_state: {
        Row: {
          anchor: string | null
          canon_hash: string | null
          conflict_json: Json | null
          conflict_resolution_type: string | null
          conflicts_with: string[]
          constraint_key: string | null
          created_at: string
          defer_to_doc_type: string | null
          depends_on: string[]
          doc_type: string
          episode_number: number | null
          first_seen_at: string
          id: string
          intent_label: string | null
          last_applied_version_id: string | null
          last_seen_at: string
          last_version_id: string | null
          lock_reason: string | null
          note_cluster_id: string
          note_fingerprint: string
          objective: string | null
          project_id: string
          scope_json: Json
          section: string | null
          severity: number
          status: string
          tier: string
          times_seen: number
          updated_at: string
          waive_reason: string | null
          witness_json: Json | null
        }
        Insert: {
          anchor?: string | null
          canon_hash?: string | null
          conflict_json?: Json | null
          conflict_resolution_type?: string | null
          conflicts_with?: string[]
          constraint_key?: string | null
          created_at?: string
          defer_to_doc_type?: string | null
          depends_on?: string[]
          doc_type: string
          episode_number?: number | null
          first_seen_at?: string
          id?: string
          intent_label?: string | null
          last_applied_version_id?: string | null
          last_seen_at?: string
          last_version_id?: string | null
          lock_reason?: string | null
          note_cluster_id: string
          note_fingerprint: string
          objective?: string | null
          project_id: string
          scope_json?: Json
          section?: string | null
          severity?: number
          status?: string
          tier?: string
          times_seen?: number
          updated_at?: string
          waive_reason?: string | null
          witness_json?: Json | null
        }
        Update: {
          anchor?: string | null
          canon_hash?: string | null
          conflict_json?: Json | null
          conflict_resolution_type?: string | null
          conflicts_with?: string[]
          constraint_key?: string | null
          created_at?: string
          defer_to_doc_type?: string | null
          depends_on?: string[]
          doc_type?: string
          episode_number?: number | null
          first_seen_at?: string
          id?: string
          intent_label?: string | null
          last_applied_version_id?: string | null
          last_seen_at?: string
          last_version_id?: string | null
          lock_reason?: string | null
          note_cluster_id?: string
          note_fingerprint?: string
          objective?: string | null
          project_id?: string
          scope_json?: Json
          section?: string | null
          severity?: number
          status?: string
          tier?: string
          times_seen?: number
          updated_at?: string
          waive_reason?: string | null
          witness_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_dev_note_state_last_applied_version_id_fkey"
            columns: ["last_applied_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dev_note_state_last_version_id_fkey"
            columns: ["last_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_doc_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          doc_type: string
          embedding: string | null
          id: string
          project_id: string
          search_vector: unknown
          version_id: string
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          doc_type: string
          embedding?: string | null
          id?: string
          project_id: string
          search_vector?: unknown
          version_id: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          doc_type?: string
          embedding?: string | null
          id?: string
          project_id?: string
          search_vector?: unknown
          version_id?: string
        }
        Relationships: []
      }
      project_doc_set_items: {
        Row: {
          created_at: string
          doc_set_id: string
          document_id: string
          id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          doc_set_id: string
          document_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          doc_set_id?: string
          document_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_doc_set_items_doc_set_id_fkey"
            columns: ["doc_set_id"]
            isOneToOne: false
            referencedRelation: "project_doc_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_doc_set_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_doc_sets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_document_chunks: {
        Row: {
          attempts: number
          char_count: number | null
          chunk_index: number
          chunk_key: string
          content: string | null
          created_at: string
          document_id: string
          error: string | null
          id: string
          meta_json: Json | null
          status: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          attempts?: number
          char_count?: number | null
          chunk_index: number
          chunk_key?: string
          content?: string | null
          created_at?: string
          document_id: string
          error?: string | null
          id?: string
          meta_json?: Json | null
          status?: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          attempts?: number
          char_count?: number | null
          chunk_index?: number
          chunk_key?: string
          content?: string | null
          created_at?: string
          document_id?: string
          error?: string | null
          id?: string
          meta_json?: Json | null
          status?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_chunks_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_document_versions: {
        Row: {
          applied_change_plan: Json | null
          applied_change_plan_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          assembled_chunk_count: number | null
          assembled_from_chunks: boolean | null
          branch_id: string | null
          change_summary: string | null
          content_hash: string | null
          created_at: string
          created_by: string
          criteria_hash: string | null
          criteria_json: Json | null
          deliverable_type: string | null
          depends_on: Json | null
          depends_on_resolver_hash: string | null
          document_id: string
          drift_snapshot: Json | null
          generator_id: string | null
          generator_run_id: string | null
          id: string
          inherited_core: Json | null
          inputs_used: Json | null
          is_current: boolean
          is_stale: boolean | null
          label: string | null
          measured_metrics_json: Json | null
          meta_json: Json | null
          parent_version_id: string | null
          plaintext: string
          producer_note_id: string | null
          reconciliation_source: Json | null
          source_decision_ids: Json | null
          source_document_ids: Json | null
          source_run_id: string | null
          stage: string | null
          stale_reason: string | null
          status: string | null
          style_template_version_id: string | null
          superseded_at: string | null
          superseded_by: string | null
          verification_json: Json | null
          version_number: number
        }
        Insert: {
          applied_change_plan?: Json | null
          applied_change_plan_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assembled_chunk_count?: number | null
          assembled_from_chunks?: boolean | null
          branch_id?: string | null
          change_summary?: string | null
          content_hash?: string | null
          created_at?: string
          created_by: string
          criteria_hash?: string | null
          criteria_json?: Json | null
          deliverable_type?: string | null
          depends_on?: Json | null
          depends_on_resolver_hash?: string | null
          document_id: string
          drift_snapshot?: Json | null
          generator_id?: string | null
          generator_run_id?: string | null
          id?: string
          inherited_core?: Json | null
          inputs_used?: Json | null
          is_current?: boolean
          is_stale?: boolean | null
          label?: string | null
          measured_metrics_json?: Json | null
          meta_json?: Json | null
          parent_version_id?: string | null
          plaintext?: string
          producer_note_id?: string | null
          reconciliation_source?: Json | null
          source_decision_ids?: Json | null
          source_document_ids?: Json | null
          source_run_id?: string | null
          stage?: string | null
          stale_reason?: string | null
          status?: string | null
          style_template_version_id?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          verification_json?: Json | null
          version_number?: number
        }
        Update: {
          applied_change_plan?: Json | null
          applied_change_plan_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          assembled_chunk_count?: number | null
          assembled_from_chunks?: boolean | null
          branch_id?: string | null
          change_summary?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          criteria_hash?: string | null
          criteria_json?: Json | null
          deliverable_type?: string | null
          depends_on?: Json | null
          depends_on_resolver_hash?: string | null
          document_id?: string
          drift_snapshot?: Json | null
          generator_id?: string | null
          generator_run_id?: string | null
          id?: string
          inherited_core?: Json | null
          inputs_used?: Json | null
          is_current?: boolean
          is_stale?: boolean | null
          label?: string | null
          measured_metrics_json?: Json | null
          meta_json?: Json | null
          parent_version_id?: string | null
          plaintext?: string
          producer_note_id?: string | null
          reconciliation_source?: Json | null
          source_decision_ids?: Json | null
          source_document_ids?: Json | null
          source_run_id?: string | null
          stage?: string | null
          stale_reason?: string | null
          status?: string | null
          style_template_version_id?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          verification_json?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_document_versions_applied_change_plan_id_fkey"
            columns: ["applied_change_plan_id"]
            isOneToOne: false
            referencedRelation: "note_change_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_versions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "development_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_versions_producer_note_id_fkey"
            columns: ["producer_note_id"]
            isOneToOne: false
            referencedRelation: "producer_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_document_versions_style_template_version_id_fkey"
            columns: ["style_template_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          char_count: number | null
          created_at: string
          display_name: string | null
          doc_role: string
          doc_type: string
          error_message: string | null
          extracted_text: string | null
          extraction_status: string
          file_name: string
          file_path: string
          id: string
          ingestion_source: string | null
          is_out_of_date: boolean | null
          is_primary: boolean
          last_compiled_at: string | null
          latest_export_path: string | null
          latest_version_id: string | null
          meta_json: Json | null
          needs_reconcile: boolean
          pages_analyzed: number | null
          plaintext: string | null
          project_id: string | null
          reconcile_reasons: Json | null
          source: string | null
          storage_path: string | null
          title: string | null
          total_pages: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          char_count?: number | null
          created_at?: string
          display_name?: string | null
          doc_role?: string
          doc_type?: string
          error_message?: string | null
          extracted_text?: string | null
          extraction_status?: string
          file_name?: string
          file_path?: string
          id?: string
          ingestion_source?: string | null
          is_out_of_date?: boolean | null
          is_primary?: boolean
          last_compiled_at?: string | null
          latest_export_path?: string | null
          latest_version_id?: string | null
          meta_json?: Json | null
          needs_reconcile?: boolean
          pages_analyzed?: number | null
          plaintext?: string | null
          project_id?: string | null
          reconcile_reasons?: Json | null
          source?: string | null
          storage_path?: string | null
          title?: string | null
          total_pages?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          char_count?: number | null
          created_at?: string
          display_name?: string | null
          doc_role?: string
          doc_type?: string
          error_message?: string | null
          extracted_text?: string | null
          extraction_status?: string
          file_name?: string
          file_path?: string
          id?: string
          ingestion_source?: string | null
          is_out_of_date?: boolean | null
          is_primary?: boolean
          last_compiled_at?: string | null
          latest_export_path?: string | null
          latest_version_id?: string | null
          meta_json?: Json | null
          needs_reconcile?: boolean
          pages_analyzed?: number | null
          plaintext?: string | null
          project_id?: string | null
          reconcile_reasons?: Json | null
          source?: string | null
          storage_path?: string | null
          title?: string | null
          total_pages?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_latest_version_id_fkey"
            columns: ["latest_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_engine_scores: {
        Row: {
          confidence: string
          created_at: string
          engine_id: string
          id: string
          last_scored_at: string
          notes: string
          project_id: string
          score: number
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          engine_id: string
          id?: string
          last_scored_at?: string
          notes?: string
          project_id: string
          score?: number
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          engine_id?: string
          id?: string
          last_scored_at?: string
          notes?: string
          project_id?: string
          score?: number
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_engine_scores_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "trend_engines"
            referencedColumns: ["id"]
          },
        ]
      }
      project_finance_scenarios: {
        Row: {
          confidence: string
          created_at: string
          equity_amount: string
          gap_amount: string
          id: string
          incentive_amount: string
          notes: string
          other_sources: string
          presales_amount: string
          project_id: string
          scenario_name: string
          total_budget: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          equity_amount?: string
          gap_amount?: string
          id?: string
          incentive_amount?: string
          notes?: string
          other_sources?: string
          presales_amount?: string
          project_id: string
          scenario_name?: string
          total_budget?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          equity_amount?: string
          gap_amount?: string
          id?: string
          incentive_amount?: string
          notes?: string
          other_sources?: string
          presales_amount?: string
          project_id?: string
          scenario_name?: string
          total_budget?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_finance_snapshots: {
        Row: {
          baseline_budget: Json | null
          created_at: string
          currency: string | null
          delivery_summary: Json | null
          id: string
          import_id: string | null
          latest_cost_report: Json | null
          payroll_summary: Json | null
          project_id: string
          schedule_summary: Json | null
          snapshot_date: string
          snapshot_type: string
          user_id: string
        }
        Insert: {
          baseline_budget?: Json | null
          created_at?: string
          currency?: string | null
          delivery_summary?: Json | null
          id?: string
          import_id?: string | null
          latest_cost_report?: Json | null
          payroll_summary?: Json | null
          project_id: string
          schedule_summary?: Json | null
          snapshot_date?: string
          snapshot_type: string
          user_id: string
        }
        Update: {
          baseline_budget?: Json | null
          created_at?: string
          currency?: string | null
          delivery_summary?: Json | null
          id?: string
          import_id?: string | null
          latest_cost_report?: Json | null
          payroll_summary?: Json | null
          project_id?: string
          schedule_summary?: Json | null
          snapshot_date?: string
          snapshot_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_finance_snapshots_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "integration_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      project_hods: {
        Row: {
          agency: string
          agent_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          department: string
          id: string
          imdb_id: string
          known_for: string
          manager_name: string
          notes: string
          person_name: string
          project_id: string
          reputation_tier: string
          status: string
          tmdb_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency?: string
          agent_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          department?: string
          id?: string
          imdb_id?: string
          known_for?: string
          manager_name?: string
          notes?: string
          person_name?: string
          project_id: string
          reputation_tier?: string
          status?: string
          tmdb_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency?: string
          agent_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          department?: string
          id?: string
          imdb_id?: string
          known_for?: string
          manager_name?: string
          notes?: string
          person_name?: string
          project_id?: string
          reputation_tier?: string
          status?: string
          tmdb_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_images: {
        Row: {
          actual_height: number | null
          actual_width: number | null
          ai_actor_ids: string[] | null
          ai_actor_version_ids: string[] | null
          api_responses: Json | null
          aspect_compliant: boolean | null
          aspect_drift: boolean | null
          asset_group: string | null
          auto_complete_context: Json | null
          batch_index: number | null
          bound_dna_version_ids: string[] | null
          camera_language_hash: string | null
          canon_constraints: Json
          canon_location_id: string | null
          canonical_binding_missing: string[] | null
          canonical_binding_status: string | null
          composition_rule: string | null
          composition_rule_hash: string | null
          created_at: string
          created_by: string | null
          curation_state: string | null
          dataset_provenance: Json | null
          dims_source: string | null
          entity_id: string | null
          expected_character_count: number | null
          face_detected: boolean | null
          freshness_status: string
          generation_config: Json | null
          generation_purpose: string | null
          height: number | null
          id: string
          identity_anchors_count: number | null
          identity_canon_facts_used: string | null
          identity_full_body_anchor_used: string | null
          identity_headshot_anchor_used: string | null
          identity_lock_strength: number | null
          identity_locked: boolean | null
          identity_mode: string | null
          identity_notes_used: string | null
          identity_signature_used: string | null
          identity_sources: string[] | null
          identity_traits_used: number | null
          image_url: string | null
          is_active: boolean
          is_primary: boolean
          lane_key: string | null
          location_ref: string | null
          model: string | null
          narrative_source: string | null
          negative_prompt: string
          nsfw_score: number | null
          pass: boolean | null
          premium_eligible: boolean | null
          prestige_style: string | null
          production_design_architecture: string | null
          production_design_hash: string | null
          project_id: string
          prompt_override_length: number | null
          prompt_override_used: boolean | null
          prompt_used: string
          provider: string | null
          quality_reasons: string[] | null
          quality_rejection_codes: string[] | null
          quality_score: number | null
          quality_status: string | null
          quality_warnings: string[] | null
          requested_aspect_ratio: string | null
          requested_character_names: string[] | null
          requested_height: number | null
          requested_location_ids: string[] | null
          requested_shot_type: string | null
          requested_width: number | null
          requirement_ids: string[] | null
          resolved_character_names: string[] | null
          resolved_location_ids: string[] | null
          resolved_location_names: string[] | null
          role: Database["public"]["Enums"]["project_image_role"]
          shot_intent: string | null
          shot_intent_slide_type: string | null
          shot_list_camera_movement: string | null
          shot_list_context_used: boolean | null
          shot_list_framing: string | null
          shot_list_id: string | null
          shot_list_item_ids: string[] | null
          shot_list_location: string | null
          shot_list_time_of_day: string | null
          shot_type: string | null
          slide_type: string | null
          source_feature: string | null
          source_poster_id: string | null
          stale_reason: string | null
          state_key: string | null
          state_label: string | null
          state_variant_used: string | null
          storage_bucket: string
          storage_path: string
          strategy_key: string | null
          style_lock_active: boolean | null
          style_lock_hash: string | null
          style_mode: string | null
          subject: string | null
          subject_ref: string | null
          subject_type: string | null
          target_requirement_id: string | null
          targeting_mode: string | null
          truth_snapshot_json: Json | null
          user_id: string | null
          variant_index: number | null
          vertical_drama_project: boolean | null
          width: number | null
          world_binding_active: boolean | null
          world_binding_era: string | null
        }
        Insert: {
          actual_height?: number | null
          actual_width?: number | null
          ai_actor_ids?: string[] | null
          ai_actor_version_ids?: string[] | null
          api_responses?: Json | null
          aspect_compliant?: boolean | null
          aspect_drift?: boolean | null
          asset_group?: string | null
          auto_complete_context?: Json | null
          batch_index?: number | null
          bound_dna_version_ids?: string[] | null
          camera_language_hash?: string | null
          canon_constraints?: Json
          canon_location_id?: string | null
          canonical_binding_missing?: string[] | null
          canonical_binding_status?: string | null
          composition_rule?: string | null
          composition_rule_hash?: string | null
          created_at?: string
          created_by?: string | null
          curation_state?: string | null
          dataset_provenance?: Json | null
          dims_source?: string | null
          entity_id?: string | null
          expected_character_count?: number | null
          face_detected?: boolean | null
          freshness_status?: string
          generation_config?: Json | null
          generation_purpose?: string | null
          height?: number | null
          id?: string
          identity_anchors_count?: number | null
          identity_canon_facts_used?: string | null
          identity_full_body_anchor_used?: string | null
          identity_headshot_anchor_used?: string | null
          identity_lock_strength?: number | null
          identity_locked?: boolean | null
          identity_mode?: string | null
          identity_notes_used?: string | null
          identity_signature_used?: string | null
          identity_sources?: string[] | null
          identity_traits_used?: number | null
          image_url?: string | null
          is_active?: boolean
          is_primary?: boolean
          lane_key?: string | null
          location_ref?: string | null
          model?: string | null
          narrative_source?: string | null
          negative_prompt?: string
          nsfw_score?: number | null
          pass?: boolean | null
          premium_eligible?: boolean | null
          prestige_style?: string | null
          production_design_architecture?: string | null
          production_design_hash?: string | null
          project_id: string
          prompt_override_length?: number | null
          prompt_override_used?: boolean | null
          prompt_used?: string
          provider?: string | null
          quality_reasons?: string[] | null
          quality_rejection_codes?: string[] | null
          quality_score?: number | null
          quality_status?: string | null
          quality_warnings?: string[] | null
          requested_aspect_ratio?: string | null
          requested_character_names?: string[] | null
          requested_height?: number | null
          requested_location_ids?: string[] | null
          requested_shot_type?: string | null
          requested_width?: number | null
          requirement_ids?: string[] | null
          resolved_character_names?: string[] | null
          resolved_location_ids?: string[] | null
          resolved_location_names?: string[] | null
          role: Database["public"]["Enums"]["project_image_role"]
          shot_intent?: string | null
          shot_intent_slide_type?: string | null
          shot_list_camera_movement?: string | null
          shot_list_context_used?: boolean | null
          shot_list_framing?: string | null
          shot_list_id?: string | null
          shot_list_item_ids?: string[] | null
          shot_list_location?: string | null
          shot_list_time_of_day?: string | null
          shot_type?: string | null
          slide_type?: string | null
          source_feature?: string | null
          source_poster_id?: string | null
          stale_reason?: string | null
          state_key?: string | null
          state_label?: string | null
          state_variant_used?: string | null
          storage_bucket?: string
          storage_path: string
          strategy_key?: string | null
          style_lock_active?: boolean | null
          style_lock_hash?: string | null
          style_mode?: string | null
          subject?: string | null
          subject_ref?: string | null
          subject_type?: string | null
          target_requirement_id?: string | null
          targeting_mode?: string | null
          truth_snapshot_json?: Json | null
          user_id?: string | null
          variant_index?: number | null
          vertical_drama_project?: boolean | null
          width?: number | null
          world_binding_active?: boolean | null
          world_binding_era?: string | null
        }
        Update: {
          actual_height?: number | null
          actual_width?: number | null
          ai_actor_ids?: string[] | null
          ai_actor_version_ids?: string[] | null
          api_responses?: Json | null
          aspect_compliant?: boolean | null
          aspect_drift?: boolean | null
          asset_group?: string | null
          auto_complete_context?: Json | null
          batch_index?: number | null
          bound_dna_version_ids?: string[] | null
          camera_language_hash?: string | null
          canon_constraints?: Json
          canon_location_id?: string | null
          canonical_binding_missing?: string[] | null
          canonical_binding_status?: string | null
          composition_rule?: string | null
          composition_rule_hash?: string | null
          created_at?: string
          created_by?: string | null
          curation_state?: string | null
          dataset_provenance?: Json | null
          dims_source?: string | null
          entity_id?: string | null
          expected_character_count?: number | null
          face_detected?: boolean | null
          freshness_status?: string
          generation_config?: Json | null
          generation_purpose?: string | null
          height?: number | null
          id?: string
          identity_anchors_count?: number | null
          identity_canon_facts_used?: string | null
          identity_full_body_anchor_used?: string | null
          identity_headshot_anchor_used?: string | null
          identity_lock_strength?: number | null
          identity_locked?: boolean | null
          identity_mode?: string | null
          identity_notes_used?: string | null
          identity_signature_used?: string | null
          identity_sources?: string[] | null
          identity_traits_used?: number | null
          image_url?: string | null
          is_active?: boolean
          is_primary?: boolean
          lane_key?: string | null
          location_ref?: string | null
          model?: string | null
          narrative_source?: string | null
          negative_prompt?: string
          nsfw_score?: number | null
          pass?: boolean | null
          premium_eligible?: boolean | null
          prestige_style?: string | null
          production_design_architecture?: string | null
          production_design_hash?: string | null
          project_id?: string
          prompt_override_length?: number | null
          prompt_override_used?: boolean | null
          prompt_used?: string
          provider?: string | null
          quality_reasons?: string[] | null
          quality_rejection_codes?: string[] | null
          quality_score?: number | null
          quality_status?: string | null
          quality_warnings?: string[] | null
          requested_aspect_ratio?: string | null
          requested_character_names?: string[] | null
          requested_height?: number | null
          requested_location_ids?: string[] | null
          requested_shot_type?: string | null
          requested_width?: number | null
          requirement_ids?: string[] | null
          resolved_character_names?: string[] | null
          resolved_location_ids?: string[] | null
          resolved_location_names?: string[] | null
          role?: Database["public"]["Enums"]["project_image_role"]
          shot_intent?: string | null
          shot_intent_slide_type?: string | null
          shot_list_camera_movement?: string | null
          shot_list_context_used?: boolean | null
          shot_list_framing?: string | null
          shot_list_id?: string | null
          shot_list_item_ids?: string[] | null
          shot_list_location?: string | null
          shot_list_time_of_day?: string | null
          shot_type?: string | null
          slide_type?: string | null
          source_feature?: string | null
          source_poster_id?: string | null
          stale_reason?: string | null
          state_key?: string | null
          state_label?: string | null
          state_variant_used?: string | null
          storage_bucket?: string
          storage_path?: string
          strategy_key?: string | null
          style_lock_active?: boolean | null
          style_lock_hash?: string | null
          style_mode?: string | null
          subject?: string | null
          subject_ref?: string | null
          subject_type?: string | null
          target_requirement_id?: string | null
          targeting_mode?: string | null
          truth_snapshot_json?: Json | null
          user_id?: string | null
          variant_index?: number | null
          vertical_drama_project?: boolean | null
          width?: number | null
          world_binding_active?: boolean | null
          world_binding_era?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_incentive_scenarios: {
        Row: {
          blockers: string
          confidence: string
          created_at: string
          estimated_benefit: string
          estimated_qualifying_spend: string
          id: string
          incentive_program_id: string | null
          jurisdiction: string
          next_steps: string
          notes: string
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blockers?: string
          confidence?: string
          created_at?: string
          estimated_benefit?: string
          estimated_qualifying_spend?: string
          id?: string
          incentive_program_id?: string | null
          jurisdiction?: string
          next_steps?: string
          notes?: string
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blockers?: string
          confidence?: string
          created_at?: string
          estimated_benefit?: string
          estimated_qualifying_spend?: string
          id?: string
          incentive_program_id?: string | null
          jurisdiction?: string
          next_steps?: string
          notes?: string
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_incentive_scenarios_incentive_program_id_fkey"
            columns: ["incentive_program_id"]
            isOneToOne: false
            referencedRelation: "incentive_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_intel_alignment: {
        Row: {
          alignment_score: number | null
          breakdown: Json | null
          buyer_fit_scores: Json | null
          contrarian_score: number | null
          convergence_matches: Json | null
          created_at: string
          format_fit_scores: Json | null
          id: string
          lane_fit_scores: Json | null
          opportunity_score: number | null
          project_id: string
          risk_score: number | null
          run_id: string | null
          top_signal_ids: string[] | null
        }
        Insert: {
          alignment_score?: number | null
          breakdown?: Json | null
          buyer_fit_scores?: Json | null
          contrarian_score?: number | null
          convergence_matches?: Json | null
          created_at?: string
          format_fit_scores?: Json | null
          id?: string
          lane_fit_scores?: Json | null
          opportunity_score?: number | null
          project_id: string
          risk_score?: number | null
          run_id?: string | null
          top_signal_ids?: string[] | null
        }
        Update: {
          alignment_score?: number | null
          breakdown?: Json | null
          buyer_fit_scores?: Json | null
          contrarian_score?: number | null
          convergence_matches?: Json | null
          created_at?: string
          format_fit_scores?: Json | null
          id?: string
          lane_fit_scores?: Json | null
          opportunity_score?: number | null
          project_id?: string
          risk_score?: number | null
          run_id?: string | null
          top_signal_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_intel_alignment_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "intel_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invite_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          max_uses?: number | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          token?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          token?: string
          use_count?: number
        }
        Relationships: []
      }
      project_issue_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          issue_id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          issue_id: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          issue_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_issue_events_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "project_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      project_issue_lifecycle_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          project_id: string
          source_row_id: string
          source_table: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          project_id: string
          source_row_id: string
          source_table: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
          source_row_id?: string
          source_table?: string
        }
        Relationships: []
      }
      project_issues: {
        Row: {
          anchor: string | null
          category: string
          created_at: string
          created_from_run_id: string | null
          detail: string
          doc_type: string
          doc_version_id: string | null
          evidence_snippet: string | null
          fingerprint: string
          id: string
          last_seen_run_id: string | null
          project_id: string
          resolution_mode: string
          severity: number
          staged_fix_choice: Json | null
          status: string
          summary: string
          updated_at: string
          verify_detail: string | null
          verify_status: string | null
        }
        Insert: {
          anchor?: string | null
          category: string
          created_at?: string
          created_from_run_id?: string | null
          detail: string
          doc_type: string
          doc_version_id?: string | null
          evidence_snippet?: string | null
          fingerprint: string
          id?: string
          last_seen_run_id?: string | null
          project_id: string
          resolution_mode?: string
          severity?: number
          staged_fix_choice?: Json | null
          status?: string
          summary: string
          updated_at?: string
          verify_detail?: string | null
          verify_status?: string | null
        }
        Update: {
          anchor?: string | null
          category?: string
          created_at?: string
          created_from_run_id?: string | null
          detail?: string
          doc_type?: string
          doc_version_id?: string | null
          evidence_snippet?: string | null
          fingerprint?: string
          id?: string
          last_seen_run_id?: string | null
          project_id?: string
          resolution_mode?: string
          severity?: number
          staged_fix_choice?: Json | null
          status?: string
          summary?: string
          updated_at?: string
          verify_detail?: string | null
          verify_status?: string | null
        }
        Relationships: []
      }
      project_lane_prefs: {
        Row: {
          id: string
          lane: string
          prefs: Json
          project_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          id?: string
          lane: string
          prefs?: Json
          project_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          id?: string
          lane?: string
          prefs?: Json
          project_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      project_note_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          note_id: string
          payload: Json
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          note_id: string
          payload?: Json
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          note_id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_note_events_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "project_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          anchor: Json | null
          applied_change_event_id: string | null
          category: string
          created_at: string
          created_by: string | null
          dependent_on_note_id: string | null
          destination_doc_type: string | null
          detail: string | null
          doc_type: string | null
          document_id: string | null
          id: string
          legacy_key: string | null
          project_id: string
          severity: string
          source: string
          status: string
          suggested_fixes: Json | null
          summary: string
          timing: string
          title: string
          updated_at: string
          updated_by: string | null
          version_id: string | null
        }
        Insert: {
          anchor?: Json | null
          applied_change_event_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          dependent_on_note_id?: string | null
          destination_doc_type?: string | null
          detail?: string | null
          doc_type?: string | null
          document_id?: string | null
          id?: string
          legacy_key?: string | null
          project_id: string
          severity?: string
          source?: string
          status?: string
          suggested_fixes?: Json | null
          summary: string
          timing?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string | null
        }
        Update: {
          anchor?: Json | null
          applied_change_event_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          dependent_on_note_id?: string | null
          destination_doc_type?: string | null
          detail?: string | null
          doc_type?: string | null
          document_id?: string | null
          id?: string
          legacy_key?: string | null
          project_id?: string
          severity?: string
          source?: string
          status?: string
          suggested_fixes?: Json | null
          summary?: string
          timing?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_dependent_on_note_id_fkey"
            columns: ["dependent_on_note_id"]
            isOneToOne: false
            referencedRelation: "project_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      project_outcomes: {
        Row: {
          budget_achieved: boolean | null
          budget_secured_amount: number | null
          development_time_months: number | null
          distribution_offer: boolean
          festival_selection: boolean
          financed: boolean
          id: string
          initial_commercial_score: number | null
          initial_finance_confidence: string | null
          initial_greenlight_verdict: string | null
          initial_structural_score: number | null
          notes: string | null
          optioned: boolean
          presales_secured: boolean | null
          project_id: string
          recorded_at: string
          recoup_achieved: boolean
          soft_money_secured: boolean
          streamer_interest: boolean
          talent_attached: boolean
          user_id: string
        }
        Insert: {
          budget_achieved?: boolean | null
          budget_secured_amount?: number | null
          development_time_months?: number | null
          distribution_offer?: boolean
          festival_selection?: boolean
          financed?: boolean
          id?: string
          initial_commercial_score?: number | null
          initial_finance_confidence?: string | null
          initial_greenlight_verdict?: string | null
          initial_structural_score?: number | null
          notes?: string | null
          optioned?: boolean
          presales_secured?: boolean | null
          project_id: string
          recorded_at?: string
          recoup_achieved?: boolean
          soft_money_secured?: boolean
          streamer_interest?: boolean
          talent_attached?: boolean
          user_id?: string
        }
        Update: {
          budget_achieved?: boolean | null
          budget_secured_amount?: number | null
          development_time_months?: number | null
          distribution_offer?: boolean
          festival_selection?: boolean
          financed?: boolean
          id?: string
          initial_commercial_score?: number | null
          initial_finance_confidence?: string | null
          initial_greenlight_verdict?: string | null
          initial_structural_score?: number | null
          notes?: string | null
          optioned?: boolean
          presales_secured?: boolean | null
          project_id?: string
          recorded_at?: string
          recoup_achieved?: boolean
          soft_money_secured?: boolean
          streamer_interest?: boolean
          talent_attached?: boolean
          user_id?: string
        }
        Relationships: []
      }
      project_ownership_stakes: {
        Row: {
          conditions: string
          contract_id: string | null
          created_at: string
          id: string
          notes: string
          participant_id: string | null
          percentage: number
          project_id: string
          rights_type: string
          source: string
          stake_type: string
          territory: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          conditions?: string
          contract_id?: string | null
          created_at?: string
          id?: string
          notes?: string
          participant_id?: string | null
          percentage?: number
          project_id: string
          rights_type?: string
          source?: string
          stake_type?: string
          territory?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          conditions?: string
          contract_id?: string | null
          created_at?: string
          id?: string
          notes?: string
          participant_id?: string | null
          percentage?: number
          project_id?: string
          rights_type?: string
          source?: string
          stake_type?: string
          territory?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_ownership_stakes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_ownership_stakes_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "project_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_participants: {
        Row: {
          company: string
          contact_email: string
          created_at: string
          id: string
          notes: string
          participant_name: string
          participant_type: string
          project_id: string
          role_description: string
          source: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          company?: string
          contact_email?: string
          created_at?: string
          id?: string
          notes?: string
          participant_name?: string
          participant_type?: string
          project_id: string
          role_description?: string
          source?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          company?: string
          contact_email?: string
          created_at?: string
          id?: string
          notes?: string
          participant_name?: string
          participant_type?: string
          project_id?: string
          role_description?: string
          source?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      project_partners: {
        Row: {
          created_at: string
          id: string
          notes: string
          partner_name: string
          partner_type: string
          project_id: string
          status: string
          territory: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          partner_name?: string
          partner_type?: string
          project_id: string
          status?: string
          territory?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          partner_name?: string
          partner_type?: string
          project_id?: string
          status?: string
          territory?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_posters: {
        Row: {
          aspect_ratio: string
          created_at: string
          dependency_hash: string | null
          error_message: string | null
          freshness_status: string
          id: string
          is_active: boolean
          key_art_public_url: string | null
          key_art_storage_path: string | null
          layout_variant: string
          model: string | null
          project_id: string
          prompt_inputs: Json | null
          prompt_text: string | null
          provider: string | null
          render_status: string
          rendered_public_url: string | null
          rendered_storage_path: string | null
          source_type: string
          stale_reason: string | null
          truth_snapshot_json: Json | null
          updated_at: string
          user_id: string
          version_number: number
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          dependency_hash?: string | null
          error_message?: string | null
          freshness_status?: string
          id?: string
          is_active?: boolean
          key_art_public_url?: string | null
          key_art_storage_path?: string | null
          layout_variant?: string
          model?: string | null
          project_id: string
          prompt_inputs?: Json | null
          prompt_text?: string | null
          provider?: string | null
          render_status?: string
          rendered_public_url?: string | null
          rendered_storage_path?: string | null
          source_type?: string
          stale_reason?: string | null
          truth_snapshot_json?: Json | null
          updated_at?: string
          user_id: string
          version_number?: number
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          dependency_hash?: string | null
          error_message?: string | null
          freshness_status?: string
          id?: string
          is_active?: boolean
          key_art_public_url?: string | null
          key_art_storage_path?: string | null
          layout_variant?: string
          model?: string | null
          project_id?: string
          prompt_inputs?: Json | null
          prompt_text?: string | null
          provider?: string | null
          render_status?: string
          rendered_public_url?: string | null
          rendered_storage_path?: string | null
          source_type?: string
          stale_reason?: string | null
          truth_snapshot_json?: Json | null
          updated_at?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_posters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_posters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_preferences: {
        Row: {
          id: string
          owner_id: string
          prefs: Json
          project_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          prefs?: Json
          project_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          prefs?: Json
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_recoupment_scenarios: {
        Row: {
          created_at: string
          currency: string
          id: string
          notes: string
          project_id: string
          scenario_name: string
          total_revenue_estimate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string
          project_id: string
          scenario_name?: string
          total_revenue_estimate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          notes?: string
          project_id?: string
          scenario_name?: string
          total_revenue_estimate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_recoupment_tiers: {
        Row: {
          cap: number | null
          created_at: string
          fixed_amount: number
          id: string
          notes: string
          participant_name: string
          percentage: number
          project_id: string
          scenario_id: string
          tier_order: number
          tier_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cap?: number | null
          created_at?: string
          fixed_amount?: number
          id?: string
          notes?: string
          participant_name?: string
          percentage?: number
          project_id: string
          scenario_id: string
          tier_order?: number
          tier_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cap?: number | null
          created_at?: string
          fixed_amount?: number
          id?: string
          notes?: string
          participant_name?: string
          percentage?: number
          project_id?: string
          scenario_id?: string
          tier_order?: number
          tier_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_recoupment_tiers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_recoupment_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      project_scenarios: {
        Row: {
          coherence_flags: Json
          computed_state: Json
          created_at: string
          delta_vs_baseline: Json
          description: string | null
          governance: Json | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_locked: boolean
          is_recommended: boolean
          locked_at: string | null
          locked_by: string | null
          merge_policy: Json | null
          name: string
          override_log: Json
          pinned: boolean
          project_id: string
          protected_paths: string[]
          rank_breakdown: Json | null
          rank_score: number | null
          ranked_at: string | null
          scenario_type: string
          state_overrides: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          coherence_flags?: Json
          computed_state?: Json
          created_at?: string
          delta_vs_baseline?: Json
          description?: string | null
          governance?: Json | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_locked?: boolean
          is_recommended?: boolean
          locked_at?: string | null
          locked_by?: string | null
          merge_policy?: Json | null
          name?: string
          override_log?: Json
          pinned?: boolean
          project_id: string
          protected_paths?: string[]
          rank_breakdown?: Json | null
          rank_score?: number | null
          ranked_at?: string | null
          scenario_type?: string
          state_overrides?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          coherence_flags?: Json
          computed_state?: Json
          created_at?: string
          delta_vs_baseline?: Json
          description?: string | null
          governance?: Json | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_locked?: boolean
          is_recommended?: boolean
          locked_at?: string | null
          locked_by?: string | null
          merge_policy?: Json | null
          name?: string
          override_log?: Json
          pinned?: boolean
          project_id?: string
          protected_paths?: string[]
          rank_breakdown?: Json | null
          rank_score?: number | null
          ranked_at?: string | null
          scenario_type?: string
          state_overrides?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_scenes: {
        Row: {
          cast_members: string[]
          created_at: string
          description: string
          heading: string
          id: string
          int_ext: string
          location: string
          notes: string
          page_count: number | null
          project_id: string
          scene_number: string
          time_of_day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cast_members?: string[]
          created_at?: string
          description?: string
          heading: string
          id?: string
          int_ext?: string
          location?: string
          notes?: string
          page_count?: number | null
          project_id: string
          scene_number: string
          time_of_day?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cast_members?: string[]
          created_at?: string
          description?: string
          heading?: string
          id?: string
          int_ext?: string
          location?: string
          notes?: string
          page_count?: number | null
          project_id?: string
          scene_number?: string
          time_of_day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_scripts: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          notes: string
          project_id: string
          status: string
          updated_at: string
          user_id: string
          version_label: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          notes?: string
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
          version_label?: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          notes?: string
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          version_label?: string
        }
        Relationships: []
      }
      project_share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          project_id: string
          scope: string
          signed_url: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          project_id: string
          scope?: string
          signed_url?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          project_id?: string
          scope?: string
          signed_url?: string | null
          storage_path?: string | null
        }
        Relationships: []
      }
      project_share_pack_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          link_id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          link_id: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          link_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_share_pack_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "project_share_pack_links"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_pack_links: {
        Row: {
          created_at: string
          created_by: string
          download_count: number
          expires_at: string | null
          id: string
          is_revoked: boolean
          max_downloads: number | null
          password_hash: string | null
          share_pack_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          download_count?: number
          expires_at?: string | null
          id?: string
          is_revoked?: boolean
          max_downloads?: number | null
          password_hash?: string | null
          share_pack_id: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          download_count?: number
          expires_at?: string | null
          id?: string
          is_revoked?: boolean
          max_downloads?: number | null
          password_hash?: string | null
          share_pack_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_share_pack_links_share_pack_id_fkey"
            columns: ["share_pack_id"]
            isOneToOne: false
            referencedRelation: "project_share_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_packs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          include_contents: boolean
          include_cover: boolean
          name: string
          pack_type: string
          project_id: string
          selection: Json
          updated_at: string
          watermark_enabled: boolean
          watermark_text: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          include_contents?: boolean
          include_cover?: boolean
          name?: string
          pack_type?: string
          project_id: string
          selection?: Json
          updated_at?: string
          watermark_enabled?: boolean
          watermark_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          include_contents?: boolean
          include_cover?: boolean
          name?: string
          pack_type?: string
          project_id?: string
          selection?: Json
          updated_at?: string
          watermark_enabled?: boolean
          watermark_text?: string | null
        }
        Relationships: []
      }
      project_shares: {
        Row: {
          created_at: string
          email: string | null
          id: string
          invited_by: string
          project_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by: string
          project_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      project_signal_matches: {
        Row: {
          applied_to: Json
          cluster_id: string
          created_at: string
          id: string
          impact_score: number
          last_applied_at: string | null
          project_id: string
          rationale: Json
          relevance_score: number
        }
        Insert: {
          applied_to?: Json
          cluster_id: string
          created_at?: string
          id?: string
          impact_score?: number
          last_applied_at?: string | null
          project_id: string
          rationale?: Json
          relevance_score?: number
        }
        Update: {
          applied_to?: Json
          cluster_id?: string
          created_at?: string
          id?: string
          impact_score?: number
          last_applied_at?: string | null
          project_id?: string
          rationale?: Json
          relevance_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_signal_matches_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "trend_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      project_spines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          source_snapshot_id: string | null
          spine: Json
          stats: Json
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          project_id: string
          source_snapshot_id?: string | null
          spine?: Json
          stats?: Json
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          project_id?: string
          source_snapshot_id?: string | null
          spine?: Json
          stats?: Json
          status?: string
        }
        Relationships: []
      }
      project_state_graphs: {
        Row: {
          active_scenario_id: string | null
          active_scenario_set_at: string | null
          active_scenario_set_by: string | null
          assumption_multipliers: Json
          confidence_bands: Json
          created_at: string
          creative_state: Json
          execution_state: Json
          finance_state: Json
          id: string
          last_cascade_at: string | null
          production_state: Json
          project_id: string
          revenue_state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          active_scenario_id?: string | null
          active_scenario_set_at?: string | null
          active_scenario_set_by?: string | null
          assumption_multipliers?: Json
          confidence_bands?: Json
          created_at?: string
          creative_state?: Json
          execution_state?: Json
          finance_state?: Json
          id?: string
          last_cascade_at?: string | null
          production_state?: Json
          project_id: string
          revenue_state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          active_scenario_id?: string | null
          active_scenario_set_at?: string | null
          active_scenario_set_by?: string | null
          assumption_multipliers?: Json
          confidence_bands?: Json
          created_at?: string
          creative_state?: Json
          execution_state?: Json
          finance_state?: Json
          id?: string
          last_cascade_at?: string | null
          production_state?: Json
          project_id?: string
          revenue_state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_state_graphs_active_scenario_id_fkey"
            columns: ["active_scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      project_story_spines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          source: string
          spine: Json
          status: string
          summary: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          source?: string
          spine?: Json
          status?: string
          summary?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          source?: string
          spine?: Json
          status?: string
          summary?: string | null
          version?: number
        }
        Relationships: []
      }
      project_talent_triage: {
        Row: {
          commercial_case: string
          created_at: string
          creative_fit: string
          id: string
          image_url: string
          person_name: string
          person_type: string
          priority_rank: number | null
          project_id: string
          role_suggestion: string
          status: string
          suggestion_context: string
          suggestion_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commercial_case?: string
          created_at?: string
          creative_fit?: string
          id?: string
          image_url?: string
          person_name: string
          person_type?: string
          priority_rank?: number | null
          project_id: string
          role_suggestion?: string
          status?: string
          suggestion_context?: string
          suggestion_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commercial_case?: string
          created_at?: string
          creative_fit?: string
          id?: string
          image_url?: string
          person_name?: string
          person_type?: string
          priority_rank?: number | null
          project_id?: string
          role_suggestion?: string
          status?: string
          suggestion_context?: string
          suggestion_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_thread_ledgers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ledger: Json
          project_id: string
          status: string
          summary: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ledger?: Json
          project_id: string
          status?: string
          summary?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ledger?: Json
          project_id?: string
          status?: string
          summary?: string | null
          version?: number
        }
        Relationships: []
      }
      project_updates: {
        Row: {
          created_at: string
          description: string
          id: string
          impact_summary: string | null
          project_id: string
          title: string
          update_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          impact_summary?: string | null
          project_id: string
          title?: string
          update_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          impact_summary?: string | null
          project_id?: string
          title?: string
          update_type?: string
          user_id?: string
        }
        Relationships: []
      }
      project_vectors: {
        Row: {
          created_at: string
          embedding: string | null
          embedding_model: string | null
          id: string
          project_id: string
          source_hash: string | null
          source_len: number | null
          source_meta: Json | null
          vector_type: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          project_id: string
          source_hash?: string | null
          source_len?: number | null
          source_meta?: Json | null
          vector_type: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          project_id?: string
          source_hash?: string | null
          source_len?: number | null
          source_meta?: Json | null
          vector_type?: string
        }
        Relationships: []
      }
      project_visual_execution_provenance: {
        Row: {
          created_at: string
          error_message: string | null
          executed_at: string
          execution_number: number
          execution_state: string
          generated_asset_ids: string[] | null
          generation_input_hash: string | null
          governance_snapshot_hash: string | null
          id: string
          is_superseded: boolean
          previous_asset_ids: string[] | null
          previous_execution_id: string | null
          project_id: string
          recommended_action: string
          repair_intent_id: string
          result_summary: Json | null
          review_notes: string | null
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          stage_id: string
          stale_reason_snapshot: Json | null
          superseded_at: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          executed_at?: string
          execution_number: number
          execution_state: string
          generated_asset_ids?: string[] | null
          generation_input_hash?: string | null
          governance_snapshot_hash?: string | null
          id?: string
          is_superseded?: boolean
          previous_asset_ids?: string[] | null
          previous_execution_id?: string | null
          project_id: string
          recommended_action: string
          repair_intent_id: string
          result_summary?: Json | null
          review_notes?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id: string
          stale_reason_snapshot?: Json | null
          superseded_at?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          executed_at?: string
          execution_number?: number
          execution_state?: string
          generated_asset_ids?: string[] | null
          generation_input_hash?: string | null
          governance_snapshot_hash?: string | null
          id?: string
          is_superseded?: boolean
          previous_asset_ids?: string[] | null
          previous_execution_id?: string | null
          project_id?: string
          recommended_action?: string
          repair_intent_id?: string
          result_summary?: Json | null
          review_notes?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id?: string
          stale_reason_snapshot?: Json | null
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_visual_execution_provenance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_visual_execution_provenance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_visual_execution_provenance_repair_intent_id_fkey"
            columns: ["repair_intent_id"]
            isOneToOne: false
            referencedRelation: "project_visual_repair_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      project_visual_repair_intents: {
        Row: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          downstream_stages: string[] | null
          executed_at: string | null
          execution_result_json: Json | null
          execution_state: string
          id: string
          intent_detail: string | null
          intent_label: string | null
          project_id: string
          provenance_snapshot: Json | null
          recommended_action: string
          rejection_reason: string | null
          stage_id: string
          stale_reason_codes: string[]
        }
        Insert: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          downstream_stages?: string[] | null
          executed_at?: string | null
          execution_result_json?: Json | null
          execution_state?: string
          id?: string
          intent_detail?: string | null
          intent_label?: string | null
          project_id: string
          provenance_snapshot?: Json | null
          recommended_action: string
          rejection_reason?: string | null
          stage_id: string
          stale_reason_codes?: string[]
        }
        Update: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          downstream_stages?: string[] | null
          executed_at?: string | null
          execution_result_json?: Json | null
          execution_state?: string
          id?: string
          intent_detail?: string | null
          intent_label?: string | null
          project_id?: string
          provenance_snapshot?: Json | null
          recommended_action?: string
          rejection_reason?: string | null
          stage_id?: string
          stale_reason_codes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "project_visual_repair_intents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_visual_repair_intents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_visual_stage_governance: {
        Row: {
          blocker_codes: string[] | null
          computed_status: string
          eligibility_state: Json
          id: string
          last_evaluated_at: string
          project_id: string
          provenance_json: Json | null
          source_snapshot_hash: string
          stage_id: string
          stale_risk: Json | null
        }
        Insert: {
          blocker_codes?: string[] | null
          computed_status: string
          eligibility_state?: Json
          id?: string
          last_evaluated_at?: string
          project_id: string
          provenance_json?: Json | null
          source_snapshot_hash: string
          stage_id: string
          stale_risk?: Json | null
        }
        Update: {
          blocker_codes?: string[] | null
          computed_status?: string
          eligibility_state?: Json
          id?: string
          last_evaluated_at?: string
          project_id?: string
          provenance_json?: Json | null
          source_snapshot_hash?: string
          stage_id?: string
          stale_risk?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_visual_stage_governance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_visual_stage_governance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_visual_style: {
        Row: {
          camera_philosophy: string
          color_response: string
          composition_philosophy: string
          created_at: string
          created_by: string | null
          cultural_context: string
          environment_realism: string
          forbidden_traits: string[]
          id: string
          is_complete: boolean
          lighting_philosophy: string
          period: string
          project_id: string
          texture_materiality: string
          updated_at: string
        }
        Insert: {
          camera_philosophy?: string
          color_response?: string
          composition_philosophy?: string
          created_at?: string
          created_by?: string | null
          cultural_context?: string
          environment_realism?: string
          forbidden_traits?: string[]
          id?: string
          is_complete?: boolean
          lighting_philosophy?: string
          period?: string
          project_id: string
          texture_materiality?: string
          updated_at?: string
        }
        Update: {
          camera_philosophy?: string
          color_response?: string
          composition_philosophy?: string
          created_at?: string
          created_by?: string | null
          cultural_context?: string
          environment_realism?: string
          forbidden_traits?: string[]
          id?: string
          is_complete?: boolean
          lighting_philosophy?: string
          period?: string
          project_id?: string
          texture_materiality?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_visual_style_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_visual_style_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_waterfall_rules: {
        Row: {
          cap_amount: string
          conditions: string
          contract_id: string | null
          corridor_pct: number
          created_at: string
          id: string
          notes: string
          participant_id: string | null
          percentage: number
          position: number
          premium_pct: number
          project_id: string
          rule_name: string
          rule_type: string
          source: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          cap_amount?: string
          conditions?: string
          contract_id?: string | null
          corridor_pct?: number
          created_at?: string
          id?: string
          notes?: string
          participant_id?: string | null
          percentage?: number
          position?: number
          premium_pct?: number
          project_id: string
          rule_name?: string
          rule_type?: string
          source?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          cap_amount?: string
          conditions?: string
          contract_id?: string | null
          corridor_pct?: number
          created_at?: string
          id?: string
          notes?: string
          participant_id?: string | null
          percentage?: number
          position?: number
          premium_pct?: number
          project_id?: string
          rule_name?: string
          rule_type?: string
          source?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_waterfall_rules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "project_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_waterfall_rules_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "project_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_company_profile_id: string | null
          ai_production_mode: boolean
          analysis_passes: Json | null
          assigned_lane: string | null
          autorun_enabled: boolean
          autorun_trigger: string
          budget_range: string
          canon_version_id: string | null
          comparable_titles: string
          concept_lock_version: number | null
          confidence: number | null
          created_at: string
          criteria_json: Json | null
          current_stage: string | null
          default_prestige_style: string | null
          development_behavior: string | null
          devseed_pitch_idea_id: string | null
          document_urls: string[]
          episode_target_duration_max_seconds: number | null
          episode_target_duration_min_seconds: number | null
          episode_target_duration_seconds: number | null
          format: string
          genres: string[]
          guardrails_config: Json | null
          hero_image_url: string | null
          id: string
          incentive_insights: Json | null
          lifecycle_stage: string
          locked_fields: Json | null
          min_runtime_hard_floor: number | null
          min_runtime_minutes: number | null
          narrative_spine_json: Json | null
          packaging_mode: string
          packaging_stage: string
          pinned: boolean
          pipeline_stage: string
          primary_territory: string
          project_features: Json
          qualifications: Json | null
          reasoning: string | null
          recommendations: Json | null
          resolved_qualifications: Json | null
          resolved_qualifications_hash: string | null
          resolved_qualifications_version: number | null
          runtime_estimation_mode: string
          runtime_tolerance_pct: number
          script_coverage_verdict: string
          season_episode_count: number | null
          season_episode_count_locked: boolean
          season_episode_count_source: string | null
          season_style_profile: Json | null
          season_style_template_doc_type: string | null
          season_style_template_version_id: string | null
          secondary_territories: string[]
          signals_apply: Json
          signals_influence: number
          source_blueprint_family_key: string | null
          source_blueprint_id: string | null
          source_dna_profile_id: string | null
          source_engine_key: string | null
          source_pitch_idea_id: string | null
          target_audience: string
          target_runtime_minutes: number
          title: string
          tone: string
          trailer_bias_json: Json | null
          ui_mode_override: string | null
          updated_at: string
          user_id: string
          vertical_engine_weights: Json | null
          viability_breakdown: Json | null
        }
        Insert: {
          active_company_profile_id?: string | null
          ai_production_mode?: boolean
          analysis_passes?: Json | null
          assigned_lane?: string | null
          autorun_enabled?: boolean
          autorun_trigger?: string
          budget_range?: string
          canon_version_id?: string | null
          comparable_titles?: string
          concept_lock_version?: number | null
          confidence?: number | null
          created_at?: string
          criteria_json?: Json | null
          current_stage?: string | null
          default_prestige_style?: string | null
          development_behavior?: string | null
          devseed_pitch_idea_id?: string | null
          document_urls?: string[]
          episode_target_duration_max_seconds?: number | null
          episode_target_duration_min_seconds?: number | null
          episode_target_duration_seconds?: number | null
          format?: string
          genres?: string[]
          guardrails_config?: Json | null
          hero_image_url?: string | null
          id?: string
          incentive_insights?: Json | null
          lifecycle_stage?: string
          locked_fields?: Json | null
          min_runtime_hard_floor?: number | null
          min_runtime_minutes?: number | null
          narrative_spine_json?: Json | null
          packaging_mode?: string
          packaging_stage?: string
          pinned?: boolean
          pipeline_stage?: string
          primary_territory?: string
          project_features?: Json
          qualifications?: Json | null
          reasoning?: string | null
          recommendations?: Json | null
          resolved_qualifications?: Json | null
          resolved_qualifications_hash?: string | null
          resolved_qualifications_version?: number | null
          runtime_estimation_mode?: string
          runtime_tolerance_pct?: number
          script_coverage_verdict?: string
          season_episode_count?: number | null
          season_episode_count_locked?: boolean
          season_episode_count_source?: string | null
          season_style_profile?: Json | null
          season_style_template_doc_type?: string | null
          season_style_template_version_id?: string | null
          secondary_territories?: string[]
          signals_apply?: Json
          signals_influence?: number
          source_blueprint_family_key?: string | null
          source_blueprint_id?: string | null
          source_dna_profile_id?: string | null
          source_engine_key?: string | null
          source_pitch_idea_id?: string | null
          target_audience?: string
          target_runtime_minutes?: number
          title: string
          tone?: string
          trailer_bias_json?: Json | null
          ui_mode_override?: string | null
          updated_at?: string
          user_id: string
          vertical_engine_weights?: Json | null
          viability_breakdown?: Json | null
        }
        Update: {
          active_company_profile_id?: string | null
          ai_production_mode?: boolean
          analysis_passes?: Json | null
          assigned_lane?: string | null
          autorun_enabled?: boolean
          autorun_trigger?: string
          budget_range?: string
          canon_version_id?: string | null
          comparable_titles?: string
          concept_lock_version?: number | null
          confidence?: number | null
          created_at?: string
          criteria_json?: Json | null
          current_stage?: string | null
          default_prestige_style?: string | null
          development_behavior?: string | null
          devseed_pitch_idea_id?: string | null
          document_urls?: string[]
          episode_target_duration_max_seconds?: number | null
          episode_target_duration_min_seconds?: number | null
          episode_target_duration_seconds?: number | null
          format?: string
          genres?: string[]
          guardrails_config?: Json | null
          hero_image_url?: string | null
          id?: string
          incentive_insights?: Json | null
          lifecycle_stage?: string
          locked_fields?: Json | null
          min_runtime_hard_floor?: number | null
          min_runtime_minutes?: number | null
          narrative_spine_json?: Json | null
          packaging_mode?: string
          packaging_stage?: string
          pinned?: boolean
          pipeline_stage?: string
          primary_territory?: string
          project_features?: Json
          qualifications?: Json | null
          reasoning?: string | null
          recommendations?: Json | null
          resolved_qualifications?: Json | null
          resolved_qualifications_hash?: string | null
          resolved_qualifications_version?: number | null
          runtime_estimation_mode?: string
          runtime_tolerance_pct?: number
          script_coverage_verdict?: string
          season_episode_count?: number | null
          season_episode_count_locked?: boolean
          season_episode_count_source?: string | null
          season_style_profile?: Json | null
          season_style_template_doc_type?: string | null
          season_style_template_version_id?: string | null
          secondary_territories?: string[]
          signals_apply?: Json
          signals_influence?: number
          source_blueprint_family_key?: string | null
          source_blueprint_id?: string | null
          source_dna_profile_id?: string | null
          source_engine_key?: string | null
          source_pitch_idea_id?: string | null
          target_audience?: string
          target_runtime_minutes?: number
          title?: string
          tone?: string
          trailer_bias_json?: Json | null
          ui_mode_override?: string | null
          updated_at?: string
          user_id?: string
          vertical_engine_weights?: Json | null
          viability_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_canon_version_id_fkey"
            columns: ["canon_version_id"]
            isOneToOne: false
            referencedRelation: "project_canon_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_score_history: {
        Row: {
          created_at: string
          finance_readiness_score: number
          id: string
          project_id: string
          readiness_score: number
          snapshot_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          finance_readiness_score?: number
          id?: string
          project_id: string
          readiness_score?: number
          snapshot_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          finance_readiness_score?: number
          id?: string
          project_id?: string
          readiness_score?: number
          snapshot_date?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_flags: {
        Row: {
          cleared_at: string | null
          created_at: string | null
          downstream_doc_type: string
          downstream_doc_version_id: string
          entity_tag: string | null
          id: string
          project_id: string
          reason: string | null
          triggered_by_producer_note_id: string | null
        }
        Insert: {
          cleared_at?: string | null
          created_at?: string | null
          downstream_doc_type: string
          downstream_doc_version_id: string
          entity_tag?: string | null
          id?: string
          project_id: string
          reason?: string | null
          triggered_by_producer_note_id?: string | null
        }
        Update: {
          cleared_at?: string | null
          created_at?: string | null
          downstream_doc_type?: string
          downstream_doc_version_id?: string
          entity_tag?: string | null
          id?: string
          project_id?: string
          reason?: string | null
          triggered_by_producer_note_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_flags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "reconciliation_flags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_flags_triggered_by_producer_note_id_fkey"
            columns: ["triggered_by_producer_note_id"]
            isOneToOne: false
            referencedRelation: "producer_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      regen_job_items: {
        Row: {
          approved_version_id: string | null
          auto_approved: boolean | null
          char_after: number
          char_before: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_type: string
          document_id: string | null
          episode_index: number | null
          episode_title: string | null
          error: string | null
          id: string
          job_id: string
          meta_json: Json | null
          reason: string
          status: string
          target_doc_type: string | null
          updated_at: string
          upstream: string | null
        }
        Insert: {
          approved_version_id?: string | null
          auto_approved?: boolean | null
          char_after?: number
          char_before?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_type: string
          document_id?: string | null
          episode_index?: number | null
          episode_title?: string | null
          error?: string | null
          id?: string
          job_id: string
          meta_json?: Json | null
          reason: string
          status?: string
          target_doc_type?: string | null
          updated_at?: string
          upstream?: string | null
        }
        Update: {
          approved_version_id?: string | null
          auto_approved?: boolean | null
          char_after?: number
          char_before?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          doc_type?: string
          document_id?: string | null
          episode_index?: number | null
          episode_title?: string | null
          error?: string | null
          id?: string
          job_id?: string
          meta_json?: Json | null
          reason?: string
          status?: string
          target_doc_type?: string | null
          updated_at?: string
          upstream?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regen_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "regen_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      regen_jobs: {
        Row: {
          completed_count: number
          created_at: string
          created_by: string
          dry_run: boolean
          error: string | null
          force: boolean
          id: string
          job_type: string
          policy_json: Json | null
          project_id: string
          status: string
          total_count: number
          updated_at: string
        }
        Insert: {
          completed_count?: number
          created_at?: string
          created_by: string
          dry_run?: boolean
          error?: string | null
          force?: boolean
          id?: string
          job_type?: string
          policy_json?: Json | null
          project_id: string
          status?: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          completed_count?: number
          created_at?: string
          created_by?: string
          dry_run?: boolean
          error?: string | null
          force?: boolean
          id?: string
          job_type?: string
          policy_json?: Json | null
          project_id?: string
          status?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      regeneration_runs: {
        Row: {
          abort_reason: string | null
          completed_at: string | null
          completed_scene_ids: string[]
          failed_scene_ids: string[]
          id: string
          meta_json: Json
          ndg_post_at_risk_count: number | null
          ndg_pre_at_risk_count: number | null
          ndg_validation_status: string | null
          project_id: string
          recommended_scope: string
          source_axes: string[]
          source_unit_keys: string[]
          started_at: string
          status: string
          target_scene_count: number
          target_scene_ids: string[]
          triggered_by: string | null
        }
        Insert: {
          abort_reason?: string | null
          completed_at?: string | null
          completed_scene_ids?: string[]
          failed_scene_ids?: string[]
          id?: string
          meta_json?: Json
          ndg_post_at_risk_count?: number | null
          ndg_pre_at_risk_count?: number | null
          ndg_validation_status?: string | null
          project_id: string
          recommended_scope: string
          source_axes?: string[]
          source_unit_keys?: string[]
          started_at?: string
          status?: string
          target_scene_count?: number
          target_scene_ids?: string[]
          triggered_by?: string | null
        }
        Update: {
          abort_reason?: string | null
          completed_at?: string | null
          completed_scene_ids?: string[]
          failed_scene_ids?: string[]
          id?: string
          meta_json?: Json
          ndg_post_at_risk_count?: number | null
          ndg_pre_at_risk_count?: number | null
          ndg_validation_status?: string | null
          project_id?: string
          recommended_scope?: string
          source_axes?: string[]
          source_unit_keys?: string[]
          started_at?: string
          status?: string
          target_scene_count?: number
          target_scene_ids?: string[]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regeneration_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "regeneration_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      resolved_notes: {
        Row: {
          created_at: string
          decision_id: string | null
          id: string
          note_fingerprint: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_id?: string | null
          id?: string
          note_fingerprint: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_id?: string | null
          id?: string
          note_fingerprint?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolved_notes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decision_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      reverse_engineer_context: {
        Row: {
          block_count: number | null
          created_at: string | null
          created_by: string | null
          id: string
          last_blocked_at: string | null
          locked_entity_ids: string[]
          locked_scene_ids: string[]
          project_id: string
          regex_found_names: string[] | null
        }
        Insert: {
          block_count?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_blocked_at?: string | null
          locked_entity_ids?: string[]
          locked_scene_ids?: string[]
          project_id: string
          regex_found_names?: string[] | null
        }
        Update: {
          block_count?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_blocked_at?: string | null
          locked_entity_ids?: string[]
          locked_scene_ids?: string[]
          project_id?: string
          regex_found_names?: string[] | null
        }
        Relationships: []
      }
      reverse_engineer_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          project_id: string
          result_doc_id: string | null
          script_document_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          project_id: string
          result_doc_id?: string | null
          script_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          project_id?: string
          result_doc_id?: string | null
          script_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reverse_engineer_stages: {
        Row: {
          created_at: string
          error: string | null
          id: string
          job_id: string
          output: Json | null
          stage_key: string
          stage_label: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          output?: Json | null
          stage_key: string
          stage_label: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          output?: Json | null
          stage_key?: string
          stage_label?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reverse_engineer_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "reverse_engineer_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      review_tasks: {
        Row: {
          anchor_section: string | null
          created_at: string
          created_from_run_id: string | null
          detail: string
          doc_type: string | null
          doc_version_id: string | null
          evidence_json: Json
          fingerprint: string
          id: string
          last_seen_run_id: string | null
          project_id: string
          review_category: string
          severity: number
          source_key: string
          source_type: string
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          anchor_section?: string | null
          created_at?: string
          created_from_run_id?: string | null
          detail?: string
          doc_type?: string | null
          doc_version_id?: string | null
          evidence_json?: Json
          fingerprint: string
          id?: string
          last_seen_run_id?: string | null
          project_id: string
          review_category?: string
          severity?: number
          source_key: string
          source_type?: string
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          anchor_section?: string | null
          created_at?: string
          created_from_run_id?: string | null
          detail?: string
          doc_type?: string | null
          doc_version_id?: string | null
          evidence_json?: Json
          fingerprint?: string
          id?: string
          last_seen_run_id?: string | null
          project_id?: string
          review_category?: string
          severity?: number
          source_key?: string
          source_type?: string
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      rewrite_jobs: {
        Row: {
          approved_notes: Json | null
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          max_attempts: number
          next_summary: string | null
          prev_summary: string | null
          project_id: string
          protect_items: Json | null
          run_id: string | null
          scene_graph_version_id: string | null
          scene_heading: string | null
          scene_id: string | null
          scene_number: number
          source_doc_id: string
          source_version_id: string
          status: string
          target_doc_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_notes?: Json | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_summary?: string | null
          prev_summary?: string | null
          project_id: string
          protect_items?: Json | null
          run_id?: string | null
          scene_graph_version_id?: string | null
          scene_heading?: string | null
          scene_id?: string | null
          scene_number: number
          source_doc_id: string
          source_version_id: string
          status?: string
          target_doc_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_notes?: Json | null
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          max_attempts?: number
          next_summary?: string | null
          prev_summary?: string | null
          project_id?: string
          protect_items?: Json | null
          run_id?: string | null
          scene_graph_version_id?: string | null
          scene_heading?: string | null
          scene_id?: string | null
          scene_number?: number
          source_doc_id?: string
          source_version_id?: string
          status?: string
          target_doc_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewrite_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "rewrite_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rewrite_playbooks: {
        Row: {
          created_at: string
          description: string
          expected_impacts: Json
          id: string
          lane: string
          name: string
          operations: Json
          production_type: string
          triggers: Json
        }
        Insert: {
          created_at?: string
          description?: string
          expected_impacts?: Json
          id?: string
          lane?: string
          name: string
          operations?: Json
          production_type?: string
          triggers?: Json
        }
        Update: {
          created_at?: string
          description?: string
          expected_impacts?: Json
          id?: string
          lane?: string
          name?: string
          operations?: Json
          production_type?: string
          triggers?: Json
        }
        Relationships: []
      }
      rewrite_runs: {
        Row: {
          created_at: string
          id: string
          project_id: string
          source_doc_id: string
          source_version_id: string
          status: string
          summary: string | null
          target_scene_numbers: number[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          source_doc_id: string
          source_version_id: string
          status?: string
          summary?: string | null
          target_scene_numbers?: number[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          source_doc_id?: string
          source_version_id?: string
          status?: string
          summary?: string | null
          target_scene_numbers?: number[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rewrite_scene_outputs: {
        Row: {
          created_at: string
          id: string
          project_id: string
          rewritten_text: string
          run_id: string | null
          scene_id: string | null
          scene_number: number
          source_version_id: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          rewritten_text: string
          run_id?: string | null
          scene_id?: string | null
          scene_number: number
          source_version_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          rewritten_text?: string
          run_id?: string | null
          scene_id?: string | null
          scene_number?: number
          source_version_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewrite_scene_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "rewrite_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rough_cuts: {
        Row: {
          artifact_json: Json
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          plan_id: string
          project_id: string
          status: string
          timeline_json: Json
          updated_at: string
        }
        Insert: {
          artifact_json?: Json
          created_at?: string
          id?: string
          job_id: string
          last_error?: string | null
          plan_id: string
          project_id: string
          status?: string
          timeline_json?: Json
          updated_at?: string
        }
        Update: {
          artifact_json?: Json
          created_at?: string
          id?: string
          job_id?: string
          last_error?: string | null
          plan_id?: string
          project_id?: string
          status?: string
          timeline_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rough_cuts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_render_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rough_cuts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "video_generation_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_decision_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          previous_scenario_id: string | null
          project_id: string
          scenario_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          previous_scenario_id?: string | null
          project_id: string
          scenario_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          previous_scenario_id?: string | null
          project_id?: string
          scenario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenario_decision_events_previous_scenario_id_fkey"
            columns: ["previous_scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_decision_events_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_merge_approvals: {
        Row: {
          decision_note: string | null
          id: string
          payload: Json | null
          project_id: string
          requested_at: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scenario_id: string
          status: string
        }
        Insert: {
          decision_note?: string | null
          id?: string
          payload?: Json | null
          project_id: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario_id: string
          status?: string
        }
        Update: {
          decision_note?: string | null
          id?: string
          payload?: Json | null
          project_id?: string
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scenario_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_merge_approvals_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_projections: {
        Row: {
          assumptions: Json
          created_at: string
          id: string
          months: number
          project_id: string
          projection_risk_score: number
          scenario_id: string
          series: Json
          summary: Json
          summary_metrics: Json | null
          user_id: string
        }
        Insert: {
          assumptions?: Json
          created_at?: string
          id?: string
          months?: number
          project_id: string
          projection_risk_score?: number
          scenario_id: string
          series?: Json
          summary?: Json
          summary_metrics?: Json | null
          user_id: string
        }
        Update: {
          assumptions?: Json
          created_at?: string
          id?: string
          months?: number
          project_id?: string
          projection_risk_score?: number
          scenario_id?: string
          series?: Json
          summary?: Json
          summary_metrics?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_projections_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_recommendations: {
        Row: {
          confidence: number
          created_at: string
          id: string
          project_id: string
          reasons: Json
          recommended_scenario_id: string
          risk_flags: Json
          tradeoffs: Json
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          project_id: string
          reasons?: Json
          recommended_scenario_id: string
          risk_flags?: Json
          tradeoffs?: Json
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          project_id?: string
          reasons?: Json
          recommended_scenario_id?: string
          risk_flags?: Json
          tradeoffs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scenario_recommendations_recommended_scenario_id_fkey"
            columns: ["recommended_scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_scores: {
        Row: {
          as_of: string
          id: string
          metrics: Json
          notes: string | null
          project_id: string
          scenario_id: string
          scores: Json
        }
        Insert: {
          as_of?: string
          id?: string
          metrics?: Json
          notes?: string | null
          project_id: string
          scenario_id: string
          scores?: Json
        }
        Update: {
          as_of?: string
          id?: string
          metrics?: Json
          notes?: string | null
          project_id?: string
          scenario_id?: string
          scores?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scenario_scores_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_snapshots: {
        Row: {
          confidence_bands: Json
          created_at: string
          delta_vs_previous: Json
          id: string
          project_id: string
          scenario_id: string
          snapshot_state: Json
          trigger_reason: string
          user_id: string
        }
        Insert: {
          confidence_bands?: Json
          created_at?: string
          delta_vs_previous?: Json
          id?: string
          project_id: string
          scenario_id: string
          snapshot_state?: Json
          trigger_reason?: string
          user_id: string
        }
        Update: {
          confidence_bands?: Json
          created_at?: string
          delta_vs_previous?: Json
          id?: string
          project_id?: string
          scenario_id?: string
          snapshot_state?: Json
          trigger_reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_snapshots_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_stress_tests: {
        Row: {
          base_projection_id: string | null
          breakpoints: Json
          created_at: string
          fragility_score: number
          grid: Json
          id: string
          project_id: string
          results: Json
          scenario_id: string
          volatility_index: number
        }
        Insert: {
          base_projection_id?: string | null
          breakpoints?: Json
          created_at?: string
          fragility_score?: number
          grid?: Json
          id?: string
          project_id: string
          results?: Json
          scenario_id: string
          volatility_index?: number
        }
        Update: {
          base_projection_id?: string | null
          breakpoints?: Json
          created_at?: string
          fragility_score?: number
          grid?: Json
          id?: string
          project_id?: string
          results?: Json
          scenario_id?: string
          volatility_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenario_stress_tests_base_projection_id_fkey"
            columns: ["base_projection_id"]
            isOneToOne: false
            referencedRelation: "scenario_projections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_stress_tests_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "project_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_blueprint_bindings: {
        Row: {
          computed_at: string
          id: string
          patch_intent: string
          project_id: string
          reason: string | null
          risk_source: string
          scene_id: string
          scene_key: string
          slugline: string | null
          source_axis: string
          source_doc_version_id: string | null
          source_unit_key: string | null
          target_surface: string
          updated_at: string
        }
        Insert: {
          computed_at?: string
          id?: string
          patch_intent?: string
          project_id: string
          reason?: string | null
          risk_source?: string
          scene_id: string
          scene_key: string
          slugline?: string | null
          source_axis: string
          source_doc_version_id?: string | null
          source_unit_key?: string | null
          target_surface?: string
          updated_at?: string
        }
        Update: {
          computed_at?: string
          id?: string
          patch_intent?: string
          project_id?: string
          reason?: string | null
          risk_source?: string
          scene_id?: string
          scene_key?: string
          slugline?: string | null
          source_axis?: string
          source_doc_version_id?: string | null
          source_unit_key?: string | null
          target_surface?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_blueprint_bindings_source_doc_version_id_fkey"
            columns: ["source_doc_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_change_set_comments: {
        Row: {
          change_set_id: string
          comment: string
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          change_set_id: string
          comment: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          target_id?: string | null
          target_type?: string
        }
        Update: {
          change_set_id?: string
          comment?: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_change_set_comments_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_change_set_ops: {
        Row: {
          change_set_id: string
          created_at: string
          error: string | null
          id: string
          inverse: Json
          op_index: number
          op_type: string
          payload: Json
          project_id: string
          status: string
        }
        Insert: {
          change_set_id: string
          created_at?: string
          error?: string | null
          id?: string
          inverse?: Json
          op_index: number
          op_type: string
          payload?: Json
          project_id: string
          status?: string
        }
        Update: {
          change_set_id?: string
          created_at?: string
          error?: string | null
          id?: string
          inverse?: Json
          op_index?: number
          op_type?: string
          payload?: Json
          project_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_change_set_ops_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_change_set_review_state: {
        Row: {
          after_version_id: string | null
          before_version_id: string | null
          change_set_id: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          id: string
          project_id: string
          scene_id: string
        }
        Insert: {
          after_version_id?: string | null
          before_version_id?: string | null
          change_set_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          id?: string
          project_id: string
          scene_id: string
        }
        Update: {
          after_version_id?: string | null
          before_version_id?: string | null
          change_set_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          id?: string
          project_id?: string
          scene_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_change_set_review_state_after_version_id_fkey"
            columns: ["after_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_change_set_review_state_before_version_id_fkey"
            columns: ["before_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_change_set_review_state_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_change_set_review_state_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_change_sets: {
        Row: {
          applied_snapshot_id: string | null
          base_snapshot_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          goal_type: string | null
          id: string
          metadata: Json
          project_id: string
          status: string
          title: string
        }
        Insert: {
          applied_snapshot_id?: string | null
          base_snapshot_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_type?: string | null
          id?: string
          metadata?: Json
          project_id: string
          status?: string
          title: string
        }
        Update: {
          applied_snapshot_id?: string | null
          base_snapshot_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          goal_type?: string | null
          id?: string
          metadata?: Json
          project_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_change_sets_applied_snapshot_id_fkey"
            columns: ["applied_snapshot_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_change_sets_base_snapshot_id_fkey"
            columns: ["base_snapshot_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_demo_images: {
        Row: {
          approval_status: string
          character_key: string | null
          created_at: string
          error: string | null
          generation_config: Json
          id: string
          negative_prompt: string | null
          project_id: string
          prompt_used: string | null
          public_url: string | null
          run_id: string
          slot_key: string
          status: string
          storage_path: string | null
          updated_at: string
          validation_payload: Json | null
        }
        Insert: {
          approval_status?: string
          character_key?: string | null
          created_at?: string
          error?: string | null
          generation_config?: Json
          id?: string
          negative_prompt?: string | null
          project_id: string
          prompt_used?: string | null
          public_url?: string | null
          run_id: string
          slot_key: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          validation_payload?: Json | null
        }
        Update: {
          approval_status?: string
          character_key?: string | null
          created_at?: string
          error?: string | null
          generation_config?: Json
          id?: string
          negative_prompt?: string | null
          project_id?: string
          prompt_used?: string | null
          public_url?: string | null
          run_id?: string
          slot_key?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          validation_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_demo_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "scene_demo_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_demo_images_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scene_demo_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_demo_runs: {
        Row: {
          completed_at: string | null
          completed_count: number
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          is_canonical: boolean
          plan_snapshot: Json
          project_id: string
          scene_id: string
          slot_count: number
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          is_canonical?: boolean
          plan_snapshot?: Json
          project_id: string
          scene_id: string
          slot_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          is_canonical?: boolean
          plan_snapshot?: Json
          project_id?: string
          scene_id?: string
          slot_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_demo_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "scene_demo_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_diff_artifacts: {
        Row: {
          after_version_id: string | null
          artifact: Json
          before_version_id: string | null
          change_set_id: string
          created_at: string
          created_by: string | null
          diff_type: string
          id: string
          project_id: string
          scene_id: string | null
        }
        Insert: {
          after_version_id?: string | null
          artifact?: Json
          before_version_id?: string | null
          change_set_id: string
          created_at?: string
          created_by?: string | null
          diff_type: string
          id?: string
          project_id: string
          scene_id?: string | null
        }
        Update: {
          after_version_id?: string | null
          artifact?: Json
          before_version_id?: string | null
          change_set_id?: string
          created_at?: string
          created_by?: string | null
          diff_type?: string
          id?: string
          project_id?: string
          scene_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_diff_artifacts_after_version_id_fkey"
            columns: ["after_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_artifacts_before_version_id_fkey"
            columns: ["before_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_artifacts_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_artifacts_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_diff_comments: {
        Row: {
          after_version_id: string | null
          before_version_id: string | null
          change_set_id: string
          comment: string
          created_at: string
          created_by: string | null
          id: string
          parent_id: string | null
          project_id: string
          scene_id: string | null
          status: string
        }
        Insert: {
          after_version_id?: string | null
          before_version_id?: string | null
          change_set_id: string
          comment: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id?: string | null
          project_id: string
          scene_id?: string | null
          status?: string
        }
        Update: {
          after_version_id?: string | null
          before_version_id?: string | null
          change_set_id?: string
          comment?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_id?: string | null
          project_id?: string
          scene_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_diff_comments_after_version_id_fkey"
            columns: ["after_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_comments_before_version_id_fkey"
            columns: ["before_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_comments_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "scene_diff_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_diff_comments_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_engagement_scores: {
        Row: {
          character_connection_score: number | null
          cognitive_load_score: number | null
          confidence: number | null
          created_at: string
          document_id: string | null
          document_version_id: string | null
          emotional_journey_score: number | null
          id: string
          narrative_absorption_score: number | null
          neural_validation_run_id: string | null
          prediction_source: string
          project_id: string
          raw_roi_json: Json
          scene_heading: string | null
          scene_key: string
          score_version: number
          total_score: number
          visceral_impact_score: number | null
        }
        Insert: {
          character_connection_score?: number | null
          cognitive_load_score?: number | null
          confidence?: number | null
          created_at?: string
          document_id?: string | null
          document_version_id?: string | null
          emotional_journey_score?: number | null
          id?: string
          narrative_absorption_score?: number | null
          neural_validation_run_id?: string | null
          prediction_source: string
          project_id: string
          raw_roi_json?: Json
          scene_heading?: string | null
          scene_key: string
          score_version?: number
          total_score: number
          visceral_impact_score?: number | null
        }
        Update: {
          character_connection_score?: number | null
          cognitive_load_score?: number | null
          confidence?: number | null
          created_at?: string
          document_id?: string | null
          document_version_id?: string | null
          emotional_journey_score?: number | null
          id?: string
          narrative_absorption_score?: number | null
          neural_validation_run_id?: string | null
          prediction_source?: string
          project_id?: string
          raw_roi_json?: Json
          scene_heading?: string | null
          scene_key?: string
          score_version?: number
          total_score?: number
          visceral_impact_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_engagement_scores_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_engagement_scores_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_engagement_scores_neural_validation_run_id_fkey"
            columns: ["neural_validation_run_id"]
            isOneToOne: false
            referencedRelation: "neural_validation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_engagement_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "scene_engagement_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_enrichment: {
        Row: {
          computed_at: string | null
          emotional_arc_direction: string | null
          emotional_register: string | null
          id: string
          inputs_used: Json | null
          is_current: boolean | null
          narrative_beat: string | null
          narrative_momentum: string | null
          project_id: string
          protagonist_emotional_state: Json | null
          relationship_context: Json | null
          scene_key: string
          tension_level: number | null
          thematic_tags: string[] | null
          thematic_weight: number | null
        }
        Insert: {
          computed_at?: string | null
          emotional_arc_direction?: string | null
          emotional_register?: string | null
          id?: string
          inputs_used?: Json | null
          is_current?: boolean | null
          narrative_beat?: string | null
          narrative_momentum?: string | null
          project_id: string
          protagonist_emotional_state?: Json | null
          relationship_context?: Json | null
          scene_key: string
          tension_level?: number | null
          thematic_tags?: string[] | null
          thematic_weight?: number | null
        }
        Update: {
          computed_at?: string | null
          emotional_arc_direction?: string | null
          emotional_register?: string | null
          id?: string
          inputs_used?: Json | null
          is_current?: boolean | null
          narrative_beat?: string | null
          narrative_momentum?: string | null
          project_id?: string
          protagonist_emotional_state?: Json | null
          relationship_context?: Json | null
          scene_key?: string
          tension_level?: number | null
          thematic_tags?: string[] | null
          thematic_weight?: number | null
        }
        Relationships: []
      }
      scene_extract_debug: {
        Row: {
          doc_id: string | null
          first_200: string | null
          id: string
          lines_0_5: string | null
          lines_10_15: string | null
          lines_5_10: string | null
          project_id: string
          run_at: string | null
          scene_count: number | null
          script_length: number | null
          version_id: string | null
        }
        Insert: {
          doc_id?: string | null
          first_200?: string | null
          id?: string
          lines_0_5?: string | null
          lines_10_15?: string | null
          lines_5_10?: string | null
          project_id: string
          run_at?: string | null
          scene_count?: number | null
          script_length?: number | null
          version_id?: string | null
        }
        Update: {
          doc_id?: string | null
          first_200?: string | null
          id?: string
          lines_0_5?: string | null
          lines_10_15?: string | null
          lines_5_10?: string | null
          project_id?: string
          run_at?: string | null
          scene_count?: number | null
          script_length?: number | null
          version_id?: string | null
        }
        Relationships: []
      }
      scene_graph_actions: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string
          id: string
          inverse: Json
          payload: Json
          project_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string
          id?: string
          inverse?: Json
          payload?: Json
          project_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          inverse?: Json
          payload?: Json
          project_id?: string
        }
        Relationships: []
      }
      scene_graph_order: {
        Row: {
          act: number | null
          created_at: string
          id: string
          inserted_intent: Json
          inserted_reason: string | null
          is_active: boolean
          order_key: string
          project_id: string
          scene_id: string
          sequence: number | null
        }
        Insert: {
          act?: number | null
          created_at?: string
          id?: string
          inserted_intent?: Json
          inserted_reason?: string | null
          is_active?: boolean
          order_key: string
          project_id: string
          scene_id: string
          sequence?: number | null
        }
        Update: {
          act?: number | null
          created_at?: string
          id?: string
          inserted_intent?: Json
          inserted_reason?: string | null
          is_active?: boolean
          order_key?: string
          project_id?: string
          scene_id?: string
          sequence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_graph_order_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_graph_patch_queue: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          impact_preview: Json
          patch: Json
          project_id: string
          rationale: string | null
          repair_kind: string | null
          source_action_id: string | null
          source_finding_id: string | null
          source_run_id: string | null
          status: string
          suggestion: string
          target_scene_id: string | null
          target_scene_version_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          impact_preview?: Json
          patch?: Json
          project_id: string
          rationale?: string | null
          repair_kind?: string | null
          source_action_id?: string | null
          source_finding_id?: string | null
          source_run_id?: string | null
          status?: string
          suggestion?: string
          target_scene_id?: string | null
          target_scene_version_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          impact_preview?: Json
          patch?: Json
          project_id?: string
          rationale?: string | null
          repair_kind?: string | null
          source_action_id?: string | null
          source_finding_id?: string | null
          source_run_id?: string | null
          status?: string
          suggestion?: string
          target_scene_id?: string | null
          target_scene_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_graph_patch_queue_source_action_id_fkey"
            columns: ["source_action_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_graph_patch_queue_source_finding_id_fkey"
            columns: ["source_finding_id"]
            isOneToOne: false
            referencedRelation: "coherence_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_graph_patch_queue_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "coherence_checks_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_graph_patch_queue_target_scene_id_fkey"
            columns: ["target_scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_graph_patch_queue_target_scene_version_id_fkey"
            columns: ["target_scene_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_graph_scenes: {
        Row: {
          act: number | null
          act_label: string | null
          created_at: string
          created_by: string | null
          deprecated_at: string | null
          id: string
          ingestion_run_id: string | null
          page_range_end: number | null
          page_range_start: number | null
          project_id: string
          provenance: Json
          scene_key: string
          scene_kind: string
          slugline: string | null
          source_text_refs: Json
        }
        Insert: {
          act?: number | null
          act_label?: string | null
          created_at?: string
          created_by?: string | null
          deprecated_at?: string | null
          id?: string
          ingestion_run_id?: string | null
          page_range_end?: number | null
          page_range_start?: number | null
          project_id: string
          provenance?: Json
          scene_key: string
          scene_kind?: string
          slugline?: string | null
          source_text_refs?: Json
        }
        Update: {
          act?: number | null
          act_label?: string | null
          created_at?: string
          created_by?: string | null
          deprecated_at?: string | null
          id?: string
          ingestion_run_id?: string | null
          page_range_end?: number | null
          page_range_start?: number | null
          project_id?: string
          provenance?: Json
          scene_key?: string
          scene_kind?: string
          slugline?: string | null
          source_text_refs?: Json
        }
        Relationships: []
      }
      scene_graph_snapshots: {
        Row: {
          assembly: Json
          content: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          project_id: string
          status: string
        }
        Insert: {
          assembly?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          project_id: string
          status?: string
        }
        Update: {
          assembly?: Json
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          project_id?: string
          status?: string
        }
        Relationships: []
      }
      scene_graph_versions: {
        Row: {
          beats: Json
          canon_location_id: string | null
          characters_present: Json
          content: string
          continuity_facts_emitted: Json
          continuity_facts_required: Json
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          metadata: Json
          pacing_seconds: number | null
          project_id: string
          purpose: string | null
          scene_id: string
          scene_roles: Json
          setup_payoff_emitted: Json
          setup_payoff_required: Json
          slugline: string | null
          status: string
          summary: string | null
          superseded_at: string | null
          supersedes_version_id: string | null
          tension_delta: number | null
          thread_links: Json
          time_of_day: string | null
          version_number: number
        }
        Insert: {
          beats?: Json
          canon_location_id?: string | null
          characters_present?: Json
          content?: string
          continuity_facts_emitted?: Json
          continuity_facts_required?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          pacing_seconds?: number | null
          project_id: string
          purpose?: string | null
          scene_id: string
          scene_roles?: Json
          setup_payoff_emitted?: Json
          setup_payoff_required?: Json
          slugline?: string | null
          status?: string
          summary?: string | null
          superseded_at?: string | null
          supersedes_version_id?: string | null
          tension_delta?: number | null
          thread_links?: Json
          time_of_day?: string | null
          version_number?: number
        }
        Update: {
          beats?: Json
          canon_location_id?: string | null
          characters_present?: Json
          content?: string
          continuity_facts_emitted?: Json
          continuity_facts_required?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          pacing_seconds?: number | null
          project_id?: string
          purpose?: string | null
          scene_id?: string
          scene_roles?: Json
          setup_payoff_emitted?: Json
          setup_payoff_required?: Json
          slugline?: string | null
          status?: string
          summary?: string | null
          superseded_at?: string | null
          supersedes_version_id?: string | null
          tension_delta?: number | null
          thread_links?: Json
          time_of_day?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scene_graph_versions_canon_location_id_fkey"
            columns: ["canon_location_id"]
            isOneToOne: false
            referencedRelation: "canon_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_graph_versions_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_index: {
        Row: {
          character_keys: string[]
          created_at: string
          id: string
          location_key: string | null
          project_id: string
          scene_number: number
          source_doc_type: string
          source_ref: Json
          title: string | null
          updated_at: string
          wardrobe_state_map: Json
        }
        Insert: {
          character_keys?: string[]
          created_at?: string
          id?: string
          location_key?: string | null
          project_id: string
          scene_number: number
          source_doc_type?: string
          source_ref?: Json
          title?: string | null
          updated_at?: string
          wardrobe_state_map?: Json
        }
        Update: {
          character_keys?: string[]
          created_at?: string
          id?: string
          location_key?: string | null
          project_id?: string
          scene_number?: number
          source_doc_type?: string
          source_ref?: Json
          title?: string | null
          updated_at?: string
          wardrobe_state_map?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scene_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "scene_index_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_pass_runs: {
        Row: {
          created_at: string
          created_by: string | null
          created_change_set_id: string | null
          id: string
          metadata: Json
          mode: string
          pass_type: string
          project_id: string
          settings: Json
          snapshot_id: string
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_change_set_id?: string | null
          id?: string
          metadata?: Json
          mode?: string
          pass_type: string
          project_id: string
          settings?: Json
          snapshot_id: string
          status?: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_change_set_id?: string | null
          id?: string
          metadata?: Json
          mode?: string
          pass_type?: string
          project_id?: string
          settings?: Json
          snapshot_id?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_pass_runs_created_change_set_id_fkey"
            columns: ["created_change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_pass_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_qc_issues: {
        Row: {
          category: string
          created_at: string
          description: string
          evidence: Json
          id: string
          linked_change_set_id: string | null
          project_id: string
          qc_run_id: string
          related_scene_ids: Json
          related_thread_ids: Json
          severity: string
          status: string
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          evidence?: Json
          id?: string
          linked_change_set_id?: string | null
          project_id: string
          qc_run_id: string
          related_scene_ids?: Json
          related_thread_ids?: Json
          severity: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          evidence?: Json
          id?: string
          linked_change_set_id?: string | null
          project_id?: string
          qc_run_id?: string
          related_scene_ids?: Json
          related_thread_ids?: Json
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_qc_issues_linked_change_set_id_fkey"
            columns: ["linked_change_set_id"]
            isOneToOne: false
            referencedRelation: "scene_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_qc_issues_qc_run_id_fkey"
            columns: ["qc_run_id"]
            isOneToOne: false
            referencedRelation: "scene_qc_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_qc_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          mode: string
          project_id: string
          snapshot_id: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          mode?: string
          project_id: string
          snapshot_id: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          mode?: string
          project_id?: string
          snapshot_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_qc_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_role_taxonomy: {
        Row: {
          description: string
          id: string
          label: string
          role_key: string
        }
        Insert: {
          description: string
          id?: string
          label: string
          role_key: string
        }
        Update: {
          description?: string
          id?: string
          label?: string
          role_key?: string
        }
        Relationships: []
      }
      scene_schedule: {
        Row: {
          call_time: string | null
          created_at: string
          dependencies: string[]
          id: string
          notes: string
          project_id: string
          scene_id: string
          shoot_day_id: string
          sort_order: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_time?: string | null
          created_at?: string
          dependencies?: string[]
          id?: string
          notes?: string
          project_id: string
          scene_id: string
          shoot_day_id: string
          sort_order?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_time?: string | null
          created_at?: string
          dependencies?: string[]
          id?: string
          notes?: string
          project_id?: string
          scene_id?: string
          shoot_day_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_schedule_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "project_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_schedule_shoot_day_id_fkey"
            columns: ["shoot_day_id"]
            isOneToOne: false
            referencedRelation: "shoot_days"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_shot_sets: {
        Row: {
          aspect_ratio: string
          created_at: string
          created_by: string | null
          id: string
          mode: string
          notes: string | null
          project_id: string
          provenance: Json
          scene_id: string
          scene_version_id: string
          status: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          notes?: string | null
          project_id: string
          provenance?: Json
          scene_id: string
          scene_version_id: string
          status?: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          notes?: string | null
          project_id?: string
          provenance?: Json
          scene_id?: string
          scene_version_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_shot_sets_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_shot_sets_scene_version_id_fkey"
            columns: ["scene_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_shot_versions: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          project_id: string
          shot_id: string
          status: string
          superseded_at: string | null
          supersedes_version_id: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id: string
          shot_id: string
          status?: string
          superseded_at?: string | null
          supersedes_version_id?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          project_id?: string
          shot_id?: string
          status?: string
          superseded_at?: string | null
          supersedes_version_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scene_shot_versions_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "scene_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_shots: {
        Row: {
          ai_analysis_json: Json | null
          ai_blocking_constraints: string[] | null
          ai_candidate: boolean | null
          ai_confidence: number | null
          ai_estimated_cost_band: string | null
          ai_last_labeled_at: string | null
          ai_last_labeled_by: string | null
          ai_legal_risk_flags: string[] | null
          ai_max_quality: string | null
          ai_model_route: string | null
          ai_readiness_tier: string | null
          ai_required_assets: string[] | null
          angle: string | null
          blocking_notes: string | null
          camera_movement: string | null
          camera_support: string | null
          characters_in_frame: Json
          composition_notes: string | null
          coverage_role: string | null
          created_at: string
          emotional_intent: string | null
          est_duration_seconds: number | null
          est_setup_complexity: number | null
          framing: string | null
          id: string
          lens_mm: number | null
          lighting_style: string | null
          location_hint: string | null
          narrative_function: string | null
          order_key: string
          project_id: string
          props_required: Json
          scene_id: string
          scene_version_id: string
          sfx_vfx_flags: Json
          shot_number: number | null
          shot_plan_job_id: string | null
          shot_plan_job_scene_id: string | null
          shot_plan_source: string | null
          shot_set_id: string
          shot_type: string
          status: string
          time_of_day_hint: string | null
        }
        Insert: {
          ai_analysis_json?: Json | null
          ai_blocking_constraints?: string[] | null
          ai_candidate?: boolean | null
          ai_confidence?: number | null
          ai_estimated_cost_band?: string | null
          ai_last_labeled_at?: string | null
          ai_last_labeled_by?: string | null
          ai_legal_risk_flags?: string[] | null
          ai_max_quality?: string | null
          ai_model_route?: string | null
          ai_readiness_tier?: string | null
          ai_required_assets?: string[] | null
          angle?: string | null
          blocking_notes?: string | null
          camera_movement?: string | null
          camera_support?: string | null
          characters_in_frame?: Json
          composition_notes?: string | null
          coverage_role?: string | null
          created_at?: string
          emotional_intent?: string | null
          est_duration_seconds?: number | null
          est_setup_complexity?: number | null
          framing?: string | null
          id?: string
          lens_mm?: number | null
          lighting_style?: string | null
          location_hint?: string | null
          narrative_function?: string | null
          order_key: string
          project_id: string
          props_required?: Json
          scene_id: string
          scene_version_id: string
          sfx_vfx_flags?: Json
          shot_number?: number | null
          shot_plan_job_id?: string | null
          shot_plan_job_scene_id?: string | null
          shot_plan_source?: string | null
          shot_set_id: string
          shot_type?: string
          status?: string
          time_of_day_hint?: string | null
        }
        Update: {
          ai_analysis_json?: Json | null
          ai_blocking_constraints?: string[] | null
          ai_candidate?: boolean | null
          ai_confidence?: number | null
          ai_estimated_cost_band?: string | null
          ai_last_labeled_at?: string | null
          ai_last_labeled_by?: string | null
          ai_legal_risk_flags?: string[] | null
          ai_max_quality?: string | null
          ai_model_route?: string | null
          ai_readiness_tier?: string | null
          ai_required_assets?: string[] | null
          angle?: string | null
          blocking_notes?: string | null
          camera_movement?: string | null
          camera_support?: string | null
          characters_in_frame?: Json
          composition_notes?: string | null
          coverage_role?: string | null
          created_at?: string
          emotional_intent?: string | null
          est_duration_seconds?: number | null
          est_setup_complexity?: number | null
          framing?: string | null
          id?: string
          lens_mm?: number | null
          lighting_style?: string | null
          location_hint?: string | null
          narrative_function?: string | null
          order_key?: string
          project_id?: string
          props_required?: Json
          scene_id?: string
          scene_version_id?: string
          sfx_vfx_flags?: Json
          shot_number?: number | null
          shot_plan_job_id?: string | null
          shot_plan_job_scene_id?: string | null
          shot_plan_source?: string | null
          shot_set_id?: string
          shot_type?: string
          status?: string
          time_of_day_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_shots_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_shots_scene_version_id_fkey"
            columns: ["scene_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_shots_shot_set_id_fkey"
            columns: ["shot_set_id"]
            isOneToOne: false
            referencedRelation: "scene_shot_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_spine_links: {
        Row: {
          act: number | null
          arc_steps: Json
          axis_key: string | null
          id: string
          order_key: string
          project_id: string
          roles: Json
          scene_id: string
          sequence: number | null
          threads: Json
          updated_at: string
        }
        Insert: {
          act?: number | null
          arc_steps?: Json
          axis_key?: string | null
          id?: string
          order_key: string
          project_id: string
          roles?: Json
          scene_id: string
          sequence?: number | null
          threads?: Json
          updated_at?: string
        }
        Update: {
          act?: number | null
          arc_steps?: Json
          axis_key?: string | null
          id?: string
          order_key?: string
          project_id?: string
          roles?: Json
          scene_id?: string
          sequence?: number | null
          threads?: Json
          updated_at?: string
        }
        Relationships: []
      }
      screenplay_intake_runs: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          initiated_at: string
          metadata: Json
          project_id: string
          script_version_id: string | null
          source_doc_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          initiated_at?: string
          metadata?: Json
          project_id: string
          script_version_id?: string | null
          source_doc_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          initiated_at?: string
          metadata?: Json
          project_id?: string
          script_version_id?: string | null
          source_doc_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenplay_intake_runs_script_version_id_fkey"
            columns: ["script_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenplay_intake_runs_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      screenplay_intake_stage_runs: {
        Row: {
          action_name: string | null
          completed_at: string | null
          error: string | null
          function_name: string | null
          id: string
          output_summary: Json | null
          retryable: boolean
          run_id: string
          stage_key: string
          stage_order: number
          started_at: string | null
          status: string
        }
        Insert: {
          action_name?: string | null
          completed_at?: string | null
          error?: string | null
          function_name?: string | null
          id?: string
          output_summary?: Json | null
          retryable?: boolean
          run_id: string
          stage_key: string
          stage_order: number
          started_at?: string | null
          status?: string
        }
        Update: {
          action_name?: string | null
          completed_at?: string | null
          error?: string | null
          function_name?: string | null
          id?: string
          output_summary?: Json | null
          retryable?: boolean
          run_id?: string
          stage_key?: string
          stage_order?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenplay_intake_stage_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "screenplay_intake_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      script_blueprints: {
        Row: {
          blueprint_json: Json
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          source_document_version_id: string | null
          updated_at: string
        }
        Insert: {
          blueprint_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          source_document_version_id?: string | null
          updated_at?: string
        }
        Update: {
          blueprint_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          source_document_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_blueprints_source_document_version_id_fkey"
            columns: ["source_document_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_coverages: {
        Row: {
          character_analysis: string
          comparable_titles: Json
          created_at: string
          document_id: string | null
          draft_label: string
          id: string
          logline: string
          market_positioning: string
          project_id: string
          recommendation: string
          recommendation_reason: string
          strengths: Json
          structural_analysis: string
          synopsis: string
          themes: Json
          user_id: string
          weaknesses: Json
        }
        Insert: {
          character_analysis?: string
          comparable_titles?: Json
          created_at?: string
          document_id?: string | null
          draft_label?: string
          id?: string
          logline?: string
          market_positioning?: string
          project_id: string
          recommendation?: string
          recommendation_reason?: string
          strengths?: Json
          structural_analysis?: string
          synopsis?: string
          themes?: Json
          user_id: string
          weaknesses?: Json
        }
        Update: {
          character_analysis?: string
          comparable_titles?: Json
          created_at?: string
          document_id?: string | null
          draft_label?: string
          id?: string
          logline?: string
          market_positioning?: string
          project_id?: string
          recommendation?: string
          recommendation_reason?: string
          strengths?: Json
          structural_analysis?: string
          synopsis?: string
          themes?: Json
          user_id?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "script_coverages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_coverages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "script_coverages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      script_extraction_runs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          output: Json | null
          project_id: string
          script_version_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          output?: Json | null
          project_id: string
          script_version_id: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          output?: Json | null
          project_id?: string
          script_version_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_extraction_runs_script_version_id_fkey"
            columns: ["script_version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_pdf_pages: {
        Row: {
          created_at: string
          document_id: string
          id: string
          page_number: number
          page_text: string
          project_id: string
          version_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          page_number: number
          page_text?: string
          project_id: string
          version_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          page_number?: number
          page_text?: string
          project_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_pdf_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_pdf_pages_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_scenes: {
        Row: {
          beat_summary: string | null
          cast_size: number | null
          conflict_type: string | null
          created_at: string
          escalation_notes: string | null
          id: string
          location: string | null
          objective: string | null
          obstacle: string | null
          pov_character: string | null
          production_weight: string | null
          scene_number: number
          scene_score: number | null
          script_id: string
          turn_summary: string | null
        }
        Insert: {
          beat_summary?: string | null
          cast_size?: number | null
          conflict_type?: string | null
          created_at?: string
          escalation_notes?: string | null
          id?: string
          location?: string | null
          objective?: string | null
          obstacle?: string | null
          pov_character?: string | null
          production_weight?: string | null
          scene_number: number
          scene_score?: number | null
          script_id: string
          turn_summary?: string | null
        }
        Update: {
          beat_summary?: string | null
          cast_size?: number | null
          conflict_type?: string | null
          created_at?: string
          escalation_notes?: string | null
          id?: string
          location?: string | null
          objective?: string | null
          obstacle?: string | null
          pov_character?: string | null
          production_weight?: string | null
          scene_number?: number
          scene_score?: number | null
          script_id?: string
          turn_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "script_scenes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      script_unit_links: {
        Row: {
          blueprint_id: string | null
          created_at: string
          from_unit_id: string
          id: string
          link_type: string
          note: string | null
          project_id: string
          strength: number
          to_unit_id: string
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          from_unit_id: string
          id?: string
          link_type: string
          note?: string | null
          project_id: string
          strength?: number
          to_unit_id: string
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          from_unit_id?: string
          id?: string
          link_type?: string
          note?: string | null
          project_id?: string
          strength?: number
          to_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_unit_links_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "script_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_unit_links_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "script_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_unit_links_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "script_units"
            referencedColumns: ["id"]
          },
        ]
      }
      script_unit_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          plaintext: string
          unit_id: string
          unit_json: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          plaintext: string
          unit_id: string
          unit_json?: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          plaintext?: string
          unit_id?: string
          unit_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "script_unit_versions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "script_units"
            referencedColumns: ["id"]
          },
        ]
      }
      script_units: {
        Row: {
          blueprint_id: string | null
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          order_index: number
          page_estimate: number | null
          parent_unit_id: string | null
          plaintext: string
          project_id: string
          slugline: string | null
          time_of_day: string | null
          title: string | null
          unit_json: Json
          unit_type: string
          updated_at: string
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          order_index?: number
          page_estimate?: number | null
          parent_unit_id?: string | null
          plaintext?: string
          project_id: string
          slugline?: string | null
          time_of_day?: string | null
          title?: string | null
          unit_json?: Json
          unit_type: string
          updated_at?: string
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          order_index?: number
          page_estimate?: number | null
          parent_unit_id?: string | null
          plaintext?: string
          project_id?: string
          slugline?: string | null
          time_of_day?: string | null
          title?: string | null
          unit_json?: Json
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_units_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "script_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_units_parent_unit_id_fkey"
            columns: ["parent_unit_id"]
            isOneToOne: false
            referencedRelation: "script_units"
            referencedColumns: ["id"]
          },
        ]
      }
      script_versions: {
        Row: {
          batch_index: number | null
          blueprint_json: Json | null
          budget_score: number | null
          created_at: string
          dialogue_score: number | null
          draft_number: number
          economy_score: number | null
          full_text_storage_path: string | null
          id: string
          is_partial: boolean | null
          lane_alignment_score: number | null
          line_count: number | null
          notes: string | null
          page_count_est: number | null
          rewrite_pass: string | null
          runtime_min_est: number | null
          runtime_min_high: number | null
          runtime_min_low: number | null
          runtime_per_episode_est: number | null
          script_id: string
          structural_score: number | null
          word_count: number | null
        }
        Insert: {
          batch_index?: number | null
          blueprint_json?: Json | null
          budget_score?: number | null
          created_at?: string
          dialogue_score?: number | null
          draft_number: number
          economy_score?: number | null
          full_text_storage_path?: string | null
          id?: string
          is_partial?: boolean | null
          lane_alignment_score?: number | null
          line_count?: number | null
          notes?: string | null
          page_count_est?: number | null
          rewrite_pass?: string | null
          runtime_min_est?: number | null
          runtime_min_high?: number | null
          runtime_min_low?: number | null
          runtime_per_episode_est?: number | null
          script_id: string
          structural_score?: number | null
          word_count?: number | null
        }
        Update: {
          batch_index?: number | null
          blueprint_json?: Json | null
          budget_score?: number | null
          created_at?: string
          dialogue_score?: number | null
          draft_number?: number
          economy_score?: number | null
          full_text_storage_path?: string | null
          id?: string
          is_partial?: boolean | null
          lane_alignment_score?: number | null
          line_count?: number | null
          notes?: string | null
          page_count_est?: number | null
          rewrite_pass?: string | null
          runtime_min_est?: number | null
          runtime_min_high?: number | null
          runtime_min_low?: number | null
          runtime_per_episode_est?: number | null
          script_id?: string
          structural_score?: number | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "script_versions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      script_world_state: {
        Row: {
          blueprint_id: string | null
          id: string
          project_id: string
          state_json: Json
          updated_at: string
        }
        Insert: {
          blueprint_id?: string | null
          id?: string
          project_id: string
          state_json?: Json
          updated_at?: string
        }
        Update: {
          blueprint_id?: string | null
          id?: string
          project_id?: string
          state_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_world_state_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "script_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          budget_score: number | null
          created_at: string
          created_by: string
          dialogue_score: number | null
          draft_number: number | null
          economy_score: number | null
          file_path: string | null
          hash: string | null
          id: string
          is_current: boolean | null
          lane_alignment_score: number | null
          latest_batch_index: number | null
          latest_batch_storage_path: string | null
          latest_draft_number: number | null
          latest_page_count_est: number | null
          latest_runtime_min_est: number | null
          latest_runtime_min_high: number | null
          latest_runtime_min_low: number | null
          owner_id: string | null
          page_map: Json | null
          project_id: string
          status: string | null
          structural_score: number | null
          text_content: string | null
          version: number
          version_label: string | null
        }
        Insert: {
          budget_score?: number | null
          created_at?: string
          created_by: string
          dialogue_score?: number | null
          draft_number?: number | null
          economy_score?: number | null
          file_path?: string | null
          hash?: string | null
          id?: string
          is_current?: boolean | null
          lane_alignment_score?: number | null
          latest_batch_index?: number | null
          latest_batch_storage_path?: string | null
          latest_draft_number?: number | null
          latest_page_count_est?: number | null
          latest_runtime_min_est?: number | null
          latest_runtime_min_high?: number | null
          latest_runtime_min_low?: number | null
          owner_id?: string | null
          page_map?: Json | null
          project_id: string
          status?: string | null
          structural_score?: number | null
          text_content?: string | null
          version?: number
          version_label?: string | null
        }
        Update: {
          budget_score?: number | null
          created_at?: string
          created_by?: string
          dialogue_score?: number | null
          draft_number?: number | null
          economy_score?: number | null
          file_path?: string | null
          hash?: string | null
          id?: string
          is_current?: boolean | null
          lane_alignment_score?: number | null
          latest_batch_index?: number | null
          latest_batch_storage_path?: string | null
          latest_draft_number?: number | null
          latest_page_count_est?: number | null
          latest_runtime_min_est?: number | null
          latest_runtime_min_high?: number | null
          latest_runtime_min_low?: number | null
          owner_id?: string | null
          page_map?: Json | null
          project_id?: string
          status?: string | null
          structural_score?: number | null
          text_content?: string | null
          version?: number
          version_label?: string | null
        }
        Relationships: []
      }
      season_master_compilations: {
        Row: {
          compiled_at: string
          compiled_by: string
          created_at: string
          episode_manifest: Json
          id: string
          master_document_id: string
          master_version_id: string
          project_id: string
          source: string
        }
        Insert: {
          compiled_at?: string
          compiled_by: string
          created_at?: string
          episode_manifest?: Json
          id?: string
          master_document_id: string
          master_version_id: string
          project_id: string
          source?: string
        }
        Update: {
          compiled_at?: string
          compiled_by?: string
          created_at?: string
          episode_manifest?: Json
          id?: string
          master_document_id?: string
          master_version_id?: string
          project_id?: string
          source?: string
        }
        Relationships: []
      }
      series_continuity_issues: {
        Row: {
          claim_in_episode: string | null
          conflicts_with: Json
          created_at: string
          episode_number: number
          fix_options: Json
          id: string
          issue_type: string
          project_id: string
          proposed_patch: Json
          run_id: string
          severity: string
          status: string
          title: string
          why_it_conflicts: string | null
        }
        Insert: {
          claim_in_episode?: string | null
          conflicts_with?: Json
          created_at?: string
          episode_number: number
          fix_options?: Json
          id?: string
          issue_type: string
          project_id: string
          proposed_patch?: Json
          run_id: string
          severity: string
          status?: string
          title: string
          why_it_conflicts?: string | null
        }
        Update: {
          claim_in_episode?: string | null
          conflicts_with?: Json
          created_at?: string
          episode_number?: number
          fix_options?: Json
          id?: string
          issue_type?: string
          project_id?: string
          proposed_patch?: Json
          run_id?: string
          severity?: string
          status?: string
          title?: string
          why_it_conflicts?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_continuity_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "series_continuity_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      series_continuity_runs: {
        Row: {
          created_at: string
          episode_number: number
          episode_version_id: string
          finished_at: string | null
          id: string
          logs: string | null
          project_id: string
          results_json: Json
          started_by: string
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          episode_number: number
          episode_version_id: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          project_id: string
          results_json?: Json
          started_by: string
          status?: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          episode_number?: number
          episode_version_id?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          project_id?: string
          results_json?: Json
          started_by?: string
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      series_dev_notes_runs: {
        Row: {
          created_at: string
          episode_number: number
          finished_at: string | null
          id: string
          logs: string | null
          project_id: string
          results_json: Json
          script_id: string | null
          started_by: string
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          episode_number: number
          finished_at?: string | null
          id?: string
          logs?: string | null
          project_id: string
          results_json?: Json
          script_id?: string | null
          started_by: string
          status?: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          episode_number?: number
          finished_at?: string | null
          id?: string
          logs?: string | null
          project_id?: string
          results_json?: Json
          script_id?: string | null
          started_by?: string
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      series_episode_canon_facts: {
        Row: {
          created_at: string
          episode_number: number
          episode_version_id: string | null
          facts_json: Json
          id: string
          project_id: string
          recap: string | null
        }
        Insert: {
          created_at?: string
          episode_number: number
          episode_version_id?: string | null
          facts_json?: Json
          id?: string
          project_id: string
          recap?: string | null
        }
        Update: {
          created_at?: string
          episode_number?: number
          episode_version_id?: string | null
          facts_json?: Json
          id?: string
          project_id?: string
          recap?: string | null
        }
        Relationships: []
      }
      series_episodes: {
        Row: {
          canon_snapshot_id: string | null
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          episode_number: number
          generation_progress: Json | null
          handoff_status: string | null
          id: string
          is_deleted: boolean
          is_season_template: boolean
          locked_at: string | null
          logline: string | null
          project_id: string
          resolver_hash_used: string | null
          script_id: string | null
          status: string
          style_template_version_id: string | null
          title: string
          updated_at: string
          user_id: string
          validation_score: number | null
          validation_status: string | null
        }
        Insert: {
          canon_snapshot_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          episode_number: number
          generation_progress?: Json | null
          handoff_status?: string | null
          id?: string
          is_deleted?: boolean
          is_season_template?: boolean
          locked_at?: string | null
          logline?: string | null
          project_id: string
          resolver_hash_used?: string | null
          script_id?: string | null
          status?: string
          style_template_version_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
          validation_score?: number | null
          validation_status?: string | null
        }
        Update: {
          canon_snapshot_id?: string | null
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          episode_number?: number
          generation_progress?: Json | null
          handoff_status?: string | null
          id?: string
          is_deleted?: boolean
          is_season_template?: boolean
          locked_at?: string | null
          logline?: string | null
          project_id?: string
          resolver_hash_used?: string | null
          script_id?: string | null
          status?: string
          style_template_version_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          validation_score?: number | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_episodes_canon_snapshot_id_fkey"
            columns: ["canon_snapshot_id"]
            isOneToOne: false
            referencedRelation: "canon_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_episodes_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      series_writer_sessions: {
        Row: {
          active_episode_number: number
          created_at: string
          id: string
          project_id: string
          resolver_hash: string
          sequential_mode: boolean
          updated_at: string
          user_id: string
          working_set: Json
        }
        Insert: {
          active_episode_number?: number
          created_at?: string
          id?: string
          project_id: string
          resolver_hash?: string
          sequential_mode?: boolean
          updated_at?: string
          user_id: string
          working_set?: Json
        }
        Update: {
          active_episode_number?: number
          created_at?: string
          id?: string
          project_id?: string
          resolver_hash?: string
          sequential_mode?: boolean
          updated_at?: string
          user_id?: string
          working_set?: Json
        }
        Relationships: []
      }
      shadow_source_evaluations: {
        Row: {
          accuracy_score: number
          correlation_details: Json
          created_at: string
          evaluation_period: string
          id: string
          promoted_at: string | null
          sample_size: number
          source_id: string
        }
        Insert: {
          accuracy_score?: number
          correlation_details?: Json
          created_at?: string
          evaluation_period?: string
          id?: string
          promoted_at?: string | null
          sample_size?: number
          source_id: string
        }
        Update: {
          accuracy_score?: number
          correlation_details?: Json
          created_at?: string
          evaluation_period?: string
          id?: string
          promoted_at?: string | null
          sample_size?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shadow_source_evaluations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_signals: {
        Row: {
          created_at: string
          id: string
          note: string
          project_id: string | null
          shared_by: string
          shared_with: string
          signal_id: string
          signal_name: string
          signal_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          project_id?: string | null
          shared_by: string
          shared_with: string
          signal_id: string
          signal_name?: string
          signal_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          project_id?: string | null
          shared_by?: string
          shared_with?: string
          signal_id?: string
          signal_name?: string
          signal_type?: string
        }
        Relationships: []
      }
      shoot_days: {
        Row: {
          created_at: string
          day_number: number
          id: string
          notes: string
          project_id: string
          shoot_date: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_number?: number
          id?: string
          notes?: string
          project_id: string
          shoot_date: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_number?: number
          id?: string
          notes?: string
          project_id?: string
          shoot_date?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shot_list_items: {
        Row: {
          action: string
          anchor_ref: Json | null
          audio_notes: string | null
          camera_movement: string
          characters_present: Json | null
          continuity_notes: string | null
          created_at: string
          duration_est_seconds: number | null
          framing: string
          id: string
          location: string | null
          locked: boolean
          order_index: number
          project_id: string
          props_or_set_notes: string | null
          scene_heading: string
          scene_number: string
          shot_list_id: string
          shot_number: number
          shot_type: string
          time_of_day: string | null
          updated_at: string
          vfx_sfx_flags: Json | null
        }
        Insert: {
          action?: string
          anchor_ref?: Json | null
          audio_notes?: string | null
          camera_movement?: string
          characters_present?: Json | null
          continuity_notes?: string | null
          created_at?: string
          duration_est_seconds?: number | null
          framing?: string
          id?: string
          location?: string | null
          locked?: boolean
          order_index?: number
          project_id: string
          props_or_set_notes?: string | null
          scene_heading?: string
          scene_number?: string
          shot_list_id: string
          shot_number?: number
          shot_type?: string
          time_of_day?: string | null
          updated_at?: string
          vfx_sfx_flags?: Json | null
        }
        Update: {
          action?: string
          anchor_ref?: Json | null
          audio_notes?: string | null
          camera_movement?: string
          characters_present?: Json | null
          continuity_notes?: string | null
          created_at?: string
          duration_est_seconds?: number | null
          framing?: string
          id?: string
          location?: string | null
          locked?: boolean
          order_index?: number
          project_id?: string
          props_or_set_notes?: string | null
          scene_heading?: string
          scene_number?: string
          shot_list_id?: string
          shot_number?: number
          shot_type?: string
          time_of_day?: string | null
          updated_at?: string
          vfx_sfx_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_list_items_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_list_regens: {
        Row: {
          created_at: string
          created_by: string
          id: string
          regen_scope: Json
          shot_list_id: string
          source_version_id: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          regen_scope?: Json
          shot_list_id: string
          source_version_id: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          regen_scope?: Json
          shot_list_id?: string
          source_version_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_list_regens_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_lists: {
        Row: {
          created_at: string
          created_by: string
          episode_number: number | null
          id: string
          name: string
          project_id: string
          scope: Json
          source_document_id: string
          source_version_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          episode_number?: number | null
          id?: string
          name?: string
          project_id: string
          scope?: Json
          source_document_id: string
          source_version_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          episode_number?: number | null
          id?: string
          name?: string
          project_id?: string
          scope?: Json
          source_document_id?: string
          source_version_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      shot_plan_job_scenes: {
        Row: {
          attempts: number
          error_message: string | null
          finished_at: string | null
          id: string
          inserted_shots: number
          job_id: string
          project_id: string
          scene_id: string
          scene_order: number
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_shots?: number
          job_id: string
          project_id: string
          scene_id: string
          scene_order?: number
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          inserted_shots?: number
          job_id?: string
          project_id?: string
          scene_id?: string
          scene_order?: number
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_plan_job_scenes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "shot_plan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_plan_jobs: {
        Row: {
          completed_scenes: number
          created_by: string | null
          current_scene_id: string | null
          current_scene_index: number
          finished_at: string | null
          id: string
          inserted_shots: number
          last_error: string | null
          last_heartbeat_at: string | null
          last_message: string | null
          last_scene_id: string | null
          mode: string
          project_id: string
          started_at: string
          status: string
          total_scenes: number
          updated_at: string
        }
        Insert: {
          completed_scenes?: number
          created_by?: string | null
          current_scene_id?: string | null
          current_scene_index?: number
          finished_at?: string | null
          id?: string
          inserted_shots?: number
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_message?: string | null
          last_scene_id?: string | null
          mode?: string
          project_id: string
          started_at?: string
          status?: string
          total_scenes?: number
          updated_at?: string
        }
        Update: {
          completed_scenes?: number
          created_by?: string | null
          current_scene_id?: string | null
          current_scene_index?: number
          finished_at?: string | null
          id?: string
          inserted_shots?: number
          last_error?: string | null
          last_heartbeat_at?: string | null
          last_message?: string | null
          last_scene_id?: string | null
          mode?: string
          project_id?: string
          started_at?: string
          status?: string
          total_scenes?: number
          updated_at?: string
        }
        Relationships: []
      }
      stage_gates: {
        Row: {
          blockers: string[] | null
          created_at: string
          gate_name: string
          id: string
          project_id: string
          required_artifacts: string[] | null
          score: number | null
          sort_order: number | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blockers?: string[] | null
          created_at?: string
          gate_name: string
          id?: string
          project_id: string
          required_artifacts?: string[] | null
          score?: number | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blockers?: string[] | null
          created_at?: string
          gate_name?: string
          id?: string
          project_id?: string
          required_artifacts?: string[] | null
          score?: number | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      story_metrics_runs: {
        Row: {
          charts: Json
          created_at: string
          created_by: string | null
          id: string
          metrics: Json
          mode: string
          per_scene: Json
          project_id: string
          source_snapshot_id: string | null
          status: string
        }
        Insert: {
          charts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: Json
          mode?: string
          per_scene?: Json
          project_id: string
          source_snapshot_id?: string | null
          status?: string
        }
        Update: {
          charts?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: Json
          mode?: string
          per_scene?: Json
          project_id?: string
          source_snapshot_id?: string | null
          status?: string
        }
        Relationships: []
      }
      story_rulesets: {
        Row: {
          attempt: number
          created_at: string
          created_by: string
          engine_profile_id: string | null
          fingerprint: Json
          id: string
          lane: string
          melodrama_score: number
          nuance_gate: Json
          nuance_metrics: Json
          nuance_score: number
          override_ids: Json
          project_id: string
          repaired_from_ruleset_id: string | null
          resolved_rules: Json
          resolved_summary: string
          run_id: string
          run_type: string
          similarity_risk: number
        }
        Insert: {
          attempt?: number
          created_at?: string
          created_by: string
          engine_profile_id?: string | null
          fingerprint?: Json
          id?: string
          lane: string
          melodrama_score?: number
          nuance_gate?: Json
          nuance_metrics?: Json
          nuance_score?: number
          override_ids?: Json
          project_id: string
          repaired_from_ruleset_id?: string | null
          resolved_rules: Json
          resolved_summary?: string
          run_id: string
          run_type: string
          similarity_risk?: number
        }
        Update: {
          attempt?: number
          created_at?: string
          created_by?: string
          engine_profile_id?: string | null
          fingerprint?: Json
          id?: string
          lane?: string
          melodrama_score?: number
          nuance_gate?: Json
          nuance_metrics?: Json
          nuance_score?: number
          override_ids?: Json
          project_id?: string
          repaired_from_ruleset_id?: string | null
          resolved_rules?: Json
          resolved_summary?: string
          run_id?: string
          run_type?: string
          similarity_risk?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_rulesets_engine_profile_id_fkey"
            columns: ["engine_profile_id"]
            isOneToOne: false
            referencedRelation: "engine_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_rulesets_repaired_from_ruleset_id_fkey"
            columns: ["repaired_from_ruleset_id"]
            isOneToOne: false
            referencedRelation: "story_rulesets"
            referencedColumns: ["id"]
          },
        ]
      }
      story_spine_versions: {
        Row: {
          act1_facts: string | null
          act2_hypotheses: string | null
          act3_outcome_paths: Json | null
          central_tension: string | null
          created_at: string
          discovery_notes: string | null
          id: string
          project_id: string
          status: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          act1_facts?: string | null
          act2_hypotheses?: string | null
          act3_outcome_paths?: Json | null
          central_tension?: string | null
          created_at?: string
          discovery_notes?: string | null
          id?: string
          project_id: string
          status?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          act1_facts?: string | null
          act2_hypotheses?: string | null
          act3_outcome_paths?: Json | null
          central_tension?: string | null
          created_at?: string
          discovery_notes?: string | null
          id?: string
          project_id?: string
          status?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      storyboard_boards: {
        Row: {
          action_notes: string | null
          aspect_ratio: string
          board_seed: string | null
          camera_notes: string | null
          character_refs: Json | null
          composition_notes: string | null
          continuity_lock: boolean
          created_at: string
          framing_notes: string | null
          id: string
          image_asset_path: string | null
          image_source: string | null
          location_refs: Json | null
          locked: boolean
          panel_text: string
          project_id: string
          scene_number: string
          scene_seed: string | null
          shot_list_id: string
          shot_list_item_id: string
          shot_number: number
          style_preset_id: string | null
          updated_at: string
        }
        Insert: {
          action_notes?: string | null
          aspect_ratio?: string
          board_seed?: string | null
          camera_notes?: string | null
          character_refs?: Json | null
          composition_notes?: string | null
          continuity_lock?: boolean
          created_at?: string
          framing_notes?: string | null
          id?: string
          image_asset_path?: string | null
          image_source?: string | null
          location_refs?: Json | null
          locked?: boolean
          panel_text?: string
          project_id: string
          scene_number?: string
          scene_seed?: string | null
          shot_list_id: string
          shot_list_item_id: string
          shot_number?: number
          style_preset_id?: string | null
          updated_at?: string
        }
        Update: {
          action_notes?: string | null
          aspect_ratio?: string
          board_seed?: string | null
          camera_notes?: string | null
          character_refs?: Json | null
          composition_notes?: string | null
          continuity_lock?: boolean
          created_at?: string
          framing_notes?: string | null
          id?: string
          image_asset_path?: string | null
          image_source?: string | null
          location_refs?: Json | null
          locked?: boolean
          panel_text?: string
          project_id?: string
          scene_number?: string
          scene_seed?: string | null
          shot_list_id?: string
          shot_list_item_id?: string
          shot_number?: number
          style_preset_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_boards_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_boards_shot_list_item_id_fkey"
            columns: ["shot_list_item_id"]
            isOneToOne: false
            referencedRelation: "shot_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_exports: {
        Row: {
          created_at: string
          created_by: string
          error: string | null
          export_type: string
          id: string
          meta: Json
          options: Json
          project_id: string
          public_url: string | null
          run_id: string | null
          shot_list_id: string
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error?: string | null
          export_type?: string
          id?: string
          meta?: Json
          options?: Json
          project_id: string
          public_url?: string | null
          run_id?: string | null
          shot_list_id: string
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error?: string | null
          export_type?: string
          id?: string
          meta?: Json
          options?: Json
          project_id?: string
          public_url?: string | null
          run_id?: string | null
          shot_list_id?: string
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_exports_shot_list_id_fkey"
            columns: ["shot_list_id"]
            isOneToOne: false
            referencedRelation: "shot_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_frames: {
        Row: {
          aspect_ratio: string
          created_at: string
          deleted_at: string | null
          frame_index: number
          id: string
          image_url: string | null
          is_stale: boolean
          mime_type: string | null
          notes: string | null
          project_id: string
          prompt: string
          scene_id: string
          scene_version_id: string
          shot_id: string
          shot_version_id: string | null
          status: string
          storage_path: string | null
          style_preset: string
          thumb_url: string | null
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          deleted_at?: string | null
          frame_index?: number
          id?: string
          image_url?: string | null
          is_stale?: boolean
          mime_type?: string | null
          notes?: string | null
          project_id: string
          prompt?: string
          scene_id: string
          scene_version_id: string
          shot_id: string
          shot_version_id?: string | null
          status?: string
          storage_path?: string | null
          style_preset?: string
          thumb_url?: string | null
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          deleted_at?: string | null
          frame_index?: number
          id?: string
          image_url?: string | null
          is_stale?: boolean
          mime_type?: string | null
          notes?: string | null
          project_id?: string
          prompt?: string
          scene_id?: string
          scene_version_id?: string
          shot_id?: string
          shot_version_id?: string | null
          status?: string
          storage_path?: string | null
          style_preset?: string
          thumb_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_frames_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_scene_version_id_fkey"
            columns: ["scene_version_id"]
            isOneToOne: false
            referencedRelation: "scene_graph_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "scene_shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_frames_shot_version_id_fkey"
            columns: ["shot_version_id"]
            isOneToOne: false
            referencedRelation: "scene_shot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_panels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          panel_index: number
          panel_payload: Json
          project_id: string
          run_id: string
          status: string
          unit_key: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          panel_index: number
          panel_payload: Json
          project_id: string
          run_id: string
          status?: string
          unit_key: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          panel_index?: number
          panel_payload?: Json
          project_id?: string
          run_id?: string
          status?: string
          unit_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_panels_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "storyboard_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_pipeline_frames: {
        Row: {
          created_at: string
          created_by: string | null
          gen_params: Json
          height: number | null
          id: string
          model: string
          panel_id: string
          project_id: string
          public_url: string
          seed: string | null
          status: string
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gen_params?: Json
          height?: number | null
          id?: string
          model?: string
          panel_id: string
          project_id: string
          public_url: string
          seed?: string | null
          status?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gen_params?: Json
          height?: number | null
          id?: string
          model?: string
          panel_id?: string
          project_id?: string
          public_url?: string
          seed?: string | null
          status?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_pipeline_frames_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "storyboard_panels"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_render_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          last_error: string | null
          max_attempts: number
          panel_id: string
          priority: number
          project_id: string
          render_run_id: string
          run_id: string
          status: string
          unit_key: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          panel_id: string
          priority?: number
          project_id: string
          render_run_id: string
          run_id: string
          status?: string
          unit_key: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          panel_id?: string
          priority?: number
          project_id?: string
          render_run_id?: string
          run_id?: string
          status?: string
          unit_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_render_jobs_panel_id_fkey"
            columns: ["panel_id"]
            isOneToOne: false
            referencedRelation: "storyboard_panels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_render_jobs_render_run_id_fkey"
            columns: ["render_run_id"]
            isOneToOne: false
            referencedRelation: "storyboard_render_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_render_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "storyboard_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_render_runs: {
        Row: {
          completed_at: string | null
          created_by: string
          failed: number
          id: string
          last_error: string | null
          project_id: string
          queued: number
          run_id: string
          running: number
          started_at: string
          status: string
          succeeded: number
          total: number
          unit_keys: string[] | null
        }
        Insert: {
          completed_at?: string | null
          created_by: string
          failed?: number
          id?: string
          last_error?: string | null
          project_id: string
          queued?: number
          run_id: string
          running?: number
          started_at?: string
          status?: string
          succeeded?: number
          total?: number
          unit_keys?: string[] | null
        }
        Update: {
          completed_at?: string | null
          created_by?: string
          failed?: number
          id?: string
          last_error?: string | null
          project_id?: string
          queued?: number
          run_id?: string
          running?: number
          started_at?: string
          status?: string
          succeeded?: number
          total?: number
          unit_keys?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_render_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "storyboard_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboard_runs: {
        Row: {
          aspect_ratio: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          project_id: string
          source_visual_unit_run_id: string | null
          status: string
          style_preset: string
          unit_keys: string[]
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          project_id: string
          source_visual_unit_run_id?: string | null
          status?: string
          style_preset?: string
          unit_keys?: string[]
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          project_id?: string
          source_visual_unit_run_id?: string | null
          status?: string
          style_preset?: string
          unit_keys?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_runs_source_visual_unit_run_id_fkey"
            columns: ["source_visual_unit_run_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      style_evals: {
        Row: {
          attempt: number
          created_at: string
          deltas: Json
          document_id: string
          drift_level: string
          fingerprint: Json
          id: string
          lane: string
          project_id: string
          score: number
          target: Json
          team_voice_id: string | null
          team_voice_label: string | null
          version_id: string
          voice_source: string
          writing_voice_id: string | null
          writing_voice_label: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          deltas?: Json
          document_id: string
          drift_level?: string
          fingerprint?: Json
          id?: string
          lane?: string
          project_id: string
          score?: number
          target?: Json
          team_voice_id?: string | null
          team_voice_label?: string | null
          version_id: string
          voice_source?: string
          writing_voice_id?: string | null
          writing_voice_label?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          deltas?: Json
          document_id?: string
          drift_level?: string
          fingerprint?: Json
          id?: string
          lane?: string
          project_id?: string
          score?: number
          target?: Json
          team_voice_id?: string | null
          team_voice_label?: string | null
          version_id?: string
          voice_source?: string
          writing_voice_id?: string | null
          writing_voice_label?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          seats_included: number
          seats_used: number
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          seats_included?: number
          seats_used?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          seats_included?: number
          seats_used?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_health_checks: {
        Row: {
          check_name: string
          checks: Json
          created_at: string
          evidence: Json
          failures: string[]
          id: string
          pass: boolean
          user_id: string | null
        }
        Insert: {
          check_name: string
          checks?: Json
          created_at?: string
          evidence?: Json
          failures?: string[]
          id?: string
          pass: boolean
          user_id?: string | null
        }
        Update: {
          check_name?: string
          checks?: Json
          created_at?: string
          evidence?: Json
          failures?: string[]
          id?: string
          pass?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      team_voice_sources: {
        Row: {
          cowriter_labels: string[] | null
          created_at: string | null
          doc_id: string
          id: string
          is_cowritten: boolean | null
          project_id: string
          team_voice_id: string
          title: string | null
          version_id: string | null
        }
        Insert: {
          cowriter_labels?: string[] | null
          created_at?: string | null
          doc_id: string
          id?: string
          is_cowritten?: boolean | null
          project_id: string
          team_voice_id: string
          title?: string | null
          version_id?: string | null
        }
        Update: {
          cowriter_labels?: string[] | null
          created_at?: string | null
          doc_id?: string
          id?: string
          is_cowritten?: boolean | null
          project_id?: string
          team_voice_id?: string
          title?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_voice_sources_team_voice_id_fkey"
            columns: ["team_voice_id"]
            isOneToOne: false
            referencedRelation: "team_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      team_voices: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          label: string
          lane_group: string | null
          owner_user_id: string
          profile_json: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          label: string
          lane_group?: string | null
          owner_user_id: string
          profile_json?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          lane_group?: string | null
          owner_user_id?: string
          profile_json?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      territory_cost_index: {
        Row: {
          accommodation_day: number
          confidence: string
          cost_index: number
          created_at: string
          crew_day_rate_high: number
          crew_day_rate_low: number
          currency: string
          id: string
          incentive_headline: string
          infrastructure_rating: string
          labor_quality: string
          last_verified_at: string
          location_permit_avg: number
          notes: string
          per_diem: number
          region: string
          source_url: string
          stage_day_rate: number
          territory: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accommodation_day?: number
          confidence?: string
          cost_index?: number
          created_at?: string
          crew_day_rate_high?: number
          crew_day_rate_low?: number
          currency?: string
          id?: string
          incentive_headline?: string
          infrastructure_rating?: string
          labor_quality?: string
          last_verified_at?: string
          location_permit_avg?: number
          notes?: string
          per_diem?: number
          region?: string
          source_url?: string
          stage_day_rate?: number
          territory: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accommodation_day?: number
          confidence?: string
          cost_index?: number
          created_at?: string
          crew_day_rate_high?: number
          crew_day_rate_low?: number
          currency?: string
          id?: string
          incentive_headline?: string
          infrastructure_rating?: string
          labor_quality?: string
          last_verified_at?: string
          location_permit_avg?: number
          notes?: string
          per_diem?: number
          region?: string
          source_url?: string
          stage_day_rate?: number
          territory?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_migration_check: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      trailer_audio_assets: {
        Row: {
          asset_type: string | null
          audio_run_id: string | null
          bpm: number | null
          created_at: string
          created_by: string
          duration_ms: number | null
          id: string
          kind: string
          label: string
          meta_json: Json
          model: string | null
          name: string
          project_id: string
          provider: string | null
          selected: boolean
          storage_path: string
          tags: string[]
        }
        Insert: {
          asset_type?: string | null
          audio_run_id?: string | null
          bpm?: number | null
          created_at?: string
          created_by: string
          duration_ms?: number | null
          id?: string
          kind: string
          label?: string
          meta_json?: Json
          model?: string | null
          name: string
          project_id: string
          provider?: string | null
          selected?: boolean
          storage_path: string
          tags?: string[]
        }
        Update: {
          asset_type?: string | null
          audio_run_id?: string | null
          bpm?: number | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          id?: string
          kind?: string
          label?: string
          meta_json?: Json
          model?: string | null
          name?: string
          project_id?: string
          provider?: string | null
          selected?: boolean
          storage_path?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "trailer_audio_assets_audio_run_id_fkey"
            columns: ["audio_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_audio_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_audio_events: {
        Row: {
          audio_run_id: string
          created_at: string
          created_by: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          audio_run_id: string
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          audio_run_id?: string
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_audio_events_audio_run_id_fkey"
            columns: ["audio_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_audio_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_audio_jobs: {
        Row: {
          attempt: number
          audio_run_id: string
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string
          job_type: string
          payload: Json
          project_id: string
          provider_job_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          audio_run_id: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key: string
          job_type: string
          payload?: Json
          project_id: string
          provider_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          audio_run_id?: string
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          job_type?: string
          payload?: Json
          project_id?: string
          provider_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_audio_jobs_audio_run_id_fkey"
            columns: ["audio_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_audio_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_audio_runs: {
        Row: {
          blueprint_id: string | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          inputs_json: Json
          mix_json: Json
          music_bed_asset_id: string | null
          output_wav_path: string | null
          plan_json: Json
          project_id: string
          score_json: Json
          sfx_pack_tag: string | null
          status: string
          trailer_cut_id: string
          updated_at: string
        }
        Insert: {
          blueprint_id?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          inputs_json?: Json
          mix_json?: Json
          music_bed_asset_id?: string | null
          output_wav_path?: string | null
          plan_json?: Json
          project_id: string
          score_json?: Json
          sfx_pack_tag?: string | null
          status?: string
          trailer_cut_id: string
          updated_at?: string
        }
        Update: {
          blueprint_id?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          inputs_json?: Json
          mix_json?: Json
          music_bed_asset_id?: string | null
          output_wav_path?: string | null
          plan_json?: Json
          project_id?: string
          score_json?: Json
          sfx_pack_tag?: string | null
          status?: string
          trailer_cut_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_audio_runs_music_bed_asset_id_fkey"
            columns: ["music_bed_asset_id"]
            isOneToOne: false
            referencedRelation: "trailer_audio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_audio_runs_trailer_cut_id_fkey"
            columns: ["trailer_cut_id"]
            isOneToOne: false
            referencedRelation: "trailer_cuts"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_blueprints: {
        Row: {
          arc_type: string
          audio_plan: Json
          created_at: string
          created_by: string
          edl: Json
          error: string | null
          id: string
          options: Json
          project_id: string
          rhythm_analysis: Json
          status: string
          storyboard_run_id: string | null
          text_card_plan: Json
          updated_at: string
        }
        Insert: {
          arc_type?: string
          audio_plan?: Json
          created_at?: string
          created_by: string
          edl?: Json
          error?: string | null
          id?: string
          options?: Json
          project_id: string
          rhythm_analysis?: Json
          status?: string
          storyboard_run_id?: string | null
          text_card_plan?: Json
          updated_at?: string
        }
        Update: {
          arc_type?: string
          audio_plan?: Json
          created_at?: string
          created_by?: string
          edl?: Json
          error?: string | null
          id?: string
          options?: Json
          project_id?: string
          rhythm_analysis?: Json
          status?: string
          storyboard_run_id?: string | null
          text_card_plan?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_blueprints_storyboard_run_id_fkey"
            columns: ["storyboard_run_id"]
            isOneToOne: false
            referencedRelation: "storyboard_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_clip_attempts: {
        Row: {
          attempt_index: number
          clip_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          error: string | null
          eval_failures: Json | null
          eval_metrics: Json | null
          eval_model: string | null
          eval_score: number | null
          eval_version: string | null
          id: string
          job_id: string | null
          model: string | null
          output_public_url: string | null
          output_storage_path: string | null
          project_id: string
          prompt: string | null
          prompt_hash: string
          prompt_version: string | null
          provider: string | null
          run_id: string | null
          seed: string | null
          settings: Json
          started_at: string | null
          status: string
        }
        Insert: {
          attempt_index?: number
          clip_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          eval_failures?: Json | null
          eval_metrics?: Json | null
          eval_model?: string | null
          eval_score?: number | null
          eval_version?: string | null
          id?: string
          job_id?: string | null
          model?: string | null
          output_public_url?: string | null
          output_storage_path?: string | null
          project_id: string
          prompt?: string | null
          prompt_hash?: string
          prompt_version?: string | null
          provider?: string | null
          run_id?: string | null
          seed?: string | null
          settings?: Json
          started_at?: string | null
          status?: string
        }
        Update: {
          attempt_index?: number
          clip_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          eval_failures?: Json | null
          eval_metrics?: Json | null
          eval_model?: string | null
          eval_score?: number | null
          eval_version?: string | null
          id?: string
          job_id?: string | null
          model?: string | null
          output_public_url?: string | null
          output_storage_path?: string | null
          project_id?: string
          prompt?: string | null
          prompt_hash?: string
          prompt_version?: string | null
          provider?: string | null
          run_id?: string | null
          seed?: string | null
          settings?: Json
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      trailer_clip_events: {
        Row: {
          beat_index: number | null
          blueprint_id: string
          clip_id: string | null
          clip_run_id: string | null
          created_at: string
          created_by: string
          event_type: string
          id: string
          job_id: string | null
          payload: Json
          project_id: string
        }
        Insert: {
          beat_index?: number | null
          blueprint_id: string
          clip_id?: string | null
          clip_run_id?: string | null
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          job_id?: string | null
          payload?: Json
          project_id: string
        }
        Update: {
          beat_index?: number | null
          blueprint_id?: string
          clip_id?: string | null
          clip_run_id?: string | null
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          job_id?: string | null
          payload?: Json
          project_id?: string
        }
        Relationships: []
      }
      trailer_clip_jobs: {
        Row: {
          aspect_ratio: string
          attempt: number
          beat_index: number
          blueprint_id: string
          candidate_index: number
          claimed_at: string | null
          clip_run_id: string | null
          created_at: string
          error: string | null
          fps: number
          id: string
          idempotency_key: string
          init_image_paths: string[]
          length_ms: number
          max_attempts: number
          mode: string
          params_json: Json
          project_id: string
          prompt: string
          provider: string
          provider_job_id: string | null
          seed: string
          status: string
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string
          attempt?: number
          beat_index: number
          blueprint_id: string
          candidate_index?: number
          claimed_at?: string | null
          clip_run_id?: string | null
          created_at?: string
          error?: string | null
          fps?: number
          id?: string
          idempotency_key?: string
          init_image_paths?: string[]
          length_ms?: number
          max_attempts?: number
          mode?: string
          params_json?: Json
          project_id: string
          prompt?: string
          provider?: string
          provider_job_id?: string | null
          seed?: string
          status?: string
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string
          attempt?: number
          beat_index?: number
          blueprint_id?: string
          candidate_index?: number
          claimed_at?: string | null
          clip_run_id?: string | null
          created_at?: string
          error?: string | null
          fps?: number
          id?: string
          idempotency_key?: string
          init_image_paths?: string[]
          length_ms?: number
          max_attempts?: number
          mode?: string
          params_json?: Json
          project_id?: string
          prompt?: string
          provider?: string
          provider_job_id?: string | null
          seed?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_clip_jobs_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "trailer_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_clip_jobs_clip_run_id_fkey"
            columns: ["clip_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_clip_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_clip_runs: {
        Row: {
          blueprint_id: string
          created_at: string
          created_by: string
          done_jobs: number
          failed_jobs: number
          id: string
          project_id: string
          status: string
          total_jobs: number
          updated_at: string
        }
        Insert: {
          blueprint_id: string
          created_at?: string
          created_by: string
          done_jobs?: number
          failed_jobs?: number
          id?: string
          project_id: string
          status?: string
          total_jobs?: number
          updated_at?: string
        }
        Update: {
          blueprint_id?: string
          created_at?: string
          created_by?: string
          done_jobs?: number
          failed_jobs?: number
          id?: string
          project_id?: string
          status?: string
          total_jobs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_clip_runs_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "trailer_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_clip_scores: {
        Row: {
          artifact_penalty: number | null
          beat_index: number
          blueprint_id: string
          clip_id: string
          created_at: string
          created_by: string
          creative_flags: Json | null
          creative_score: number | null
          id: string
          judge_model: string | null
          project_id: string
          raw_response: Json | null
          style_cohesion_score: number | null
          technical_clarity_score: number | null
          technical_flags: Json
          technical_motion_score: number | null
          technical_overall: number | null
        }
        Insert: {
          artifact_penalty?: number | null
          beat_index: number
          blueprint_id: string
          clip_id: string
          created_at?: string
          created_by?: string
          creative_flags?: Json | null
          creative_score?: number | null
          id?: string
          judge_model?: string | null
          project_id: string
          raw_response?: Json | null
          style_cohesion_score?: number | null
          technical_clarity_score?: number | null
          technical_flags?: Json
          technical_motion_score?: number | null
          technical_overall?: number | null
        }
        Update: {
          artifact_penalty?: number | null
          beat_index?: number
          blueprint_id?: string
          clip_id?: string
          created_at?: string
          created_by?: string
          creative_flags?: Json | null
          creative_score?: number | null
          id?: string
          judge_model?: string | null
          project_id?: string
          raw_response?: Json | null
          style_cohesion_score?: number | null
          technical_clarity_score?: number | null
          technical_flags?: Json
          technical_motion_score?: number | null
          technical_overall?: number | null
        }
        Relationships: []
      }
      trailer_clips: {
        Row: {
          artifact_score: number | null
          aspect_ratio: string
          attempts_count: number
          auto_rejected: boolean
          beat_index: number
          best_attempt_id: string | null
          best_score: number | null
          blueprint_id: string
          candidate_index: number
          clarity_score: number | null
          clip_run_id: string | null
          continuity_scored_at: string | null
          continuity_tags_json: Json | null
          continuity_version: string | null
          created_at: string
          created_by: string
          duration_ms: number | null
          error: string | null
          fps: number
          framing_score: number | null
          gen_params: Json
          id: string
          job_id: string | null
          last_attempt_at: string | null
          media_type: string
          mode: string
          model: string | null
          motion_score: number | null
          project_id: string
          provider: string
          public_url: string | null
          quality_flags_json: Json | null
          rating: number | null
          rejection_reason: string | null
          score_json: Json
          seed: string | null
          selected: boolean
          status: string
          storage_path: string | null
          style_match_score: number | null
          technical_score: number | null
          thumb_path: string | null
          updated_at: string
          used_in_cut: boolean
        }
        Insert: {
          artifact_score?: number | null
          aspect_ratio?: string
          attempts_count?: number
          auto_rejected?: boolean
          beat_index: number
          best_attempt_id?: string | null
          best_score?: number | null
          blueprint_id: string
          candidate_index?: number
          clarity_score?: number | null
          clip_run_id?: string | null
          continuity_scored_at?: string | null
          continuity_tags_json?: Json | null
          continuity_version?: string | null
          created_at?: string
          created_by: string
          duration_ms?: number | null
          error?: string | null
          fps?: number
          framing_score?: number | null
          gen_params?: Json
          id?: string
          job_id?: string | null
          last_attempt_at?: string | null
          media_type?: string
          mode?: string
          model?: string | null
          motion_score?: number | null
          project_id: string
          provider?: string
          public_url?: string | null
          quality_flags_json?: Json | null
          rating?: number | null
          rejection_reason?: string | null
          score_json?: Json
          seed?: string | null
          selected?: boolean
          status?: string
          storage_path?: string | null
          style_match_score?: number | null
          technical_score?: number | null
          thumb_path?: string | null
          updated_at?: string
          used_in_cut?: boolean
        }
        Update: {
          artifact_score?: number | null
          aspect_ratio?: string
          attempts_count?: number
          auto_rejected?: boolean
          beat_index?: number
          best_attempt_id?: string | null
          best_score?: number | null
          blueprint_id?: string
          candidate_index?: number
          clarity_score?: number | null
          clip_run_id?: string | null
          continuity_scored_at?: string | null
          continuity_tags_json?: Json | null
          continuity_version?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          error?: string | null
          fps?: number
          framing_score?: number | null
          gen_params?: Json
          id?: string
          job_id?: string | null
          last_attempt_at?: string | null
          media_type?: string
          mode?: string
          model?: string | null
          motion_score?: number | null
          project_id?: string
          provider?: string
          public_url?: string | null
          quality_flags_json?: Json | null
          rating?: number | null
          rejection_reason?: string | null
          score_json?: Json
          seed?: string | null
          selected?: boolean
          status?: string
          storage_path?: string | null
          style_match_score?: number | null
          technical_score?: number | null
          thumb_path?: string | null
          updated_at?: string
          used_in_cut?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "trailer_clips_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "trailer_blueprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_clips_clip_run_id_fkey"
            columns: ["clip_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_clip_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "trailer_clip_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_continuity_events: {
        Row: {
          continuity_run_id: string
          created_at: string
          created_by: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          continuity_run_id: string
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          continuity_run_id?: string
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_continuity_events_continuity_run_id_fkey"
            columns: ["continuity_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_continuity_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_continuity_runs: {
        Row: {
          blueprint_id: string | null
          clip_run_id: string | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          method: string
          project_id: string
          settings_json: Json | null
          status: string
          summary_json: Json | null
          trailer_cut_id: string
        }
        Insert: {
          blueprint_id?: string | null
          clip_run_id?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          method?: string
          project_id: string
          settings_json?: Json | null
          status?: string
          summary_json?: Json | null
          trailer_cut_id: string
        }
        Update: {
          blueprint_id?: string | null
          clip_run_id?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          method?: string
          project_id?: string
          settings_json?: Json | null
          status?: string
          summary_json?: Json | null
          trailer_cut_id?: string
        }
        Relationships: []
      }
      trailer_continuity_scores: {
        Row: {
          continuity_run_id: string
          created_at: string
          created_by: string
          from_beat_index: number
          from_clip_id: string | null
          id: string
          issues_json: Json | null
          project_id: string
          score: number
          subscores_json: Json | null
          suggestion_json: Json | null
          to_beat_index: number
          to_clip_id: string | null
          trailer_cut_id: string
        }
        Insert: {
          continuity_run_id: string
          created_at?: string
          created_by: string
          from_beat_index: number
          from_clip_id?: string | null
          id?: string
          issues_json?: Json | null
          project_id: string
          score?: number
          subscores_json?: Json | null
          suggestion_json?: Json | null
          to_beat_index: number
          to_clip_id?: string | null
          trailer_cut_id: string
        }
        Update: {
          continuity_run_id?: string
          created_at?: string
          created_by?: string
          from_beat_index?: number
          from_clip_id?: string | null
          id?: string
          issues_json?: Json | null
          project_id?: string
          score?: number
          subscores_json?: Json | null
          suggestion_json?: Json | null
          to_beat_index?: number
          to_clip_id?: string | null
          trailer_cut_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_continuity_scores_continuity_run_id_fkey"
            columns: ["continuity_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_continuity_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_cut_events: {
        Row: {
          beat_index: number | null
          blueprint_id: string | null
          created_at: string
          created_by: string
          cut_id: string
          event_type: string
          id: string
          payload: Json
          project_id: string
        }
        Insert: {
          beat_index?: number | null
          blueprint_id?: string | null
          created_at?: string
          created_by: string
          cut_id: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
        }
        Update: {
          beat_index?: number | null
          blueprint_id?: string | null
          created_at?: string
          created_by?: string
          cut_id?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_cut_events_cut_id_fkey"
            columns: ["cut_id"]
            isOneToOne: false
            referencedRelation: "trailer_cuts"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_cuts: {
        Row: {
          arc_type: string | null
          auto_assembly_json: Json | null
          blueprint_id: string
          created_at: string
          created_by: string
          duration_ms: number | null
          edl_export: Json | null
          error: string | null
          gates_json: Json | null
          id: string
          options: Json
          output_mp4_path: string | null
          output_wav_path: string | null
          project_id: string
          public_url: string | null
          render_fps: number
          render_height: number
          render_width: number
          status: string
          storage_path: string | null
          timeline: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          arc_type?: string | null
          auto_assembly_json?: Json | null
          blueprint_id: string
          created_at?: string
          created_by: string
          duration_ms?: number | null
          edl_export?: Json | null
          error?: string | null
          gates_json?: Json | null
          id?: string
          options?: Json
          output_mp4_path?: string | null
          output_wav_path?: string | null
          project_id: string
          public_url?: string | null
          render_fps?: number
          render_height?: number
          render_width?: number
          status?: string
          storage_path?: string | null
          timeline?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          arc_type?: string | null
          auto_assembly_json?: Json | null
          blueprint_id?: string
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          edl_export?: Json | null
          error?: string | null
          gates_json?: Json | null
          id?: string
          options?: Json
          output_mp4_path?: string | null
          output_wav_path?: string | null
          project_id?: string
          public_url?: string | null
          render_fps?: number
          render_height?: number
          render_width?: number
          status?: string
          storage_path?: string | null
          timeline?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_cuts_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "trailer_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_definition_pack_items: {
        Row: {
          created_at: string
          document_id: string
          id: string
          include: boolean
          notes: string | null
          pack_id: string
          project_id: string
          role: string
          sort_order: number
          version_id: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          include?: boolean
          notes?: string | null
          pack_id: string
          project_id: string
          role?: string
          sort_order?: number
          version_id?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          include?: boolean
          notes?: string | null
          pack_id?: string
          project_id?: string
          role?: string
          sort_order?: number
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_definition_pack_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_definition_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "trailer_definition_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_definition_pack_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_definition_packs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      trailer_finishing_profiles: {
        Row: {
          color_consistency_enabled: boolean
          color_consistency_strength: number
          contrast_boost: number
          created_at: string
          created_by: string | null
          grain_amount: number
          highlights_rolloff: number
          id: string
          is_preset: boolean
          letterbox_enabled: boolean
          letterbox_ratio: string | null
          lufs_target: number
          lut_storage_path: string | null
          name: string
          project_id: string | null
          saturation_boost: number
          sharpen_amount: number
          true_peak_db: number
          updated_at: string
          vignette_amount: number
        }
        Insert: {
          color_consistency_enabled?: boolean
          color_consistency_strength?: number
          contrast_boost?: number
          created_at?: string
          created_by?: string | null
          grain_amount?: number
          highlights_rolloff?: number
          id?: string
          is_preset?: boolean
          letterbox_enabled?: boolean
          letterbox_ratio?: string | null
          lufs_target?: number
          lut_storage_path?: string | null
          name?: string
          project_id?: string | null
          saturation_boost?: number
          sharpen_amount?: number
          true_peak_db?: number
          updated_at?: string
          vignette_amount?: number
        }
        Update: {
          color_consistency_enabled?: boolean
          color_consistency_strength?: number
          contrast_boost?: number
          created_at?: string
          created_by?: string | null
          grain_amount?: number
          highlights_rolloff?: number
          id?: string
          is_preset?: boolean
          letterbox_enabled?: boolean
          letterbox_ratio?: string | null
          lufs_target?: number
          lut_storage_path?: string | null
          name?: string
          project_id?: string | null
          saturation_boost?: number
          sharpen_amount?: number
          true_peak_db?: number
          updated_at?: string
          vignette_amount?: number
        }
        Relationships: []
      }
      trailer_judge_v2_runs: {
        Row: {
          created_at: string
          created_by: string
          flags: string[] | null
          id: string
          project_id: string
          repair_actions_json: Json | null
          rhythm_run_id: string | null
          rubric_version: string
          scores_json: Json
          script_run_id: string | null
          shot_design_run_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          flags?: string[] | null
          id?: string
          project_id: string
          repair_actions_json?: Json | null
          rhythm_run_id?: string | null
          rubric_version?: string
          scores_json?: Json
          script_run_id?: string | null
          shot_design_run_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          flags?: string[] | null
          id?: string
          project_id?: string
          repair_actions_json?: Json | null
          rhythm_run_id?: string | null
          rubric_version?: string
          scores_json?: Json
          script_run_id?: string | null
          shot_design_run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_judge_v2_runs_rhythm_run_id_fkey"
            columns: ["rhythm_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_rhythm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_judge_v2_runs_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_judge_v2_runs_shot_design_run_id_fkey"
            columns: ["shot_design_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_shot_design_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_learning_signals: {
        Row: {
          created_by: string | null
          genre_key: string | null
          id: string
          occurred_at: string
          platform_key: string | null
          project_id: string
          script_run_id: string | null
          signal_key: string
          signal_type: Database["public"]["Enums"]["trailer_signal_type"]
          signal_value_json: Json | null
          signal_value_num: number | null
          source: string
          trailer_run_id: string | null
          weight: number
        }
        Insert: {
          created_by?: string | null
          genre_key?: string | null
          id?: string
          occurred_at?: string
          platform_key?: string | null
          project_id: string
          script_run_id?: string | null
          signal_key: string
          signal_type: Database["public"]["Enums"]["trailer_signal_type"]
          signal_value_json?: Json | null
          signal_value_num?: number | null
          source?: string
          trailer_run_id?: string | null
          weight?: number
        }
        Update: {
          created_by?: string | null
          genre_key?: string | null
          id?: string
          occurred_at?: string
          platform_key?: string | null
          project_id?: string
          script_run_id?: string | null
          signal_key?: string
          signal_type?: Database["public"]["Enums"]["trailer_signal_type"]
          signal_value_json?: Json | null
          signal_value_num?: number | null
          source?: string
          trailer_run_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "trailer_learning_signals_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_look_bibles: {
        Row: {
          avoid_list: string[] | null
          camera_language: string | null
          color_grade: string | null
          contrast: string | null
          created_at: string
          created_by: string
          custom_directives: string | null
          grain: string | null
          id: string
          is_locked: boolean
          lighting_style: string | null
          palette: string | null
          project_id: string
          reference_assets_notes: string | null
          scope: string
          scope_ref_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          avoid_list?: string[] | null
          camera_language?: string | null
          color_grade?: string | null
          contrast?: string | null
          created_at?: string
          created_by: string
          custom_directives?: string | null
          grain?: string | null
          id?: string
          is_locked?: boolean
          lighting_style?: string | null
          palette?: string | null
          project_id: string
          reference_assets_notes?: string | null
          scope?: string
          scope_ref_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          avoid_list?: string[] | null
          camera_language?: string | null
          color_grade?: string | null
          contrast?: string | null
          created_at?: string
          created_by?: string
          custom_directives?: string | null
          grain?: string | null
          id?: string
          is_locked?: boolean
          lighting_style?: string | null
          palette?: string | null
          project_id?: string
          reference_assets_notes?: string | null
          scope?: string
          scope_ref_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      trailer_moments: {
        Row: {
          ai_friendly: boolean
          created_at: string
          emotional_score: number
          hook_strength: number
          id: string
          moment_summary: string
          project_id: string
          scene_number: number | null
          source_document_id: string | null
          source_version_id: string | null
          spectacle_score: number
          suggested_visual_approach: string | null
        }
        Insert: {
          ai_friendly?: boolean
          created_at?: string
          emotional_score?: number
          hook_strength?: number
          id?: string
          moment_summary: string
          project_id: string
          scene_number?: number | null
          source_document_id?: string | null
          source_version_id?: string | null
          spectacle_score?: number
          suggested_visual_approach?: string | null
        }
        Update: {
          ai_friendly?: boolean
          created_at?: string
          emotional_score?: number
          hook_strength?: number
          id?: string
          moment_summary?: string
          project_id?: string
          scene_number?: number | null
          source_document_id?: string | null
          source_version_id?: string | null
          spectacle_score?: number
          suggested_visual_approach?: string | null
        }
        Relationships: []
      }
      trailer_render_events: {
        Row: {
          created_at: string
          created_by: string
          event_type: string
          id: string
          payload: Json
          project_id: string
          render_job_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          event_type: string
          id?: string
          payload?: Json
          project_id: string
          render_job_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
          render_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_render_events_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "trailer_render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_render_jobs: {
        Row: {
          attempt: number
          audio_run_id: string | null
          claimed_at: string | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          idempotency_key: string
          input_json: Json
          output_audio_path: string | null
          output_mp4_path: string | null
          preset: string
          project_id: string
          status: string
          trailer_cut_id: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          audio_run_id?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          idempotency_key: string
          input_json?: Json
          output_audio_path?: string | null
          output_mp4_path?: string | null
          preset?: string
          project_id: string
          status?: string
          trailer_cut_id: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          audio_run_id?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          input_json?: Json
          output_audio_path?: string | null
          output_mp4_path?: string | null
          preset?: string
          project_id?: string
          status?: string
          trailer_cut_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailer_render_jobs_audio_run_id_fkey"
            columns: ["audio_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_audio_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_render_jobs_trailer_cut_id_fkey"
            columns: ["trailer_cut_id"]
            isOneToOne: false
            referencedRelation: "trailer_cuts"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_render_variants: {
        Row: {
          audio_run_id: string | null
          color_corrections_json: Json | null
          created_at: string
          created_by: string | null
          crop_mode: string
          error: string | null
          finishing_profile_id: string | null
          frame_rate: number
          height: number
          id: string
          project_id: string
          public_url: string | null
          reference_clip_id: string | null
          render_log_json: Json | null
          status: string
          storage_path_mp4: string | null
          trailer_cut_id: string
          updated_at: string
          variant_key: string
          width: number
        }
        Insert: {
          audio_run_id?: string | null
          color_corrections_json?: Json | null
          created_at?: string
          created_by?: string | null
          crop_mode?: string
          error?: string | null
          finishing_profile_id?: string | null
          frame_rate?: number
          height?: number
          id?: string
          project_id: string
          public_url?: string | null
          reference_clip_id?: string | null
          render_log_json?: Json | null
          status?: string
          storage_path_mp4?: string | null
          trailer_cut_id: string
          updated_at?: string
          variant_key?: string
          width?: number
        }
        Update: {
          audio_run_id?: string | null
          color_corrections_json?: Json | null
          created_at?: string
          created_by?: string | null
          crop_mode?: string
          error?: string | null
          finishing_profile_id?: string | null
          frame_rate?: number
          height?: number
          id?: string
          project_id?: string
          public_url?: string | null
          reference_clip_id?: string | null
          render_log_json?: Json | null
          status?: string
          storage_path_mp4?: string | null
          trailer_cut_id?: string
          updated_at?: string
          variant_key?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "trailer_render_variants_finishing_profile_id_fkey"
            columns: ["finishing_profile_id"]
            isOneToOne: false
            referencedRelation: "trailer_finishing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_rhythm_runs: {
        Row: {
          audio_plan_json: Json | null
          beat_grid_json: Json
          beat_hit_intents_json: Json | null
          bpm: number
          created_at: string
          created_by: string
          density_curve_json: Json | null
          drop_timestamp_ms: number | null
          hit_points_json: Json | null
          id: string
          phase_timings_json: Json
          project_id: string
          script_run_id: string
          seed: string | null
          shot_duration_curve_json: Json
          silence_windows_json: Json | null
          status: string
          warnings: string[] | null
        }
        Insert: {
          audio_plan_json?: Json | null
          beat_grid_json: Json
          beat_hit_intents_json?: Json | null
          bpm: number
          created_at?: string
          created_by?: string
          density_curve_json?: Json | null
          drop_timestamp_ms?: number | null
          hit_points_json?: Json | null
          id?: string
          phase_timings_json: Json
          project_id: string
          script_run_id: string
          seed?: string | null
          shot_duration_curve_json: Json
          silence_windows_json?: Json | null
          status?: string
          warnings?: string[] | null
        }
        Update: {
          audio_plan_json?: Json | null
          beat_grid_json?: Json
          beat_hit_intents_json?: Json | null
          bpm?: number
          created_at?: string
          created_by?: string
          density_curve_json?: Json | null
          drop_timestamp_ms?: number | null
          hit_points_json?: Json | null
          id?: string
          phase_timings_json?: Json
          project_id?: string
          script_run_id?: string
          seed?: string | null
          shot_duration_curve_json?: Json
          silence_windows_json?: Json | null
          status?: string
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_rhythm_runs_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_script_beats: {
        Row: {
          beat_index: number
          contrast_delta_score: number | null
          created_at: string
          emotional_intent: string
          generator_hint_json: Json | null
          id: string
          movement_intensity_target: number
          phase: Database["public"]["Enums"]["trailer_phase"]
          quoted_dialogue: string | null
          script_run_id: string
          shot_density_target: number | null
          silence_after_ms: number
          silence_before_ms: number
          source_refs_json: Json
          text_card: string | null
          title: string | null
          trailer_moment_flag: boolean
          withholding_note: string | null
        }
        Insert: {
          beat_index: number
          contrast_delta_score?: number | null
          created_at?: string
          emotional_intent: string
          generator_hint_json?: Json | null
          id?: string
          movement_intensity_target?: number
          phase: Database["public"]["Enums"]["trailer_phase"]
          quoted_dialogue?: string | null
          script_run_id: string
          shot_density_target?: number | null
          silence_after_ms?: number
          silence_before_ms?: number
          source_refs_json?: Json
          text_card?: string | null
          title?: string | null
          trailer_moment_flag?: boolean
          withholding_note?: string | null
        }
        Update: {
          beat_index?: number
          contrast_delta_score?: number | null
          created_at?: string
          emotional_intent?: string
          generator_hint_json?: Json | null
          id?: string
          movement_intensity_target?: number
          phase?: Database["public"]["Enums"]["trailer_phase"]
          quoted_dialogue?: string | null
          script_run_id?: string
          shot_density_target?: number | null
          silence_after_ms?: number
          silence_before_ms?: number
          source_refs_json?: Json
          text_card?: string | null
          title?: string | null
          trailer_moment_flag?: boolean
          withholding_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_script_beats_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_script_runs: {
        Row: {
          avoid_notes: string | null
          bpm: number | null
          canon_context_hash: string | null
          canon_context_meta_json: Json | null
          canon_pack_id: string
          cinematic_score: number | null
          contrast_curve_json: Json | null
          created_at: string
          created_by: string
          drop_timestamp_ms: number | null
          escalation_curve_json: Json | null
          gates_json: Json | null
          genre_key: string
          id: string
          inspiration_refs_json: Json
          is_selected: boolean
          movement_curve_json: Json | null
          platform_key: string
          project_id: string
          reference_notes: string | null
          seed: string | null
          silence_windows_json: Json | null
          status: string
          strict_canon_mode: string
          structure_score: number | null
          style_options_json: Json
          style_preset_key: string | null
          target_length_ms: number | null
          trailer_type: string
          variant_label: string | null
          warnings: string[] | null
        }
        Insert: {
          avoid_notes?: string | null
          bpm?: number | null
          canon_context_hash?: string | null
          canon_context_meta_json?: Json | null
          canon_pack_id: string
          cinematic_score?: number | null
          contrast_curve_json?: Json | null
          created_at?: string
          created_by?: string
          drop_timestamp_ms?: number | null
          escalation_curve_json?: Json | null
          gates_json?: Json | null
          genre_key?: string
          id?: string
          inspiration_refs_json?: Json
          is_selected?: boolean
          movement_curve_json?: Json | null
          platform_key?: string
          project_id: string
          reference_notes?: string | null
          seed?: string | null
          silence_windows_json?: Json | null
          status?: string
          strict_canon_mode?: string
          structure_score?: number | null
          style_options_json?: Json
          style_preset_key?: string | null
          target_length_ms?: number | null
          trailer_type?: string
          variant_label?: string | null
          warnings?: string[] | null
        }
        Update: {
          avoid_notes?: string | null
          bpm?: number | null
          canon_context_hash?: string | null
          canon_context_meta_json?: Json | null
          canon_pack_id?: string
          cinematic_score?: number | null
          contrast_curve_json?: Json | null
          created_at?: string
          created_by?: string
          drop_timestamp_ms?: number | null
          escalation_curve_json?: Json | null
          gates_json?: Json | null
          genre_key?: string
          id?: string
          inspiration_refs_json?: Json
          is_selected?: boolean
          movement_curve_json?: Json | null
          platform_key?: string
          project_id?: string
          reference_notes?: string | null
          seed?: string | null
          silence_windows_json?: Json | null
          status?: string
          strict_canon_mode?: string
          structure_score?: number | null
          style_options_json?: Json
          style_preset_key?: string | null
          target_length_ms?: number | null
          trailer_type?: string
          variant_label?: string | null
          warnings?: string[] | null
        }
        Relationships: []
      }
      trailer_shot_design_runs: {
        Row: {
          created_at: string
          created_by: string
          gates_json: Json | null
          global_movement_curve_json: Json | null
          id: string
          lens_bias_json: Json | null
          project_id: string
          rhythm_run_id: string | null
          script_run_id: string
          seed: string | null
          status: string
          warnings: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          gates_json?: Json | null
          global_movement_curve_json?: Json | null
          id?: string
          lens_bias_json?: Json | null
          project_id: string
          rhythm_run_id?: string | null
          script_run_id: string
          seed?: string | null
          status?: string
          warnings?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string
          gates_json?: Json | null
          global_movement_curve_json?: Json | null
          id?: string
          lens_bias_json?: Json | null
          project_id?: string
          rhythm_run_id?: string | null
          script_run_id?: string
          seed?: string | null
          status?: string
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_shot_design_runs_rhythm_run_id_fkey"
            columns: ["rhythm_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_rhythm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_shot_design_runs_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_shot_specs: {
        Row: {
          beat_id: string
          camera_move: Database["public"]["Enums"]["camera_move"]
          created_at: string
          depth_strategy: string | null
          foreground_element: string | null
          id: string
          lens_mm: number | null
          lighting_note: string | null
          movement_intensity: number
          prompt_hint_json: Json
          shot_design_run_id: string
          shot_index: number
          shot_type: Database["public"]["Enums"]["shot_type"]
          target_duration_ms: number | null
          transition_in: string | null
          transition_out: string | null
        }
        Insert: {
          beat_id: string
          camera_move: Database["public"]["Enums"]["camera_move"]
          created_at?: string
          depth_strategy?: string | null
          foreground_element?: string | null
          id?: string
          lens_mm?: number | null
          lighting_note?: string | null
          movement_intensity?: number
          prompt_hint_json?: Json
          shot_design_run_id: string
          shot_index: number
          shot_type: Database["public"]["Enums"]["shot_type"]
          target_duration_ms?: number | null
          transition_in?: string | null
          transition_out?: string | null
        }
        Update: {
          beat_id?: string
          camera_move?: Database["public"]["Enums"]["camera_move"]
          created_at?: string
          depth_strategy?: string | null
          foreground_element?: string | null
          id?: string
          lens_mm?: number | null
          lighting_note?: string | null
          movement_intensity?: number
          prompt_hint_json?: Json
          shot_design_run_id?: string
          shot_index?: number
          shot_type?: Database["public"]["Enums"]["shot_type"]
          target_duration_ms?: number | null
          transition_in?: string | null
          transition_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_shot_specs_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "trailer_script_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_shot_specs_shot_design_run_id_fkey"
            columns: ["shot_design_run_id"]
            isOneToOne: false
            referencedRelation: "trailer_shot_design_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trailer_shotlists: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          project_id: string
          selected_indices: number[] | null
          source_moment_ids: string[]
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          project_id: string
          selected_indices?: number[] | null
          source_moment_ids?: string[]
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          project_id?: string
          selected_indices?: number[] | null
          source_moment_ids?: string[]
          status?: string
        }
        Relationships: []
      }
      trailer_style_presets: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          preset_json: Json
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name: string
          preset_json?: Json
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          preset_json?: Json
          project_id?: string
        }
        Relationships: []
      }
      treatment_acts: {
        Row: {
          act_blueprint: Json | null
          act_key: string
          act_number: number
          arc_state_deltas: Json | null
          content: string | null
          content_hash: string | null
          created_at: string | null
          error_message: string | null
          id: string
          label: string
          revised_at: string | null
          revised_by: string | null
          status: string | null
          treatment_id: string
        }
        Insert: {
          act_blueprint?: Json | null
          act_key: string
          act_number: number
          arc_state_deltas?: Json | null
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          label: string
          revised_at?: string | null
          revised_by?: string | null
          status?: string | null
          treatment_id: string
        }
        Update: {
          act_blueprint?: Json | null
          act_key?: string
          act_number?: number
          arc_state_deltas?: Json | null
          content?: string | null
          content_hash?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          label?: string
          revised_at?: string | null
          revised_by?: string | null
          status?: string | null
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_acts_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_engines: {
        Row: {
          base_weight_default: number
          confidence: string
          created_at: string
          description: string
          enabled: boolean
          engine_name: string
          engine_type: string
          id: string
          intelligence_layer: string
          last_refresh: string | null
          refresh_frequency: string
          status: string
          updated_at: string
        }
        Insert: {
          base_weight_default?: number
          confidence?: string
          created_at?: string
          description?: string
          enabled?: boolean
          engine_name: string
          engine_type?: string
          id?: string
          intelligence_layer?: string
          last_refresh?: string | null
          refresh_frequency?: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_weight_default?: number
          confidence?: string
          created_at?: string
          description?: string
          enabled?: boolean
          engine_name?: string
          engine_type?: string
          id?: string
          intelligence_layer?: string
          last_refresh?: string | null
          refresh_frequency?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trend_observations: {
        Row: {
          cluster_id: string | null
          created_at: string
          extraction_confidence: number
          format_hint: string | null
          id: string
          ingested_by: string
          observed_at: string | null
          raw_metrics: Json
          raw_text: string | null
          source_name: string
          source_type: string
          source_url: string | null
          tags: Json
          user_id: string | null
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          extraction_confidence?: number
          format_hint?: string | null
          id?: string
          ingested_by?: string
          observed_at?: string | null
          raw_metrics?: Json
          raw_text?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          tags?: Json
          user_id?: string | null
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          extraction_confidence?: number
          format_hint?: string | null
          id?: string
          ingested_by?: string
          observed_at?: string | null
          raw_metrics?: Json
          raw_text?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          tags?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      trend_refresh_runs: {
        Row: {
          cast_total: number
          citations_total: number
          completed_types: string[]
          created_at: string
          error: string | null
          id: string
          meta: Json
          model_grounding: string | null
          model_trends: string | null
          ok: boolean
          recency_filter: string | null
          requested_types: string[]
          scope: string
          signals_total: number
          trigger: string
        }
        Insert: {
          cast_total?: number
          citations_total?: number
          completed_types?: string[]
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json
          model_grounding?: string | null
          model_trends?: string | null
          ok?: boolean
          recency_filter?: string | null
          requested_types?: string[]
          scope?: string
          signals_total?: number
          trigger?: string
        }
        Update: {
          cast_total?: number
          citations_total?: number
          completed_types?: string[]
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json
          model_grounding?: string | null
          model_trends?: string | null
          ok?: boolean
          recency_filter?: string | null
          requested_types?: string[]
          scope?: string
          signals_total?: number
          trigger?: string
        }
        Relationships: []
      }
      trend_signals: {
        Row: {
          archived_at: string | null
          budget_tier: string
          category: string
          cluster_scoring: Json
          created_at: string
          cycle_phase: string
          description: string
          dimension: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_text_hash: string | null
          embedding_text_len: number | null
          example_titles: Json
          explanation: string
          first_detected_at: string
          forecast: string
          format_applicability: Json
          format_tags: string[]
          genre_tags: string[]
          id: string
          intel_run_id: string | null
          lane_relevance: string[]
          last_updated_at: string
          modality: string | null
          name: string
          narrative_tags: string[]
          production_type: string
          refresh_run_id: string | null
          region: string
          saturation_risk: string
          signal_tags: string[]
          source_citations: Json | null
          sources_count: number
          sources_used: Json
          status: string
          strength: number
          style_tags: string[]
          tags: string[] | null
          target_buyer: string
          tone_tags: string[]
          updated_bucket: string | null
          velocity: string
        }
        Insert: {
          archived_at?: string | null
          budget_tier?: string
          category: string
          cluster_scoring?: Json
          created_at?: string
          cycle_phase: string
          description?: string
          dimension?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text_hash?: string | null
          embedding_text_len?: number | null
          example_titles?: Json
          explanation: string
          first_detected_at?: string
          forecast?: string
          format_applicability?: Json
          format_tags?: string[]
          genre_tags?: string[]
          id?: string
          intel_run_id?: string | null
          lane_relevance?: string[]
          last_updated_at?: string
          modality?: string | null
          name: string
          narrative_tags?: string[]
          production_type?: string
          refresh_run_id?: string | null
          region?: string
          saturation_risk?: string
          signal_tags?: string[]
          source_citations?: Json | null
          sources_count?: number
          sources_used?: Json
          status?: string
          strength?: number
          style_tags?: string[]
          tags?: string[] | null
          target_buyer?: string
          tone_tags?: string[]
          updated_bucket?: string | null
          velocity?: string
        }
        Update: {
          archived_at?: string | null
          budget_tier?: string
          category?: string
          cluster_scoring?: Json
          created_at?: string
          cycle_phase?: string
          description?: string
          dimension?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text_hash?: string | null
          embedding_text_len?: number | null
          example_titles?: Json
          explanation?: string
          first_detected_at?: string
          forecast?: string
          format_applicability?: Json
          format_tags?: string[]
          genre_tags?: string[]
          id?: string
          intel_run_id?: string | null
          lane_relevance?: string[]
          last_updated_at?: string
          modality?: string | null
          name?: string
          narrative_tags?: string[]
          production_type?: string
          refresh_run_id?: string | null
          region?: string
          saturation_risk?: string
          signal_tags?: string[]
          source_citations?: Json | null
          sources_count?: number
          sources_used?: Json
          status?: string
          strength?: number
          style_tags?: string[]
          tags?: string[] | null
          target_buyer?: string
          tone_tags?: string[]
          updated_bucket?: string | null
          velocity?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_signals_intel_run_id_fkey"
            columns: ["intel_run_id"]
            isOneToOne: false
            referencedRelation: "intel_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_signals_refresh_run_id_fkey"
            columns: ["refresh_run_id"]
            isOneToOne: false
            referencedRelation: "trend_refresh_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_weekly_briefs: {
        Row: {
          created_at: string
          id: string
          production_type: string
          summary: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          production_type?: string
          summary: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          production_type?: string
          summary?: string
          week_start?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          ai_analyses_used: number
          buyer_contacts_count: number
          cast_research_used: number
          created_at: string
          id: string
          period_start: string
          projects_count: number
          storage_bytes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analyses_used?: number
          buyer_contacts_count?: number
          cast_research_used?: number
          created_at?: string
          id?: string
          period_start?: string
          projects_count?: number
          storage_bytes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analyses_used?: number
          buyer_contacts_count?: number
          cast_research_used?: number
          created_at?: string
          id?: string
          period_start?: string
          projects_count?: number
          storage_bytes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          owner_id: string
          prefs: Json
          updated_at: string
        }
        Insert: {
          owner_id: string
          prefs?: Json
          updated_at?: string
        }
        Update: {
          owner_id?: string
          prefs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vertical_data_sources: {
        Row: {
          category: string
          created_at: string
          id: string
          notes: string
          refresh_frequency: string
          region: string
          reliability_score: number
          source_name: string
          source_type: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          notes?: string
          refresh_frequency?: string
          region?: string
          reliability_score?: number
          source_name: string
          source_type?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          notes?: string
          refresh_frequency?: string
          region?: string
          reliability_score?: number
          source_name?: string
          source_type?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      vertical_episode_metrics: {
        Row: {
          canon_snapshot_version: string
          created_at: string
          episode_number: number
          id: string
          metrics: Json
          project_id: string
        }
        Insert: {
          canon_snapshot_version: string
          created_at?: string
          episode_number: number
          id?: string
          metrics?: Json
          project_id: string
        }
        Update: {
          canon_snapshot_version?: string
          created_at?: string
          episode_number?: number
          id?: string
          metrics?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vertical_episode_metrics_canon_snapshot_version_fkey"
            columns: ["canon_snapshot_version"]
            isOneToOne: false
            referencedRelation: "canon_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      vertical_trend_snapshots: {
        Row: {
          created_at: string
          episode_patterns: Json
          id: string
          raw_data: Json
          region: string
          revenue_shifts: Json
          snapshot_date: string
          top_apps: Json
          top_micro_genres: Json
        }
        Insert: {
          created_at?: string
          episode_patterns?: Json
          id?: string
          raw_data?: Json
          region?: string
          revenue_shifts?: Json
          snapshot_date?: string
          top_apps?: Json
          top_micro_genres?: Json
        }
        Update: {
          created_at?: string
          episode_patterns?: Json
          id?: string
          raw_data?: Json
          region?: string
          revenue_shifts?: Json
          snapshot_date?: string
          top_apps?: Json
          top_micro_genres?: Json
        }
        Relationships: []
      }
      vfx_shots: {
        Row: {
          complexity: string
          created_at: string
          due_date: string | null
          id: string
          notes: string
          project_id: string
          shot_id: string
          status: string
          updated_at: string
          user_id: string
          vendor: string
        }
        Insert: {
          complexity?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string
          project_id: string
          shot_id?: string
          status?: string
          updated_at?: string
          user_id: string
          vendor?: string
        }
        Update: {
          complexity?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string
          project_id?: string
          shot_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          vendor?: string
        }
        Relationships: []
      }
      video_generation_plans: {
        Row: {
          continuity_report_json: Json
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          lane: string
          plan_json: Json
          plan_version: string
          project_id: string
          quality_run_id: string | null
          source: string
        }
        Insert: {
          continuity_report_json?: Json
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          lane: string
          plan_json: Json
          plan_version?: string
          project_id: string
          quality_run_id?: string | null
          source?: string
        }
        Update: {
          continuity_report_json?: Json
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          lane?: string
          plan_json?: Json
          plan_version?: string
          project_id?: string
          quality_run_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_generation_plans_quality_run_id_fkey"
            columns: ["quality_run_id"]
            isOneToOne: false
            referencedRelation: "cinematic_quality_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_render_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          plan_id: string
          project_id: string
          settings_json: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          plan_id: string
          project_id: string
          settings_json?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          plan_id?: string
          project_id?: string
          settings_json?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_render_jobs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "video_generation_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      video_render_shots: {
        Row: {
          artifact_json: Json
          attempt_count: number
          created_at: string
          id: string
          is_locked: boolean
          job_id: string
          last_error: string | null
          notes: string | null
          prompt_delta_json: Json
          prompt_json: Json
          shot_index: number
          status: string
          updated_at: string
        }
        Insert: {
          artifact_json?: Json
          attempt_count?: number
          created_at?: string
          id?: string
          is_locked?: boolean
          job_id: string
          last_error?: string | null
          notes?: string | null
          prompt_delta_json?: Json
          prompt_json?: Json
          shot_index: number
          status?: string
          updated_at?: string
        }
        Update: {
          artifact_json?: Json
          attempt_count?: number
          created_at?: string
          id?: string
          is_locked?: boolean
          job_id?: string
          last_error?: string | null
          notes?: string | null
          prompt_delta_json?: Json
          prompt_json?: Json
          shot_index?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_render_shots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "video_render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_database: {
        Row: {
          atom_id: string
          created_at: string
          curation_status: string | null
          derived_from_ref: string | null
          generation_status: string | null
          id: string
          image_url: string | null
          model_used: string | null
          prompt_used: string | null
          thumbnail_url: string | null
          updated_at: string
          version_chain: string[] | null
        }
        Insert: {
          atom_id: string
          created_at?: string
          curation_status?: string | null
          derived_from_ref?: string | null
          generation_status?: string | null
          id?: string
          image_url?: string | null
          model_used?: string | null
          prompt_used?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          version_chain?: string[] | null
        }
        Update: {
          atom_id?: string
          created_at?: string
          curation_status?: string | null
          derived_from_ref?: string | null
          generation_status?: string | null
          id?: string
          image_url?: string | null
          model_used?: string | null
          prompt_used?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          version_chain?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_database_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "atoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_database_derived_from_ref_fkey"
            columns: ["derived_from_ref"]
            isOneToOne: false
            referencedRelation: "visual_database"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_decisions: {
        Row: {
          created_at: string
          decision_domain: string
          id: string
          is_locked: boolean
          project_id: string
          recommended_at: string | null
          recommended_reason: string | null
          recommended_value: string | null
          selected_at: string | null
          selected_value: string | null
          target_key: string | null
          target_scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision_domain: string
          id?: string
          is_locked?: boolean
          project_id: string
          recommended_at?: string | null
          recommended_reason?: string | null
          recommended_value?: string | null
          selected_at?: string | null
          selected_value?: string | null
          target_key?: string | null
          target_scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision_domain?: string
          id?: string
          is_locked?: boolean
          project_id?: string
          recommended_at?: string | null
          recommended_reason?: string | null
          recommended_value?: string | null
          selected_at?: string | null
          selected_value?: string | null
          target_key?: string | null
          target_scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "visual_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_dependency_links: {
        Row: {
          active: boolean
          asset_id: string
          asset_type: string
          created_at: string
          dependency_id: string
          dependency_type: string
          dependency_version_id: string | null
          id: string
          project_id: string
        }
        Insert: {
          active?: boolean
          asset_id: string
          asset_type?: string
          created_at?: string
          dependency_id: string
          dependency_type: string
          dependency_version_id?: string | null
          id?: string
          project_id: string
        }
        Update: {
          active?: boolean
          asset_id?: string
          asset_type?: string
          created_at?: string
          dependency_id?: string
          dependency_type?: string
          dependency_version_id?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_dependency_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "visual_dependency_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_reference_assets: {
        Row: {
          created_at: string
          created_by: string
          height: number | null
          id: string
          mime_type: string
          project_id: string
          reference_set_id: string
          storage_path: string
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          height?: number | null
          id?: string
          mime_type?: string
          project_id: string
          reference_set_id: string
          storage_path?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          height?: number | null
          id?: string
          mime_type?: string
          project_id?: string
          reference_set_id?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_reference_assets_reference_set_id_fkey"
            columns: ["reference_set_id"]
            isOneToOne: false
            referencedRelation: "visual_reference_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_reference_sets: {
        Row: {
          created_at: string
          created_by: string
          data: Json | null
          description: string | null
          id: string
          is_default: boolean
          locked: boolean
          name: string
          project_id: string
          ref_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data?: Json | null
          description?: string | null
          id?: string
          is_default?: boolean
          locked?: boolean
          name?: string
          project_id: string
          ref_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data?: Json | null
          description?: string | null
          id?: string
          is_default?: boolean
          locked?: boolean
          name?: string
          project_id?: string
          ref_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      visual_scenarios: {
        Row: {
          canon_compatibility: string | null
          change_json: Json
          classification: string | null
          created_at: string
          created_by: string | null
          domain: string
          historical_compatibility: string | null
          id: string
          impact_summary: string | null
          impacted_systems: Json
          lore_compatibility: string | null
          material_compatibility: string | null
          project_id: string
          query_text: string
          recommended_path: string | null
          state: string
          target: string
          updated_at: string
        }
        Insert: {
          canon_compatibility?: string | null
          change_json?: Json
          classification?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string
          historical_compatibility?: string | null
          id?: string
          impact_summary?: string | null
          impacted_systems?: Json
          lore_compatibility?: string | null
          material_compatibility?: string | null
          project_id: string
          query_text?: string
          recommended_path?: string | null
          state?: string
          target?: string
          updated_at?: string
        }
        Update: {
          canon_compatibility?: string | null
          change_json?: Json
          classification?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string
          historical_compatibility?: string | null
          id?: string
          impact_summary?: string | null
          impacted_systems?: Json
          lore_compatibility?: string | null
          material_compatibility?: string | null
          project_id?: string
          query_text?: string
          recommended_path?: string | null
          state?: string
          target?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "visual_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_set_candidates: {
        Row: {
          created_at: string
          evaluation_id: string | null
          id: string
          image_id: string
          producer_decision: string
          rejection_reason: string | null
          selected_for_slot: boolean
          visual_set_slot_id: string
        }
        Insert: {
          created_at?: string
          evaluation_id?: string | null
          id?: string
          image_id: string
          producer_decision?: string
          rejection_reason?: string | null
          selected_for_slot?: boolean
          visual_set_slot_id: string
        }
        Update: {
          created_at?: string
          evaluation_id?: string | null
          id?: string
          image_id?: string
          producer_decision?: string
          rejection_reason?: string | null
          selected_for_slot?: boolean
          visual_set_slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_set_candidates_visual_set_slot_id_fkey"
            columns: ["visual_set_slot_id"]
            isOneToOne: false
            referencedRelation: "visual_set_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_set_slots: {
        Row: {
          created_at: string
          evaluation_status: string | null
          id: string
          is_required: boolean
          replacement_count: number
          selected_image_id: string | null
          slot_key: string
          slot_label: string
          slot_type: string
          state: string
          visual_set_id: string
        }
        Insert: {
          created_at?: string
          evaluation_status?: string | null
          id?: string
          is_required?: boolean
          replacement_count?: number
          selected_image_id?: string | null
          slot_key: string
          slot_label?: string
          slot_type?: string
          state?: string
          visual_set_id: string
        }
        Update: {
          created_at?: string
          evaluation_status?: string | null
          id?: string
          is_required?: boolean
          replacement_count?: number
          selected_image_id?: string | null
          slot_key?: string
          slot_label?: string
          slot_type?: string
          state?: string
          visual_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_set_slots_visual_set_id_fkey"
            columns: ["visual_set_id"]
            isOneToOne: false
            referencedRelation: "visual_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_sets: {
        Row: {
          created_at: string | null
          current_dna_version_id: string | null
          domain: string
          entity_state_id: string | null
          entity_state_key: string | null
          generation_epoch: number | null
          id: string
          locked_at: string | null
          locked_by: string | null
          project_id: string
          required_slot_count: number | null
          reset_at: string | null
          reset_by: string | null
          reset_reason: string | null
          source_run_id: string | null
          status: string
          target_id: string | null
          target_name: string
          target_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_dna_version_id?: string | null
          domain: string
          entity_state_id?: string | null
          entity_state_key?: string | null
          generation_epoch?: number | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          project_id: string
          required_slot_count?: number | null
          reset_at?: string | null
          reset_by?: string | null
          reset_reason?: string | null
          source_run_id?: string | null
          status?: string
          target_id?: string | null
          target_name?: string
          target_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_dna_version_id?: string | null
          domain?: string
          entity_state_id?: string | null
          entity_state_key?: string | null
          generation_epoch?: number | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          project_id?: string
          required_slot_count?: number | null
          reset_at?: string | null
          reset_by?: string | null
          reset_reason?: string | null
          source_run_id?: string | null
          status?: string
          target_id?: string | null
          target_name?: string
          target_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project_script_scene_state"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "visual_sets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_unit_candidates: {
        Row: {
          candidate_payload: Json
          created_at: string
          created_by: string | null
          extracted_from: Json
          id: string
          project_id: string
          run_id: string
          scores: Json
          status: string
          unit_key: string
        }
        Insert: {
          candidate_payload: Json
          created_at?: string
          created_by?: string | null
          extracted_from?: Json
          id?: string
          project_id: string
          run_id: string
          scores?: Json
          status?: string
          unit_key: string
        }
        Update: {
          candidate_payload?: Json
          created_at?: string
          created_by?: string | null
          extracted_from?: Json
          id?: string
          project_id?: string
          run_id?: string
          scores?: Json
          status?: string
          unit_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_unit_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_unit_diffs: {
        Row: {
          created_at: string
          created_by: string | null
          diff_json: Json
          diff_summary: string
          from_candidate_id: string | null
          from_unit_id: string | null
          id: string
          project_id: string
          to_candidate_id: string | null
          to_unit_id: string | null
          unit_key: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          diff_json?: Json
          diff_summary?: string
          from_candidate_id?: string | null
          from_unit_id?: string | null
          id?: string
          project_id: string
          to_candidate_id?: string | null
          to_unit_id?: string | null
          unit_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          diff_json?: Json
          diff_summary?: string
          from_candidate_id?: string | null
          from_unit_id?: string | null
          id?: string
          project_id?: string
          to_candidate_id?: string | null
          to_unit_id?: string | null
          unit_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_unit_diffs_from_candidate_id_fkey"
            columns: ["from_candidate_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_unit_diffs_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "visual_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_unit_diffs_to_candidate_id_fkey"
            columns: ["to_candidate_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_unit_diffs_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "visual_units"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_unit_events: {
        Row: {
          candidate_id: string | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
          project_id: string
          unit_id: string | null
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
          project_id: string
          unit_id?: string | null
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_unit_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_unit_events_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "visual_units"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_unit_runs: {
        Row: {
          created_at: string
          created_by: string | null
          engine_version: string
          error: string | null
          id: string
          project_id: string
          prompt_version: string
          source_versions: Json
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engine_version?: string
          error?: string | null
          id?: string
          project_id: string
          prompt_version?: string
          source_versions?: Json
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engine_version?: string
          error?: string | null
          id?: string
          project_id?: string
          prompt_version?: string
          source_versions?: Json
          status?: string
        }
        Relationships: []
      }
      visual_units: {
        Row: {
          candidate_id: string | null
          canonical_payload: Json
          created_at: string
          created_by: string | null
          id: string
          locked: boolean
          project_id: string
          source_versions: Json
          stale: boolean
          unit_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          candidate_id?: string | null
          canonical_payload: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locked?: boolean
          project_id: string
          source_versions?: Json
          stale?: boolean
          unit_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          candidate_id?: string | null
          canonical_payload?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locked?: boolean
          project_id?: string
          source_versions?: Json
          stale?: boolean
          unit_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_units_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "visual_unit_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      writers_room_changesets: {
        Row: {
          after_version_id: string
          before_version_id: string
          created_at: string
          created_by: string
          diff_summary: Json
          document_id: string
          id: string
          plan_id: string | null
          plan_json: Json
          project_id: string
          quality_run_id: string | null
          rolled_back: boolean
          rolled_back_at: string | null
          thread_id: string | null
        }
        Insert: {
          after_version_id: string
          before_version_id: string
          created_at?: string
          created_by: string
          diff_summary?: Json
          document_id: string
          id?: string
          plan_id?: string | null
          plan_json?: Json
          project_id: string
          quality_run_id?: string | null
          rolled_back?: boolean
          rolled_back_at?: string | null
          thread_id?: string | null
        }
        Update: {
          after_version_id?: string
          before_version_id?: string
          created_at?: string
          created_by?: string
          diff_summary?: Json
          document_id?: string
          id?: string
          plan_id?: string | null
          plan_json?: Json
          project_id?: string
          quality_run_id?: string | null
          rolled_back?: boolean
          rolled_back_at?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writers_room_changesets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writers_room_changesets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "note_change_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writers_room_changesets_quality_run_id_fkey"
            columns: ["quality_run_id"]
            isOneToOne: false
            referencedRelation: "cinematic_quality_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writers_room_changesets_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "note_threads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      outcome_accuracy_summary: {
        Row: {
          avg_commercial_delta: number | null
          avg_gap_score: number | null
          budget_accuracy: number | null
          finance_accuracy: number | null
          greenlight_accuracy: number | null
          lane_accuracy: number | null
          total: number | null
        }
        Relationships: []
      }
      project_script_scene_state: {
        Row: {
          active_scene_count: number | null
          has_scenes: boolean | null
          latest_snapshot_id: string | null
          latest_snapshot_status: string | null
          project_id: string | null
        }
        Insert: {
          active_scene_count?: never
          has_scenes?: never
          latest_snapshot_id?: never
          latest_snapshot_status?: never
          project_id?: string | null
        }
        Update: {
          active_scene_count?: never
          has_scenes?: never
          latest_snapshot_id?: never
          latest_snapshot_status?: never
          project_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invite_link: { Args: { _token: string }; Returns: Json }
      acquire_regen_advisory_lock: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      aggregate_character_scene_counts: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      bootstrap_lookbook_sections: {
        Args: { p_project_id: string }
        Returns: Json
      }
      can_access_project: { Args: { p_project_id: string }; Returns: boolean }
      check_document_access: {
        Args: { _file_path: string; _user_id: string }
        Returns: boolean
      }
      claim_next_devseed_items: {
        Args: { p_claimed_by: string; p_job_id: string; p_limit: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_type: string
          episode_index: number | null
          error_code: string | null
          error_detail: string | null
          gate_failures: string[] | null
          gate_score: number | null
          id: string
          item_key: string
          job_id: string
          output_doc_id: string | null
          output_version_id: string | null
          phase: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "devseed_job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_rewrite_job: {
        Args: {
          p_project_id: string
          p_run_id: string
          p_source_version_id: string
        }
        Returns: {
          approved_notes: Json | null
          attempts: number
          claimed_at: string | null
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          max_attempts: number
          next_summary: string | null
          prev_summary: string | null
          project_id: string
          protect_items: Json | null
          run_id: string | null
          scene_graph_version_id: string | null
          scene_heading: string | null
          scene_id: string | null
          scene_number: number
          source_doc_id: string
          source_version_id: string
          status: string
          target_doc_type: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rewrite_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_shot_plan_scene: {
        Args: {
          p_job_id: string
          p_max_attempts?: number
          p_stale_seconds?: number
        }
        Returns: {
          attempts: number
          error_message: string | null
          finished_at: string | null
          id: string
          inserted_shots: number
          job_id: string
          project_id: string
          scene_id: string
          scene_order: number
          started_at: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shot_plan_job_scenes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_storyboard_render_job: {
        Args: {
          p_claimed_by?: string
          p_project_id: string
          p_render_run_id?: string
        }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          last_error: string | null
          max_attempts: number
          panel_id: string
          priority: number
          project_id: string
          render_run_id: string
          run_id: string
          status: string
          unit_key: string
        }[]
        SetofOptions: {
          from: "*"
          to: "storyboard_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_trailer_audio_job: {
        Args: { _audio_run_id: string; _project_id: string }
        Returns: string
      }
      claim_next_trailer_clip_job: {
        Args: { _blueprint_id: string; _project_id: string }
        Returns: string
      }
      claim_next_trailer_render_job: {
        Args: { _project_id: string; _trailer_cut_id: string }
        Returns: string
      }
      claim_next_video_render_job: {
        Args: { p_project_id: string }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          plan_id: string
          project_id: string
          settings_json: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "video_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_next_video_render_shot: {
        Args: { p_job_id: string }
        Returns: {
          artifact_json: Json
          attempt_count: number
          created_at: string
          id: string
          is_locked: boolean
          job_id: string
          last_error: string | null
          notes: string | null
          prompt_delta_json: Json
          prompt_json: Json
          shot_index: number
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "video_render_shots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_regen_items: {
        Args: { p_claimed_by: string; p_job_id: string; p_limit: number }
        Returns: {
          approved_version_id: string | null
          auto_approved: boolean | null
          char_after: number
          char_before: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          doc_type: string
          document_id: string | null
          episode_index: number | null
          episode_title: string | null
          error: string | null
          id: string
          job_id: string
          meta_json: Json | null
          reason: string
          status: string
          target_doc_type: string | null
          updated_at: string
          upstream: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "regen_job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compute_outcome_deltas: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      consume_next_costume_command: {
        Args: {
          p_character_key?: string
          p_project_id: string
          p_run_id: string
          p_state_key?: string
        }
        Returns: Json
      }
      convergence_atomic_write:
        | {
            Args: {
              p_allowed_gap?: number
              p_analysis_mode?: string
              p_convergence_status?: string
              p_creative_detail?: Json
              p_creative_integrity_score?: number
              p_development_stage?: string
              p_document_id: string
              p_executive_guidance?: string
              p_executive_snapshot?: string
              p_format_advisory?: Json
              p_full_result?: Json
              p_gap?: number
              p_greenlight_detail?: Json
              p_greenlight_probability?: number
              p_leverage_moves?: string[]
              p_output_json?: Json
              p_primary_commercial_risk?: string
              p_primary_creative_risk?: string
              p_production_type?: string
              p_project_id: string
              p_run_type?: string
              p_strategic_priority?: string
              p_trajectory?: string
              p_user_id: string
              p_version_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_allowed_gap?: number
              p_analysis_mode?: string
              p_convergence_status?: string
              p_creative_detail?: Json
              p_creative_integrity_score?: number
              p_data_integrity_ok?: boolean
              p_development_stage?: string
              p_document_id: string
              p_executive_guidance?: string
              p_executive_snapshot?: string
              p_format_advisory?: Json
              p_full_result?: Json
              p_gap?: number
              p_greenlight_detail?: Json
              p_greenlight_probability?: number
              p_leverage_moves?: string[]
              p_output_json?: Json
              p_override_allowed?: boolean
              p_primary_commercial_risk?: string
              p_primary_creative_risk?: string
              p_production_type?: string
              p_project_id: string
              p_promotion_allowed?: boolean
              p_run_type?: string
              p_stage_readiness_score?: number
              p_stage_readiness_status?: string
              p_strategic_priority?: string
              p_trajectory?: string
              p_user_id: string
              p_version_id: string
            }
            Returns: undefined
          }
      create_regen_run_locked: {
        Args: {
          p_meta_json: Json
          p_ndg_pre_at_risk_count: number
          p_project_id: string
          p_recommended_scope: string
          p_source_axes: string[]
          p_source_unit_keys: string[]
          p_target_scene_count: number
          p_target_scene_ids: string[]
          p_triggered_by: string
        }
        Returns: Json
      }
      ds2_delete_seed: {
        Args: { p_project_id: string; p_seed_id: string }
        Returns: Json
      }
      ds2_sync_seed_to_canon: {
        Args: {
          p_force_resync?: boolean
          p_project_id: string
          p_seed_id: string
        }
        Returns: Json
      }
      ds2_update_seed: {
        Args: { p_patch: Json; p_project_id: string; p_seed_id: string }
        Returns: Json
      }
      exec_sql: { Args: { query: string }; Returns: Json }
      get_deal_finance_summary: { Args: { _project_id: string }; Returns: Json }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: string
      }
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_step_count: { Args: { p_job_id: string }; Returns: number }
      insert_cinematic_quality_run_with_attempts: {
        Args: { p_attempt0: Json; p_attempt1?: Json; p_run: Json }
        Returns: string
      }
      insert_project_vector: {
        Args: {
          _embedding: number[]
          _embedding_model: string
          _project_id: string
          _source_hash: string
          _source_len: number
          _source_meta?: Json
          _vector_type: string
        }
        Returns: string
      }
      is_feature_flag_enabled: { Args: { _key: string }; Returns: boolean }
      match_trend_signals: {
        Args: {
          _limit?: number
          _min_strength?: number
          _project_embedding: string
        }
        Returns: {
          cycle_phase: string
          dimension: string
          distance: number
          modality: string
          name: string
          saturation_risk: string
          signal_id: string
          similarity: number
          strength: number
          velocity: string
        }[]
      }
      next_execution_number: { Args: { p_project_id: string }; Returns: number }
      next_scene_version: {
        Args: {
          p_created_by?: string
          p_patch?: Json
          p_project_id: string
          p_propose?: boolean
          p_scene_id: string
        }
        Returns: Json
      }
      next_shot_version: {
        Args: {
          p_created_by?: string
          p_patch?: Json
          p_project_id: string
          p_propose?: boolean
          p_shot_id: string
        }
        Returns: Json
      }
      re_job_processor: { Args: never; Returns: undefined }
      rebind_project_ai_cast: {
        Args: {
          p_changed_by: string
          p_character_key: string
          p_next_actor_id: string
          p_project_id: string
          p_reason: string
        }
        Returns: Json
      }
      resume_costume_run: {
        Args: { p_project_id: string; p_run_id: string }
        Returns: Json
      }
      safe_delete_version: { Args: { p_version_id: string }; Returns: Json }
      scene_graph_atomic_write: {
        Args: {
          p_created_by: string
          p_force?: boolean
          p_project_id: string
          p_scenes?: Json
        }
        Returns: Json
      }
      search_corpus_chunks: {
        Args: { match_count?: number; p_user_id?: string; search_query: string }
        Returns: {
          chunk_index: number
          chunk_text: string
          id: string
          rank: number
          script_id: string
        }[]
      }
      search_corpus_semantic: {
        Args: {
          filter_script_id?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          chunk_id: string
          chunk_text: string
          distance: number
          script_id: string
        }[]
      }
      search_project_doc_chunks: {
        Args: {
          match_count?: number
          p_project_id: string
          search_query: string
        }
        Returns: {
          chunk_index: number
          chunk_text: string
          doc_type: string
          id: string
          rank: number
          version_id: string
        }[]
      }
      set_current_version: {
        Args: { p_document_id: string; p_new_version_id: string }
        Returns: Json
      }
      test_trinity: { Args: never; Returns: string }
      upsert_trend_signal_embedding: {
        Args: {
          _embedding: number[]
          _embedding_model: string
          _embedding_text_hash: string
          _embedding_text_len: number
          _signal_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      camera_move:
        | "static"
        | "push_in"
        | "pull_out"
        | "track"
        | "arc"
        | "handheld"
        | "whip_pan"
        | "crane"
        | "tilt"
        | "dolly_zoom"
      project_image_role:
        | "poster_primary"
        | "poster_variant"
        | "character_primary"
        | "character_variant"
        | "world_establishing"
        | "world_detail"
        | "visual_reference"
        | "lookbook_cover"
        | "marketing_variant"
      project_role: "producer" | "sales_agent" | "lawyer" | "creative"
      shot_type:
        | "wide"
        | "medium"
        | "close"
        | "insert"
        | "aerial"
        | "macro"
        | "montage"
      trailer_phase:
        | "hook"
        | "setup"
        | "escalation"
        | "twist"
        | "crescendo"
        | "button"
      trailer_signal_type: "judge_score" | "user_action" | "external_metric"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      camera_move: [
        "static",
        "push_in",
        "pull_out",
        "track",
        "arc",
        "handheld",
        "whip_pan",
        "crane",
        "tilt",
        "dolly_zoom",
      ],
      project_image_role: [
        "poster_primary",
        "poster_variant",
        "character_primary",
        "character_variant",
        "world_establishing",
        "world_detail",
        "visual_reference",
        "lookbook_cover",
        "marketing_variant",
      ],
      project_role: ["producer", "sales_agent", "lawyer", "creative"],
      shot_type: [
        "wide",
        "medium",
        "close",
        "insert",
        "aerial",
        "macro",
        "montage",
      ],
      trailer_phase: [
        "hook",
        "setup",
        "escalation",
        "twist",
        "crescendo",
        "button",
      ],
      trailer_signal_type: ["judge_score", "user_action", "external_metric"],
    },
  },
} as const
