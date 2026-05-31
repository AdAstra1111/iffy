#!/usr/bin/env python3
"""Analyze Ghost Frequency FS vs PD structure."""
import re

with open('/Users/laralane/.hermes/profiles/trinity/cache/documents/doc_385c4e90f2bc_Ghost_Frequency_Feature_Script-2026-05-31.md') as f:
    fs = f.read()
with open('/Users/laralane/.hermes/profiles/trinity/cache/documents/doc_5390e2369df7_Ghost_Frequency_Production_Draft-2026-05-31.md') as f:
    pd = f.read()

# FS structure
print("=== FEATURE SCRIPT ===")
print(f"Total words: {len(fs.split())}")
print(f"Total chars: {len(fs)}")

# Scene headers in screenplay format
int_ext = re.findall(r'^(?:INT\.|EXT\.)', fs, re.MULTILINE)
print(f"INT./EXT. scene headers: {len(int_ext)}")

# Check for section markers
print(f"Has 'FADE TO BLACK': {fs.count('FADE TO BLACK')}")
print(f"Has 'FADE OUT': {fs.count('FADE OUT')}")
print(f"Has 'FADE IN': {fs.count('FADE IN')}")

# Check for character introductions (bold ALL CAPS)
char_intros = re.findall(r'^([A-Z][A-Z\s]+)\(\d+s\)', fs, re.MULTILINE)
print(f"Character intros (NAME age): {len(char_intros)}")
for c in set(char_intros):
    print(f"  Character: {c.strip()}")

# Check for dialogue (CHARACTER NAME line followed by parenthetical or text)
chars_in_dialogue = re.findall(r'^([A-Z][A-Z\s]+)$', fs, re.MULTILINE)
# Filter out scene headers and sound cues
chars = [c.strip() for c in chars_in_dialogue if c.strip() in ['ELENA', 'MARCUS', 'JAMES', 'ELENA', 'ALT-ELENA', 'VOICE']]
print(f"Dialogue characters: {set(chars)}")

# PD structure
print("\n=== PRODUCTION DRAFT (v4) ===")
# Clean deliverable headers
clean_pd = re.sub(r'Deliverable Type:.*?(?=\n## BEAT|$)', '', pd, flags=re.DOTALL)
clean_pd = re.sub(r'Completion Status:.*?(?=\n## BEAT|$)', '', clean_pd, flags=re.DOTALL)
clean_pd = re.sub(r'Completeness Check:.*?(?=\n## BEAT|$)', '', clean_pd, flags=re.DOTALL)

print(f"Total clean words: {len(clean_pd.split())}")
print(f"Total chars: {len(clean_pd)}")

# Count BEAT scenes
beat_scenes = re.findall(r'## BEAT scene_\d+:', clean_pd)
print(f"BEAT scenes: {len(beat_scenes)}")

# INT/EXT in PD
pd_int_ext = re.findall(r'^(?:INT\.|EXT\.)', clean_pd, re.MULTILINE)
print(f"INT./EXT. scene headers (PD): {len(pd_int_ext)}")

# Runtime comparison
print("\n=== RUNTIME COMPARISON ===")
fs_words = len(fs.split())
pd_words = len(clean_pd.split())

for divisor in [200, 220, 250]:
    fs_min = fs_words / divisor
    pd_min = pd_words / divisor
    diff = fs_min - pd_min
    pct = (pd_min / fs_min) * 100
    print(f"  @{divisor} wpm: FS={fs_min:.1f}min, PD={pd_min:.1f}min, diff={diff:.1f}min ({pct:.0f}%)")

# Scene-by-scene comparison
print("\n=== PD SCENE BREAKDOWN ===")
scenes = re.split(r'\n(?=## BEAT scene_)', clean_pd)
for s in scenes:
    if not s.strip():
        continue
    m = re.search(r'## BEAT scene_(\d+):\s*(.*?)(?:\n|$)', s)
    if m:
        num = m.group(1)
        title = m.group(2)[:60]
        words = len(s.split())
        # Check for dialogue
        dialogue_lines = re.findall(r'^([A-Z][A-Z\s]+)$', s, re.MULTILINE)
        chars_in_scene = set(d.strip() for d in dialogue_lines if d.strip())
        print(f"  scene_{num}: {words:>4} words | {title}")
