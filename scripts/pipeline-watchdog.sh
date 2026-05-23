#!/bin/bash
# Pipeline Watchdog — checks kanban board for blocked tasks and unblocks them
# Runs every 30 minutes via crontab

cd ~/code/iffy || exit 1
LOG="$HOME/.hermes/pipeline-watchdog.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pipeline watchdog check" >> "$LOG"

# Get all blocked tasks
BLOCKED=$(hermes kanban list 2>/dev/null | grep "^⊘" | awk '{print $2}')

if [ -z "$BLOCKED" ]; then
  echo "  No blocked tasks found" >> "$LOG"
  exit 0
fi

echo "  Found blocked: $BLOCKED" >> "$LOG"

# Unblock all of them
for task in $BLOCKED; do
  RESULT=$(hermes kanban unblock "$task" 2>&1)
  echo "  Unblocked $task: $RESULT" >> "$LOG"
done

echo "  Done" >> "$LOG"
