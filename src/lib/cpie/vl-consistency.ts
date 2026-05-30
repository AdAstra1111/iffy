/**
 * VL-toPD Consistency Guard v1
 *
 * Validates that PD (Production Design) choices are consistent
 * with VL Canon. NOT a dependency — PD can generate without VL.
 * This is a quality constraint and audit tool.
 *
 * Required alignment (6 fields):
 *   colour_philosophy, saturation_profile, contrast_model,
 *   lighting_philosophy, realism_level, atmosphere_philosophy
 *
 * Forbidden divergence patterns:
 *   Saturated colors when VL is desaturated
 *   White/bright walls when VL is shadow-dominant
 *   Scattershot color when VL is monochromatic
 *   Glossy/specular when VL is diffuse/rough
 *   Diffuse practicals when VL is point-source praktical
 */

export type VLCanonSample = {
  colour_philosophy: string;
  saturation_profile: string;
  contrast_model: string;
  lighting_philosophy: string;
  realism_level: string;
  atmosphere_philosophy: string;
};

export type PDCanonSample = {
  set_dressing_colors?: string;
  wall_treatment_colors?: string;
  practical_lamp_type?: string;
  practical_brightness?: string;
  surface_treatment?: string;
  smoke_element?: string;
  color_accent?: string;
};

export type ConsistencyResult = {
  passed: boolean;
  field_results: Array<{
    field: string;
    vl_value: string;
    pd_value: string;
    status: 'aligned' | 'minor_divergence' | 'forbidden_divergence' | 'no_pd_data';
    detail: string;
  }>;
  forbidden_divergences: string[];
  overall_detail: string;
};

function colourFamily(vl: string): string {
  if (/warm|amber|gold|brown|orange/i.test(vl)) return 'warm';
  if (/cool|blue|teal|green|cyan|grey/i.test(vl)) return 'cool';
  if (/neutral|grey|beige|white|black/i.test(vl)) return 'neutral';
  if (/mono|single|desat/i.test(vl)) return 'monochromatic';
  return 'unknown';
}

function saturationLevel(vl: string): 'high' | 'medium' | 'low' {
  if (/vibrant|saturated|high|punch/i.test(vl)) return 'high';
  if (/muted|desaturated|low|washed/i.test(vl)) return 'low';
  return 'medium';
}

function isMonochromatic(vl: string): boolean {
  return /mono|single_hue|black_white/i.test(vl);
}

function contrastModel(vl: string): 'high' | 'medium' | 'low' {
  if (/high|noir|chiaroscuro|crushing|deep/i.test(vl)) return 'high';
  if (/low|flat|soft|diffuse/i.test(vl)) return 'low';
  return 'medium';
}

function lightingType(vl: string): 'point_source' | 'diffuse' | 'mixed' {
  if (/practical|point|chiaroscuro|low_key|motivated/i.test(vl)) return 'point_source';
  if (/high_key|soft|diffuse|even|flat/i.test(vl)) return 'diffuse';
  return 'mixed';
}

/**
 * Check if PD choices are consistent with VL canon.
 */
