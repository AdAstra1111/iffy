"""
Simple, robust brace analyzer for TypeScript.
State machine tracks only code braces, ignoring everything in strings/comments.
No regex magic - character by character.
"""
import sys

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    content = f.read()

lines = content.split('\n')
N = len(lines)

# State flags
code = True        # True when we're in "real code" (not string/comment/regex)
in_sq = False      # single quote
in_dq = False      # double quote
in_bt = False      # backtick
in_lc = False      # line comment
in_bc = False      # block comment
in_regex = False   # regex literal (approximate)

# Brace tracking
stack = []   # (depth_before, line, col, preview)
depth = 0
opens = 0
closes = 0

# Track which braces close which
close_pairs = {}  # stack_id -> line_no  (which line closes each brace)

line_start = 0  # byte offset of current line start

for li, line in enumerate(lines, 1):
    in_lc = False  # line comments reset each line
    col = 0
    while col < len(line):
        ch = line[col]
        nxt = line[col+1] if col+1 < len(line) else ''
        
        # --- Escape and string handling ---
        if ch == '\\' and (in_sq or in_dq or in_bt):
            col += 2  # skip escaped char
            continue
        
        # === Detect transitions ===
        
        # Line comment start (//)
        if ch == '/' and nxt == '/' and not in_sq and not in_dq and not in_bt and not in_bc:
            in_lc = True
            break  # rest of line is comment
        
        # Block comment start (/*)
        if ch == '/' and nxt == '*' and not in_sq and not in_dq and not in_bt and not in_lc:
            in_bc = True
            col += 2
            continue
        
        # Block comment end (*/)
        if ch == '*' and nxt == '/' and in_bc:
            in_bc = False
            col += 2
            continue
        
        # Inside any comment -> skip
        if in_lc:
            break
        if in_bc:
            col += 1
            continue
        
        # === String toggles ===
        if ch == "'" and not in_dq and not in_bt:
            in_sq = not in_sq
        elif ch == '"' and not in_sq and not in_bt:
            in_dq = not in_dq
        elif ch == '`' and not in_sq and not in_dq:
            in_bt = not in_bt
            col += 1
            continue
        
        # === Inside template literal ===
        if in_bt:
            # Only process ${...} expressions - everything else is string
            if ch == '$' and nxt == '{':
                # This { IS code - track it
                ctx = line[max(0,col-15):col+45].strip()
                stack.append((depth, li, col, len(stack), ctx))
                depth += 1
                opens += 1
                col += 2
                continue
            col += 1
            continue
        
        # === Inside strings ===
        if in_sq or in_dq:
            col += 1
            continue
        
        # === CODE BRACES ===
        if ch == '{':
            ctx = line[max(0,col-15):col+45].strip()
            stack.append((depth, li, col, len(stack), ctx))
            depth += 1
            opens += 1
        elif ch == '}':
            depth -= 1
            closes += 1
            if stack:
                popped = stack.pop()
                close_pairs[popped[3]] = (li, col, line[max(0,col-15):col+30].strip())
        
        col += 1

print(f"=== Results ===")
print(f"Total code {{: {opens}")
print(f"Total code }}: {closes}")
print(f"Final depth: {depth}")
print(f"Remaining on stack: {len(stack)}")
print()

if stack:
    print(f"=== Unmatched opening braces ===")
    for dep, li, col, sid, ctx in stack:
        # Show context
        print(f"\n### Brace at line {li}, col {col} (stack depth {dep}) ###")
        print(f"Context: ...{ctx}...")
        print()
        # Show surrounding lines
        for k in range(max(1, li-2), min(N+1, li+3)):
            marker = " >>>" if k == li else "    "
            print(f"{marker} {k}: {lines[k-1]}")
    print()
    
    # Which unmatched brace is causing the EOF issue?
    print("=== EOF Analysis ===")
    print(f"The file ends with depth={depth}, meaning {depth} more open braces than close braces.")
    print(f"Deno expects {depth} more '}}' before EOF.")
    spare = []
    for dep, li, col, sid, ctx in stack:
        if dep < depth:
            spare.append((dep, li, col, sid, ctx))
    print(f"Braces at lower depths ({depth-1} or less) that should have been closed: {len(spare)}")
    if spare:
        # The topmost one (highest depth) is most likely the culprit
        # Actually, the FIRST one on the stack (lowest line) is the outermost
        # It never got closed - that's the main issue
        first = stack[0]
        print(f"\nThe ROOT CAUSE is likely the first unmatched brace:")
        print(f"  Line {first[1]}: ...{first[4]}...")
        print(f"This brace was never closed - look for where its matching '}}' should go")
        print(f"or find an extra '{{' that stole its closer.")

# Also show all closing pairs near the end
print(f"\n=== Last 10 brace events ===")