/**
 * Comprehensive tests for imageGenerationResolver — unified provider/model/config selection.
 *
 * Tests the single source of truth for image generation API resolution:
 *   - resolveImageGenerationConfig — provider/model/config selection
 *   - buildImageRepositoryMeta   — repository metadata persistence format
 *
 * Coverage:
 *   - All 10 ImageRoles → quality default mapping
 *   - All 3 quality targets → correct model selection
 *   - Style mode influence on model selection (stylised → PRO_IMAGE)
 *   - Explicit qualityTarget override
 *   - Rationale formatting
 *   - buildImageRepositoryMeta structure and content
 *   - Edge: unknown/invalid inputs (where type system allows)
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  resolveImageGenerationConfig,
  buildImageRepositoryMeta,
} from "./imageGenerationResolver.ts";
import type {
  ImageRole,
  QualityTarget,
  ImageStyleMode,
  ImageGenResolverInput,
  ImageGenResolverOutput,
} from "./imageGenerationResolver.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Constants for expected model values
// ══════════════════════════════════════════════════════════════════════════════

const PRO_IMAGE = "google/gemini-3-pro-image-preview";
const FLASH_IMAGE = "google/gemini-3.1-flash-image-preview";
const FLASH_IMAGE_LEGACY = "google/gemini-2.5-flash-image";
const GATEWAY_URL = "https://openrouter.ai/api/v1/chat/completions";
const EXPECTED_PROVIDER = "openrouter";

// ══════════════════════════════════════════════════════════════════════════════
// Helper: set up a baseline resolver input
// ══════════════════════════════════════════════════════════════════════════════

function makeInput(overrides?: Partial<ImageGenResolverInput>): ImageGenResolverInput {
  return {
    role: "poster_primary",
    styleMode: "photorealistic_cinematic",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. Primary Use Case — premium quality → PRO_IMAGE
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: poster_primary (premium default) → model=PRO_IMAGE, provider=openrouter",
  fn() {
    // Ensure env is set so resolver doesn't trip on Deno.env
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput());
    assertEquals(result.model, PRO_IMAGE, "premium quality should select PRO_IMAGE");
    assertEquals(result.provider, EXPECTED_PROVIDER, "provider should be openrouter");
    assertEquals(result.gatewayUrl, GATEWAY_URL, "gateway URL should match");
    assertEquals(result.apiKeyEnvVar, "OPENROUTER_API_KEY", "env var name");
    assertEquals(result.settings.modalities, ["image", "text"], "modalities");
    assertEquals(result.fallbackUsed, false, "no fallback");
    assertStringIncludes(result.rationale, "Role: poster_primary", "rationale includes role");
    assertStringIncludes(result.rationale, "Quality: premium", "rationale includes quality");
    assertStringIncludes(result.rationale, "Style: photorealistic_cinematic", "rationale includes style");
    assertStringIncludes(result.rationale, `Model: ${PRO_IMAGE}`, "rationale includes model");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Quality → Model mapping
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: quality=premium → PRO_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({ qualityTarget: "premium" }));
    assertEquals(result.model, PRO_IMAGE);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: quality=standard → FLASH_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({ qualityTarget: "standard" }));
    assertEquals(result.model, FLASH_IMAGE);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: quality=fast → FLASH_IMAGE_LEGACY",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({ qualityTarget: "fast" }));
    assertEquals(result.model, FLASH_IMAGE_LEGACY);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Role → Quality defaults — all 10 roles
// ══════════════════════════════════════════════════════════════════════════════

interface RoleExpectation {
  role: ImageRole;
  expectedQuality: QualityTarget;
  expectedModel: string;
  description: string;
}

const ROLE_EXPECTATIONS: RoleExpectation[] = [
  // Premium roles
  { role: "poster_primary",     expectedQuality: "premium",  expectedModel: PRO_IMAGE,         description: "poster_primary defaults to premium" },
  { role: "character_primary",  expectedQuality: "premium",  expectedModel: PRO_IMAGE,         description: "character_primary defaults to premium" },
  { role: "lookbook_cover",     expectedQuality: "premium",  expectedModel: PRO_IMAGE,         description: "lookbook_cover defaults to premium" },
  // Standard roles
  { role: "poster_variant",     expectedQuality: "standard", expectedModel: FLASH_IMAGE,       description: "poster_variant defaults to standard" },
  { role: "world_establishing", expectedQuality: "standard", expectedModel: FLASH_IMAGE,       description: "world_establishing defaults to standard" },
  { role: "marketing_variant",  expectedQuality: "standard", expectedModel: FLASH_IMAGE,       description: "marketing_variant defaults to standard" },
  // Fast roles
  { role: "visual_reference",   expectedQuality: "fast",     expectedModel: FLASH_IMAGE_LEGACY, description: "visual_reference defaults to fast" },
  { role: "storyboard_frame",   expectedQuality: "fast",     expectedModel: FLASH_IMAGE_LEGACY, description: "storyboard_frame defaults to fast" },
  { role: "motion_still",       expectedQuality: "fast",     expectedModel: FLASH_IMAGE_LEGACY, description: "motion_still defaults to fast" },
  { role: "trailer_frame",      expectedQuality: "fast",     expectedModel: FLASH_IMAGE_LEGACY, description: "trailer_frame defaults to fast" },
];

for (const exp of ROLE_EXPECTATIONS) {
  Deno.test({
    name: `resolveImageGenerationConfig: role=${exp.role} → quality=${exp.expectedQuality}, model=${exp.expectedModel}`,
    fn() {
      Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
      const result = resolveImageGenerationConfig(makeInput({ role: exp.role, styleMode: "photorealistic_cinematic" }));
      assertEquals(result.model, exp.expectedModel, exp.description);
      assertStringIncludes(result.rationale, `Quality: ${exp.expectedQuality}`);
    },
    sanitizeResources: false,
    sanitizeOps: false,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. Style mode influence — stylised modes promote to PRO_IMAGE
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: stylised_animation + standard → PRO_IMAGE (stylised non-fast goes pro)",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "poster_variant",       // standard default
      styleMode: "stylised_animation",
    }));
    assertEquals(result.model, PRO_IMAGE, "stylised non-fast should promote to PRO_IMAGE");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: stylised_graphic + standard → PRO_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "world_establishing",
      styleMode: "stylised_graphic",
    }));
    assertEquals(result.model, PRO_IMAGE);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: stylised_experimental + standard → PRO_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "marketing_variant",
      styleMode: "stylised_experimental",
    }));
    assertEquals(result.model, PRO_IMAGE);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: stylised_period_painterly + standard → PRO_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "poster_variant",
      styleMode: "stylised_period_painterly",
    }));
    assertEquals(result.model, PRO_IMAGE);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: stylised mode + explicit fast → FLASH_IMAGE_LEGACY (fast overrides promotion)",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "poster_primary",
      styleMode: "stylised_animation",
      qualityTarget: "fast",
    }));
    assertEquals(result.model, FLASH_IMAGE_LEGACY, "explicit fast should override stylised promotion");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Explicit qualityTarget override — role default overridden
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: explicit quality overrides role default",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    // poster_primary defaults to premium → PRO_IMAGE
    // But with fast override → FLASH_IMAGE_LEGACY
    const result = resolveImageGenerationConfig(makeInput({
      role: "poster_primary",
      qualityTarget: "fast",
    }));
    assertEquals(result.model, FLASH_IMAGE_LEGACY, "fast override should win over premium default");
    assertStringIncludes(result.rationale, "Quality: fast");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "resolveImageGenerationConfig: storyboard_frame with premium override → PRO_IMAGE",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const result = resolveImageGenerationConfig(makeInput({
      role: "storyboard_frame",
      qualityTarget: "premium",
    }));
    assertEquals(result.model, PRO_IMAGE, "premium override on fast default should give PRO_IMAGE");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Strategy key pass-through
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: strategyKey does not affect output (pass-through only)",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const withStrategy = resolveImageGenerationConfig(makeInput({ strategyKey: "custom-v3" }));
    const withoutStrategy = resolveImageGenerationConfig(makeInput());
    // Strategy key shouldn't change model selection
    assertEquals(withStrategy.model, withoutStrategy.model);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. buildImageRepositoryMeta — structure and content
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "buildImageRepositoryMeta: returns expected structure for poster_primary",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const input = makeInput({ role: "poster_primary", styleMode: "photorealistic_cinematic" });
    const resolverOutput = resolveImageGenerationConfig(input);
    const meta = buildImageRepositoryMeta(resolverOutput, input);

    assertEquals(meta.resolver_version, 1);
    assertEquals(meta.role, "poster_primary");
    assertEquals(meta.style_mode, "photorealistic_cinematic");
    assertEquals(meta.quality_target, "premium");
    assertEquals(meta.strategy_key, null);
    assertEquals(meta.provider, EXPECTED_PROVIDER);
    assertEquals(meta.model, PRO_IMAGE);
    assertEquals(meta.fallback_used, false);
    assert(typeof meta.rationale === "string", "rationale should be a string");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildImageRepositoryMeta: includes strategy_key when provided",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const input = makeInput({ role: "lookbook_cover", strategyKey: "tier-1-priority" });
    const resolverOutput = resolveImageGenerationConfig(input);
    const meta = buildImageRepositoryMeta(resolverOutput, input);

    assertEquals(meta.strategy_key, "tier-1-priority");
    assertEquals(meta.role, "lookbook_cover");
    assertEquals(meta.quality_target, "premium");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildImageRepositoryMeta: reflects overridden quality_target",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const input = makeInput({ role: "poster_primary", qualityTarget: "fast" });
    const resolverOutput = resolveImageGenerationConfig(input);
    const meta = buildImageRepositoryMeta(resolverOutput, input);

    assertEquals(meta.quality_target, "fast", "should reflect overridden quality");
    assertEquals(meta.model, FLASH_IMAGE_LEGACY, "should reflect fallback model");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "buildImageRepositoryMeta: reflects stylised style mode promotion",
  fn() {
    Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
    const input = makeInput({ role: "poster_variant", styleMode: "stylised_animation" });
    const resolverOutput = resolveImageGenerationConfig(input);
    const meta = buildImageRepositoryMeta(resolverOutput, input);

    assertEquals(meta.style_mode, "stylised_animation");
    assertEquals(meta.model, PRO_IMAGE, "stylised promotion reflected in meta");
    assertEquals(meta.fallback_used, false);
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Edge: resolver behaves with empty/no API key (graceful degradation)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test({
  name: "resolveImageGenerationConfig: no API key set still returns config (caller handles key error)",
  fn() {
    // Clear the env var (if any)
    Deno.env.delete("OPENROUTER_API_KEY");
    const result = resolveImageGenerationConfig(makeInput({ role: "storyboard_frame" }));
    // Should still return a valid config structure
    assertEquals(result.model, FLASH_IMAGE_LEGACY);
    assertEquals(result.provider, EXPECTED_PROVIDER);
    assert(typeof result.providerApiKey === "undefined" || typeof result.providerApiKey === "string",
      "providerApiKey should be undefined or string when no env set");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. All style modes at each quality level — combinatorial
// ══════════════════════════════════════════════════════════════════════════════

const ALL_STYLE_MODES: ImageStyleMode[] = [
  "photorealistic_cinematic",
  "stylised_animation",
  "stylised_graphic",
  "stylised_experimental",
  "stylised_period_painterly",
];

const ALL_QUALITIES: QualityTarget[] = ["fast", "standard", "premium"];

for (const style of ALL_STYLE_MODES) {
  for (const quality of ALL_QUALITIES) {
    const isStylised = style !== "photorealistic_cinematic";
    const expectsPro = quality !== "fast" && isStylised;
    const expectedModel = expectsPro ? PRO_IMAGE :
      quality === "premium" ? PRO_IMAGE :
      quality === "standard" ? FLASH_IMAGE :
      FLASH_IMAGE_LEGACY;

    Deno.test({
      name: `resolveImageGenerationConfig: style=${style}, quality=${quality} → model=${expectedModel.split("/").pop()}`,
      fn() {
        Deno.env.set("OPENROUTER_API_KEY", "sk-or-test-key");
        const result = resolveImageGenerationConfig(makeInput({
          role: "poster_variant",
          styleMode: style,
          qualityTarget: quality,
        }));
        assertEquals(result.model, expectedModel,
          `style=${style}, quality=${quality} should resolve to ${expectedModel}`);
      },
      sanitizeResources: false,
      sanitizeOps: false,
    });
  }
}