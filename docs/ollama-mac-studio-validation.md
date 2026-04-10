# Ollama Model Validation — Mac Studio M3 Ultra (256GB RAM)
**Last updated:** 2026-04-10 | **Author:** Trinity (subagent research)
**Target hardware:** Apple Mac Studio M3 Ultra, 256GB unified memory, arm64

---

## Platform Compatibility Summary

### Ollama on Apple Silicon (arm64)

Ollama has full native arm64/Apple Silicon support. Requirements:
- macOS Sonoma (v14) or newer
- Apple M-series chip (M1, M2, M3, M4 families all supported)
- Metal GPU acceleration enabled by default

**Critical architecture note:** The M3 Ultra has **unified memory** — there is no separate VRAM pool. All model weights, KV cache, and system memory share the same physical RAM. This is both the advantage (huge addressable space) and the constraint (no dedicated fast VRAM).

With 256GB unified memory, Ollama will report `100% GPU` for all models that fit in memory, as the M3 Ultra's GPU cores access the same unified memory pool.

---

## Model-Specific Validation

### 1. `llama3.3:70b`

| Attribute | Value |
|-----------|-------|
| Parameters | 70 billion |
| Architecture | Dense transformer (Meta Llama 3.3) |
| Context window | 128K tokens |
| Supported languages | English, German, French, Italian, Portuguese, Hindi, Spanish, Thai |

**RAM Requirements (Ollama default — Q4_K_M quantization):**
| Config | RAM Required |
|--------|-------------|
| Q4_K_M (default) | ~43–47 GB |
| Q8_0 | ~75–80 GB |
| FP16 (full precision) | ~140 GB |

**On M3 Ultra 256GB:** Comfortably fits at Q4_K_M. Even FP16 fits with ~116GB headroom.

**Expected performance on M3 Ultra (256GB):**
- Token generation: ~25–35 tok/s (Q4_K_M)
- Prompt processing: ~60–90 tok/s
- These are competitive with consumer GPU setups for this model size

**Apple Silicon compatibility:** ✅ Confirmed. No known issues with arm64. Metal acceleration works fully.

---

### 2. `qwen2.5-coder:32b`

| Attribute | Value |
|-----------|-------|
| Parameters | 32 billion |
| Architecture | Dense transformer (Alibaba Qwen 2.5) |
| Context window | 128K tokens |
| Specialty | Code generation, code repair, code reasoning |
| Performance | Competitive with GPT-4o on code benchmarks (EvalPlus, LiveCodeBench) |

**RAM Requirements:**
| Config | RAM Required |
|--------|-------------|
| Q4_K_M (default) | ~20–22 GB |
| Q8_0 | ~35–38 GB |
| FP16 | ~65–70 GB |

**On M3 Ultra 256GB:** Trivial fit at all quantization levels. ~214GB headroom at Q4_K_M.

**Expected performance on M3 Ultra (256GB):**
- Token generation: ~45–65 tok/s (Q4_K_M)
- Prompt processing: ~120–180 tok/s
- Very fast; this is a relatively small model for this hardware

**Apple Silicon compatibility:** ✅ Confirmed. No known issues.

---

### 3. `mixtral:8x7b`

| Attribute | Value |
|-----------|-------|
| Architecture | Sparse Mixture of Experts (MoE) — 8 expert layers, 7B each |
| Total parameters | ~46.7B (but only ~12.9B active per token) |
| Context window | 32K tokens |
| Strengths | Multilingual (EN, FR, IT, DE, ES), function calling |

**RAM Requirements:**
| Config | RAM Required |
|--------|-------------|
| Q4_K_M (default) | ~26–28 GB |
| Q8_0 | ~47–50 GB |
| FP16 | ~87–93 GB |

**Note on MoE and unified memory:** Mixtral 8x7B requires loading all 8 expert weights into memory (even though only 2 are active per forward pass). This means the full ~47B parameter weight set must reside in RAM. No OOM risk on 256GB but worth noting for multi-model configs.

**On M3 Ultra 256GB:** Comfortable fit at all quantizations.

**Expected performance on M3 Ultra (256GB):**
- Token generation: ~35–55 tok/s (Q4_K_M) — benefits from MoE's lower active parameter count
- Prompt processing: ~80–120 tok/s
- MoE models generally generate faster than same-parameter dense models

**Apple Silicon compatibility:** ✅ Confirmed. MoE routing works correctly on Metal backend.

**Known consideration:** MoE models have slightly higher memory access overhead due to expert routing. On M3 Ultra's unified memory architecture, this is mitigated by the high memory bandwidth (~800 GB/s on M3 Ultra).