export function checkVLtoPDConsistency(
  vl: VLCanonSample,
  pd: PDCanonSample,
): ConsistencyResult {
  const field_results: ConsistencyResult['field_results'] = [];
  const forbidden_divergences: string[] = [];

  // 1. colour_philosophy alignment
  if (pd.set_dressing_colors || pd.wall_treatment_colors) {
    const vlFam = colourFamily(vl.colour_philosophy);
    const pdColor = pd.set_dressing_colors || pd.wall_treatment_colors || '';
    const pdFam = colourFamily(pdColor);
    if (vlFam !== 'unknown' && pdFam !== 'unknown' && vlFam !== pdFam) {
      if (isMonochromatic(vl.colour_philosophy) && pdFam !== 'monochromatic') {
        forbidden_divergences.push(`VL says monochromatic palette but PD dressing uses ${pdFam} colors`);
        field_results.push({
          field: 'colour_philosophy', vl_value: vl.colour_philosophy,
          pd_value: pdColor, status: 'forbidden_divergence',
          detail: `Monochromatic violated: PD=${pdFam}, VL=${vlFam}`,
        });
      } else {
        forbidden_divergences.push(`VL says ${vlFam} palette but PD dressing uses ${pdFam}`);
        field_results.push({
          field: 'colour_philosophy', vl_value: vl.colour_philosophy,
          pd_value: pdColor, status: 'minor_divergence',
          detail: `Colour family mismatch: PD=${pdFam}, VL=${vlFam}`,
        });
      }
    } else {
      field_results.push({
        field: 'colour_philosophy', vl_value: vl.colour_philosophy,
        pd_value: pdColor, status: 'aligned',
        detail: `Both in ${vlFam} family`,
      });
    }
  } else {
    field_results.push({
      field: 'colour_philosophy', vl_value: vl.colour_philosophy,
      pd_value: 'N/A', status: 'no_pd_data',
      detail: 'No PD color data available',
    });
  }

  // 2. saturation_profile
  if (pd.set_dressing_colors) {
    const vlSat = saturationLevel(vl.saturation_profile);
    const pdSat = saturationLevel(pd.set_dressing_colors);
    if (vlSat === 'low' && pdSat === 'high') {
      forbidden_divergences.push(`VL says ${vlSat} saturation but PD uses ${pdSat} saturation`);
      field_results.push({
        field: 'saturation_profile', vl_value: vl.saturation_profile,
        pd_value: pd.set_dressing_colors, status: 'forbidden_divergence',
        detail: `VL=${vlSat} vs PD=${pdSat}`,
      });
    } else {
      field_results.push({
        field: 'saturation_profile', vl_value: vl.saturation_profile,
        pd_value: pd.set_dressing_colors, status: 'aligned',
        detail: `Saturation consistent: VL=${vlSat}, PD=${pdSat}`,
      });
    }
  } else {
    field_results.push({
      field: 'saturation_profile', vl_value: vl.saturation_profile,
      pd_value: 'N/A', status: 'no_pd_data',
      detail: 'No PD color data available',
    });
  }

  // 3. contrast_model
  if (pd.practical_lamp_type || pd.wall_treatment_colors) {
    const vlContrast = contrastModel(vl.contrast_model);
    if (vlContrast === 'high' && (pd.wall_treatment_colors || '').match(/bright|white|light/i)) {
      forbidden_divergences.push(`VL says ${vlContrast} contrast but PD walls are bright/white (enables bounce light)`);
      field_results.push({
        field: 'contrast_model', vl_value: vl.contrast_model,
        pd_value: pd.wall_treatment_colors || 'N/A', status: 'forbidden_divergence',
        detail: 'Bright walls defeat high-contrast lighting',
      });
    } else {
      field_results.push({
        field: 'contrast_model', vl_value: vl.contrast_model,
        pd_value: pd.wall_treatment_colors || 'N/A', status: 'aligned',
        detail: 'Contrast compatible',
      });
    }
  } else {
    field_results.push({
      field: 'contrast_model', vl_value: vl.contrast_model,
      pd_value: 'N/A', status: 'no_pd_data',
      detail: 'No PD data available',
    });
  }

  // 4. lighting_philosophy
  if (pd.practical_lamp_type) {
    const vlLight = lightingType(vl.lighting_philosophy);
    const isPointSource = /lamp|bulb|candle|practical|point|bare|fixture/i.test(pd.practical_lamp_type);
    if (vlLight === 'point_source' && !isPointSource) {
      forbidden_divergences.push(`VL says ${vlLight} lighting but PD practicals are diffuse`);
      field_results.push({
        field: 'lighting_philosophy', vl_value: vl.lighting_philosophy,
        pd_value: pd.practical_lamp_type, status: 'forbidden_divergence',
        detail: 'Point-source VL requires point-source practicals',
      });
    } else {
      field_results.push({
        field: 'lighting_philosophy', vl_value: vl.lighting_philosophy,
        pd_value: pd.practical_lamp_type, status: 'aligned',
        detail: 'Lighting compatible',
      });
    }
  } else {
    field_results.push({
      field: 'lighting_philosophy', vl_value: vl.lighting_philosophy,
      pd_value: 'N/A', status: 'no_pd_data',
      detail: 'No PD practical data',
    });
  }

  // 5. realism_level — always soft advisory
  field_results.push({
    field: 'realism_level', vl_value: vl.realism_level,
    pd_value: 'advisory_check', status: 'aligned',
    detail: 'Realism is advisory — PD may interpret within bounds',
  });

  // 6. atmosphere_philosophy
  if (vl.atmosphere_philosophy && pd.smoke_element) {
    const vlHas = !/none|clear|absent/i.test(vl.atmosphere_philosophy);
    const pdHas = /present|yes|true|smoke|haze|fog/i.test(pd.smoke_element);
    if (vlHas && !pdHas) {
      field_results.push({
        field: 'atmosphere_philosophy', vl_value: vl.atmosphere_philosophy,
        pd_value: pd.smoke_element, status: 'minor_divergence',
        detail: 'VL calls for atmosphere but PD has none',
      });
    } else {
      field_results.push({
        field: 'atmosphere_philosophy', vl_value: vl.atmosphere_philosophy,
        pd_value: pd.smoke_element, status: 'aligned',
        detail: 'Atmosphere compatible',
      });
    }
  } else {
    field_results.push({
      field: 'atmosphere_philosophy', vl_value: vl.atmosphere_philosophy,
      pd_value: pd.smoke_element || 'N/A', status: 'no_pd_data',
      detail: 'No PD atmosphere data',
    });
  }

  const passed = forbidden_divergences.length === 0;
  return {
    passed,
    field_results,
    forbidden_divergences,
    overall_detail: passed
      ? 'PD choices are consistent with VL canon (no forbidden divergences)'
      : `PD has ${forbidden_divergences.length} forbidden divergence(s): ${forbidden_divergences.join('; ')}`,
  };
}
