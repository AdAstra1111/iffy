# Visual Production Completion Sprint — CIP Consumer Audit Report

**Date:** 2026-05-31
**Agent:** Trinity

---

## CIP Consumer Map

| System | Classification | Consumes CIP | Consumes DNA Direct | Consumes Actor Refs | Legacy Table | 
|--------|:-------------:|:------------:|:-------------------:|:-------------------:|:------------:|
| generate-hero-frames | **CANONICAL** | ✅ Yes (primary) | ✅ Fallback only | ✅ Actor attachment | None |
| evaluate-visual-governance | **CANONICAL** | ✅ Yes | ✅ Monitors staleness | ✅ Cast status check | visual_sets (deprioritized) |
| generate-lookbook-image | **LEGACY** | ❌ No | ✅ **BYPASS** (l.439) | ✅ ai_actor_ids ref | None |
| generate-poster | **LEGACY** | ❌ No | ✅ **BYPASS** (l.431,461) | ❌ No | **visual_sets** (l.436,469) |
| vpb-assembly-engine | **ADAPTER** | ❌ No | ✅ **BYPASS** (l.192) | ✅ project_ai_cast | None |
| storyboard-engine | **N/A** | ❌ No | ❌ No | ❌ No | None |
| visual-unit-engine | **N/A** | ❌ No | ❌ No | ❌ No | None |

## Bypasses (3)

### 1. generate-lookbook-image (BYPASS)
- **Location:** `generate-lookbook-image/index.ts` line 439
- **What it does:** Queries `character_visual_dna` directly for identity data
- **Impact:** Lookbook images use raw visual DNA instead of canonical CIP
- **Fix:** Add CIP query block before DNA fallback. For each character, check CIP first, fall back to DNA.
- **Effort:** ~30 lines of adapter code

### 2. generate-poster (BYPASS + DEPRECATED TABLE)
- **Location:** `generate-poster/index.ts` lines 431-436, 461-469
- **What it does:** Queries `character_visual_dna` for character list AND queries legacy `visual_sets` for identity bindings
- **Impact:** Uses two deprecated access patterns simultaneously
- **Fix:** 
  - Replace visual_sets query with character_identity_packages query
  - Add CIP preference layer before DNA fallback
- **Effort:** ~40 lines, includes removal of legacy table dependency

### 3. vpb-assembly-engine (BYPASS)
- **Location:** `vpb-assembly-engine/index.ts` line 192
- **What it does:** Queries `character_visual_dna` for character section
- **Impact:** VPB reads raw DNA instead of CIP
- **Fix:** Same pattern as generate-hero-frames — query CIP first, fall back to DNA
- **Effort:** ~25 lines of adapter code

## Classification Definitions

**CANONICAL:** System correctly consumes CIP as primary visual identity source.
**ADAPTER:** System reads from DNA/actor tables directly (functional but needs migration).
**LEGACY:** System reads from DNA AND deprecated tables (blocking consolidation).
**N/A:** System does not consume visual identity data (narrative/scene focus).

## Recommendation

Complete the 3 adapter patches in this order:

1. **vpb-assembly-engine** (Priority 1) — closes the most visible gap. VPB is the final output artifact and should represent canonical visual state.
2. **generate-lookbook-image** (Priority 2) — medium impact. Lookbook images should use canonical character descriptors.
3. **generate-poster** (Priority 3) — also removes visual_sets legacy dependency.

After these 3 patches, all 5 identity-consuming visual systems will use CIP as their canonical source, reaching **100% canonical** status.