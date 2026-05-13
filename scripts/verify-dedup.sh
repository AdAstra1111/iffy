#!/usr/bin/env bash
# verify-dedup.sh
# Post-build verification for character dedup fixes in reverse-engineer-script
# Checks that all three fixes are present in the source file.

set -euo pipefail

FILE="supabase/functions/reverse-engineer-script/index.ts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
TARGET="$REPO_DIR/$FILE"

PASS=0
FAIL=0

check() {
  local label="$1"
  local pattern="$2"
  if grep -q "$pattern" "$TARGET" 2>/dev/null; then
    echo "  ✓ $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label — pattern not found: $pattern"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Character Dedup Verification ==="
echo "File: $FILE"
echo ""

# Fix 1: Field merging
check "Name-based dedup function"          "function dedupCharacterBibleNames"
check "Name-based dedup is called"         "dedupCharacterBibleNames(call3)"
check "MERGE_FIELDS array exists"          "MERGE_FIELDS"
check "Field merge logic (canonicalChar)"  "canonicalChar"
check "Field merge: age field"             "'age'"
check "Field merge: backstory field"       "'backstory'"
check "Field merge: psychology field"      "'psychology'"
check "Field merge log message"            "merged.*field.*from.*into"

# Fix 2: Alias registration
check "findOrCreateCharacterEntity import" "findOrCreateCharacterEntity.*characterDedupUtils"
check "Entity creation loop"               "for.*const char of call3.characters"
check "Entity IDs map"                     "entityIds.set"
check "capturedAliases array declared"     "const capturedAliases"
check "capturedAliases passed to dedup"    "dedupFilterCharacters.*capturedAliases"
check "Alias upsert to narrative_entity_aliases" '"narrative_entity_aliases"'
check "Alias upsert onConflict"            "onConflict.*project_id,canonical_entity_id,alias_name"
check "Alias upsert ignoreDuplicates"       "ignoreDuplicates.*true"
check "Alias registration log"             "Registered.*alias.*from dedup"

# Edge cases
check "Empty name guard (via !key)"          "!key .*seen"
check "Single character guard"             "characters.length <= 1"
check "Self-alias guard"                   "canonicalLower !== c.name.toLowerCase()"
check "Try/catch for alias table error"    "catch.*dedupErr"
check "Try/catch for entity creation"      "catch.*entityErr"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "WARNING: $FAIL check(s) failed. Review above for missing implementation."
  exit 1
else
  echo "All checks passed. Dedup implementation is complete."
  exit 0
fi
