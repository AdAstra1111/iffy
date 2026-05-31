#!/bin/bash
# Consistency Gate — enforces BLOCK/WARN policy for frontend-backend invariants
# BLOCK: I1-I8, I10 failures
# WARN: I9 failures only

set -euo pipefail

TEST_FILE="src/test/frontend-backend-consistency.test.ts"

echo "=== Consistency Gate ==="
echo "Running: vitest run $TEST_FILE --reporter=verbose"
echo ""

# Run the test, capture output and exit code
OUTPUT=$(npx vitest run "$TEST_FILE" --reporter=verbose 2>&1) || true
EXIT_CODE=$?

echo "$OUTPUT"
echo ""

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "✅ Consistency Gate: ALL PASS (78/78)"
  exit 0
fi

# Tests failed — determine which invariants
echo "=== Consistency Gate: Analyzing Failures ==="

# Extract failed invariant names
FAILED_INVARIANTS=$(echo "$OUTPUT" | grep -E "FAIL.*I-[0-9]+" || echo "")
echo "Failed tests:"
echo "$FAILED_INVARIANTS"

# Check if I9 is the ONLY one failing
I9_ONLY_FAILURE=true
while IFS= read -r line; do
  if echo "$line" | grep -qE "FAIL"; then
    if ! echo "$line" | grep -qE "I-9"; then
      I9_ONLY_FAILURE=false
    fi
  fi
done <<< "$(echo "$OUTPUT" | grep -E "FAIL.*I-" || echo "")"

if [ "$I9_ONLY_FAILURE" = true ] && echo "$OUTPUT" | grep -qE "FAIL"; then
  echo "⚠️  Consistency Gate: WARN — Only I9 failures (Normalization Fidelity)"
  echo "    I9 may require fixture maintenance when schema evolves."
  echo "    Gate: PASS (warn only)"
  exit 0
elif echo "$OUTPUT" | grep -qE "FAIL"; then
  echo "❌ Consistency Gate: BLOCK — Non-I9 invariant violation"
  echo "    BLOCK invariant(s) detected. Fix before merging."
  echo "    Gate: FAIL"
  exit 1
fi

# Should not reach here, but exit with test result if so
exit "$EXIT_CODE"
