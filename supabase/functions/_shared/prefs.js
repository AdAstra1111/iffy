/**
 * Shared lane prefs + team voice loader for edge functions.
 */
export async function loadLanePrefs(supabase, projectId, lane) {
    try {
        const { data } = await supabase
            .from("project_lane_prefs")
            .select("prefs")
            .eq("project_id", projectId)
            .eq("lane", lane)
            .maybeSingle();
        return data?.prefs || {};
    }
    catch {
        return {};
    }
}
export async function loadTeamVoiceProfile(supabase, teamVoiceId) {
    try {
        const { data } = await supabase
            .from("team_voices")
            .select("label, profile_json")
            .eq("id", teamVoiceId)
            .single();
        if (!data?.profile_json)
            return null;
        return { label: data.label, profile_json: data.profile_json };
    }
    catch {
        return null;
    }
}