---

### 4. `phi4:14b`

| Attribute | Value |
|-----------|-------|
| Parameters | 14 billion |
| Architecture | Dense transformer (Microsoft Phi-4) |
| Context window | 16K tokens |
| Specialty | Reasoning, logic, compute-constrained deployments |
| Training | Synthetic datasets + filtered web + academic Q&A |

**RAM Requirements:**
| Config | RAM Required |
|--------|-------------|
| Q4_K_M (default) | ~9–10 GB |
| Q8_0 | ~16–18 GB |
| FP16 | ~28–30 GB |

**On M3 Ultra 256GB:** Extremely comfortable fit. Can run this model with many others simultaneously.

**Expected performance on M3 Ultra (256GB):**
- Token generation: ~70–100 tok/s (Q4_K_M)
- Prompt processing: ~200+ tok/s
- Very fast for its intelligence level; excellent for interactive use

**Apple Silicon compatibility:** ✅ Confirmed. No known issues with arm64.

---

## Full Model Summary Table

| Model | Q4_K_M RAM | FP16 RAM | Gen Speed (Q4) | Status on M3 Ultra 256GB |
|-------|-----------|---------|----------------|--------------------------|
| `llama3.3:70b` | ~45 GB | ~140 GB | ~30 tok/s | ✅ Fits comfortably |
| `qwen2.5-coder:32b` | ~21 GB | ~68 GB | ~55 tok/s | ✅ Fits comfortably |
| `mixtral:8x7b` | ~27 GB | ~90 GB | ~45 tok/s | ✅ Fits comfortably |
| `phi4:14b` | ~10 GB | ~29 GB | ~85 tok/s | ✅ Fits easily |
| **All 4 simultaneously** | **~103 GB** | — | (parallel) | ✅ Fits with 153GB to spare |

---

## Recommended Ollama Configuration

### Environment Variables for Mac Studio M3 Ultra (256GB)

```bash
# Set via launchctl on macOS (persists across restarts)
launchctl setenv OLLAMA_NUM_PARALLEL 4
launchctl setenv OLLAMA_MAX_LOADED_MODELS 4
launchctl setenv OLLAMA_MAX_QUEUE 512
launchctl setenv OLLAMA_CONTEXT_LENGTH 8192
```

Then restart the Ollama application.

### Settings Rationale

#### `OLLAMA_NUM_PARALLEL`
- **Default:** 1 (conservative — designed for 8–16GB consumer hardware)
- **Recommended for M3 Ultra 256GB:** `4`
- **Why 4:** Each parallel slot adds ~15–25% of base model RAM for KV cache. At 4 parallel slots with the largest model (llama3.3:70b at ~45GB base), KV cache overhead is ~27–45GB → total ~72–90GB for that model alone. Leaves ample headroom.
- **For single-user / single-model workloads:** `2` is sufficient and more predictable
- **For multi-agent / pipeline workloads (IFFY use case):** `4` recommended
- **Scale formula:** `Required RAM ≈ base_model_size + (OLLAMA_NUM_PARALLEL × OLLAMA_CONTEXT_LENGTH × bytes_per_token)`

#### `OLLAMA_MAX_LOADED_MODELS`
- **Default:** 1 (GPU mode) / 3 (CPU mode)
- **Recommended for M3 Ultra 256GB:** `3–4`
- **Why:** Allows different models to stay "hot" in memory simultaneously, avoiding costly model swaps
- **Practical config for IFFY:** Keep `qwen2.5-coder:32b` + `llama3.3:70b` + `phi4:14b` all loaded = ~76GB total, leaving 180GB free
- **Warning:** Setting too high without checking actual memory usage can cause model swapping

#### `OLLAMA_CONTEXT_LENGTH`
- **Default:** 4096 tokens
- **Recommended:** `8192` for most use cases; `32768` for document analysis workloads
- **Note:** Increasing context length proportionally increases KV cache RAM per parallel slot

#### `OLLAMA_MAX_QUEUE`
- **Default:** 512
- **Recommended:** Keep at `512` unless running a high-traffic API server

### Example launchd plist (permanent config)

