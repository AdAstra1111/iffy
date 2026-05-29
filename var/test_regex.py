#!/usr/bin/env python3
"""Test the regex fix against expected LLM output format."""
import re

# Simulate LLM output with code fences
llm_output = """```json
[
  {
    "scene_number": 1,
    "act": 1,
    "slugline": "EXT. COASTAL VILLAGE - TWILIGHT",
    "location": "Coastal Village",
    "time_of_day": "TWILIGHT",
    "characters_present": ["Elias Vinter"],
    "source_beat_number": 1,
    "source_beat_title": "Opening Image: The Perpetual Twilight",
    "summary": "Elias walks through the village, his precision evident.",
    "dramatic_purpose": "Establishes the liminal space between day/night",
    "scene_turn": "From ordered routine to disrupted rhythm",
    "scene_outcome": "Elias' armor of precision is intact",
    "estimated_pages": 2,
    "pov_character": "Elias Vinter"
  }
]
```"""

# Apply the same regex as the fix
import subprocess

# Test with Python regex (same pattern)
cleaned = re.sub(r'^\s*```(?:json)?\s*', '', llm_output, flags=re.MULTILINE)
cleaned = re.sub(r'```\s*$', '', cleaned, flags=re.MULTILINE)
cleaned = cleaned.strip()

print(f"Original length: {len(llm_output)}")
print(f"Cleaned length: {len(cleaned)}")
print(f"Starts with '[': {cleaned.startswith('[')}")
print(f"Ends with ']': {cleaned.endswith(']')}")

import json
try:
    parsed = json.loads(cleaned)
    print(f"PARSE SUCCESS: {len(parsed)} entries")
    for entry in parsed[:2]:
        print(f"  Scene {entry['scene_number']}: {entry['slugline']}")
except json.JSONDecodeError as e:
    print(f"PARSE FAILED: {e}")
    print(f"First 100 chars: {cleaned[:100]}")