```xml
<!-- Save to ~/Library/LaunchAgents/com.user.ollama-env.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.ollama-env</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>launchctl setenv OLLAMA_NUM_PARALLEL 4 &amp;&amp; launchctl setenv OLLAMA_MAX_LOADED_MODELS 4 &amp;&amp; launchctl setenv OLLAMA_CONTEXT_LENGTH 8192</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

---

## Apple Silicon / arm64 Compatibility Notes

### ✅ What Works

- All four target models confirmed working on Apple Silicon via Ollama
- Metal GPU acceleration active by default (no configuration needed)
- Ollama's model runner uses `llama.cpp` with Metal backend under the hood
- GGUF quantized models (Q4_K_M, Q5_K_M, Q8_0) work correctly
- Unified memory means `ollama ps` will show `100% GPU` for all loaded models

### ⚠️ Known Considerations

1. **Prompt processing vs. generation asymmetry:** Apple Silicon is excellent at token *generation* but slower at prompt *processing* compared to NVIDIA GPUs with Tensor Cores. For large initial contexts (>8K tokens), expect 50–70% of NVIDIA's prompt processing speed at equivalent model size.

2. **MoE models (Mixtral):** All experts must be loaded into unified memory simultaneously, even though only 2 are active per token. This is fine on 256GB but prevents running Mixtral + other large models if you're RAM-constrained.

3. **FP16 vs quantized:** The M3 Ultra handles FP16 inference fine, but there's minimal quality gain over Q8_0 for most tasks. Q4_K_M is the recommended default for the balance of speed, quality, and RAM usage.

4. **Thermal management:** Extended inference runs at high parallelism can cause thermal throttling on M3 Ultra. The Mac Studio's cooling is better than MacBook Pro but sustained multi-model parallel inference at `OLLAMA_NUM_PARALLEL=4` may see periodic throttle events. Monitoring: `sudo powermetrics --samplers cpu_power,gpu_power -n 1`

5. **Context window scaling:** Ollama's default 4096 context is conservative. For M3 Ultra, increasing to 8192 or even 32768 for large models is safe RAM-wise. llama3.3:70b supports 128K context natively; at Q4_K_M the KV cache for 128K context is ~8–15GB depending on configuration.

6. **Ollama version matters:** Use the latest version. Pre-2024 versions had suboptimal Metal kernels. As of 2025/2026, Metal performance is close to CUDA parity for generation speed on equivalent VRAM/RAM.

### ❌ Not Supported / Not Recommended

- Running CUDA-only models (not applicable — all GGUF models work on Apple Silicon)
- INT4 GPTQ quantization (requires CUDA; use GGUF Q4_K_M instead, which is equivalent quality)
- Very large models (>200B dense parameters) — not enough RAM at 256GB for FP16; quantized may work

---

## Memory Budget Calculator

For planning multi-model deployment on M3 Ultra 256GB:

```
Total Available: 256GB
OS + System overhead: ~8-12GB
Available for Ollama: ~244GB

Model load plan:
  llama3.3:70b    (Q4_K_M)  = 45 GB
  qwen2.5-coder:32b (Q4_K_M) = 21 GB  
  mixtral:8x7b    (Q4_K_M)  = 27 GB
  phi4:14b        (Q4_K_M)  = 10 GB
  ─────────────────────────────────
  Models subtotal            = 103 GB

KV cache overhead (OLLAMA_NUM_PARALLEL=4, 8K context each):
  Approx 20-30% additional per model loaded
  KV cache estimate          = ~25-30 GB

Total estimated peak usage   = ~133 GB
Remaining headroom           = ~111 GB (43% free)
```

This headroom means IFFY can safely run all 4 models simultaneously with `OLLAMA_NUM_PARALLEL=4` and still have ~110GB for system, application layer, and future model additions.

---

## Verified Pull Commands

```bash
ollama pull llama3.3:70b          # ~43GB download
ollama pull qwen2.5-coder:32b     # ~20GB download
ollama pull mixtral:8x7b          # ~26GB download
ollama pull phi4:14b              # ~9GB download
```

To verify they load onto GPU (Metal):
```bash
ollama run phi4:14b --verbose
# Check output for: "loaded model in X ms"
ollama ps
# Should show: 100% GPU for each loaded model
```

---

## Sources
- `docs.ollama.com/faq` — Official Ollama FAQ, environment variable documentation
- `docs.ollama.com/macos` — macOS system requirements
- `ollama.com/library/llama3.3` — llama3.3 model page
- `ollama.com/library/qwen2.5-coder` — qwen2.5-coder model page
- `ollama.com/library/mixtral` — mixtral model page
- `ollama.com/library/phi4` — phi4 model page
- `markaicode.com/ollama-concurrent-requests-parallel-inference/` — parallel inference tuning guide (2026)
- `hardware-corner.net` — M3 Ultra LLM benchmarks (DeepSeek 671B, M3 Ultra perf characteristics)
