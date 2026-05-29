#!/usr/bin/env python3
"""Analyze brace balance in chunkRunner.ts, ignoring strings/comments/templates/regex."""

import re

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    content = f.read()
    lines = content.split('\n')

# ---- Approach 1: Raw count ----
total_open = content.count('{')
total_close = content.count('}')
print(f"=== Raw character count ===")
print(f"  Total '{{': {total_open}")
print(f"  Total '}}': {total_close}")
print(f"  Net: {total_open - total_close}")
print()

# ---- Approach 2: Line-by-line state machine ----
# States: NORMAL, LINE_COMMENT, BLOCK_COMMENT, SINGLE_QUOTE, DOUBLE_QUOTE, TEMPLATE
# Within strings: check for escape sequences
# Within templates: track nested braces for ${...}

depth = 0
depth_trace = []  # (line_num, depth_before, char, context, col)

state = 'NORMAL'
block_comment_depth = 0  # TS/JS doesn't nest block comments

for i, line in enumerate(lines, 1):
    j = 0
    while j < len(line):
        ch = line[j]
        next_ch = line[j+1] if j+1 < len(line) else ''

        if state == 'LINE_COMMENT':
            # skip rest of line
            break

        elif state == 'BLOCK_COMMENT':
            if ch == '*' and next_ch == '/':
                state = 'NORMAL'
                j += 2
                continue
            j += 1
            continue

        elif state == 'SINGLE_QUOTE':
            if ch == '\\':
                j += 2  # skip escaped char
                continue
            if ch == "'":
                state = 'NORMAL'
            j += 1
            continue

        elif state == 'DOUBLE_QUOTE':
            if ch == '\\':
                j += 2
                continue
            if ch == '"':
                state = 'NORMAL'
            j += 1
            continue

        elif state == 'TEMPLATE':
            if ch == '\\':
                j += 2
                continue
            if ch == '`':
                state = 'NORMAL'
                j += 1
                continue
            if ch == '$' and next_ch == '{':
                # Template expression - count the { for depth but push template brace state
                depth += 1
                depth_trace.append((i, depth, '{', 'template-expr-open'))
                state = 'TEMPLATE_BRACE'
                j += 2
                continue
            j += 1
            continue

        elif state == 'TEMPLATE_BRACE':
            # Inside ${...} within template literal
            # Still need to detect end of template
            if ch == '\\':
                j += 2
                continue
            if ch == "'":
                state = 'TEMPLATE_BRACE_SQ'
                j += 1
                continue
            if ch == '"':
                state = 'TEMPLATE_BRACE_DQ'
                j += 1
                continue
            if ch == '`':
                # backtick inside ${} - unusual but track it
                state = 'TEMPLATE'
                j += 1
                continue
            if ch == '{':
                depth += 1
                depth_trace.append((i, depth, '{', 'nested-in-template-brace'))
                j += 1
                continue
            if ch == '}':
                depth -= 1
                depth_trace.append((i, depth, '}', 'close-in-template-brace'))
                if depth == 0:
                    # Very unusual - shouldn't happen in well-formed code
                    pass
                j += 1
                # After closing brace, we might be back in TEMPLATE
                # We can't easily track the nesting depth, so let's just check
                # if we've returned to the template literal level
                continue
            j += 1
            continue

        elif state in ('TEMPLATE_BRACE_SQ', 'TEMPLATE_BRACE_DQ'):
            quote_char = "'" if state == 'TEMPLATE_BRACE_SQ' else '"'
            if ch == '\\':
                j += 2
                continue
            if ch == quote_char:
                state = 'TEMPLATE_BRACE'
            j += 1
            continue

        # ---- NORMAL state ----
        # Check for comment starts
        if ch == '/' and next_ch == '/':
            state = 'LINE_COMMENT'
            j += 2
            continue
        if ch == '/' and next_ch == '*':
            state = 'BLOCK_COMMENT'
            j += 2
            continue

        # Check for string starts
        if ch == "'":
            state = 'SINGLE_QUOTE'
            j += 1
            continue
        if ch == '"':
            state = 'DOUBLE_QUOTE'
            j += 1
            continue
        if ch == '`':
            state = 'TEMPLATE'
            j += 1
            continue

        # Check for braces
        if ch == '/':
            # Could be regex literal... this is hard to distinguish from division
            # For regex: /pattern/flags
            # For division: expr / expr
            # Simple heuristic: if previous non-space char is a closing paren/bracket/brace
            # or identifier, it's division. Otherwise it's regex.
            # For our purposes, regex literals can contain braces but `/` itself is
            # the delimiter. Let's just track them.
            pass

        if ch == '{':
            depth += 1
            context_start = max(0, j-20)
            context_end = min(len(line), j+40)
            ctx = line[context_start:context_end].strip()
            depth_trace.append((i, depth, '{', ctx))
        elif ch == '}':
            depth -= 1
            context_start = max(0, j-20)
            context_end = min(len(line), j+40)
            ctx = line[context_start:context_end].strip()
            depth_trace.append((i, depth, '}', ctx))

        j += 1

    # Reset LINE_COMMENT state at end of line
    if state == 'LINE_COMMENT':
        state = 'NORMAL'

print(f"=== State machine analysis ===")
open_braces = [(ln, ctx) for ln, d, ch, ctx in depth_trace if ch == '{']
close_braces = [(ln, ctx) for ln, d, ch, ctx in depth_trace if ch == '}']
print(f"  Braces counted: {{={len(open_braces)}, }}={len(close_braces)}")
print(f"  Final depth: {depth}")
print()

if depth > 0:
    print(f"=== Finding unmatched opening braces ===")
    # Use stack to find the specific unmatched braces
    stack = []
    for ln, d_after, ch, ctx in depth_trace:
        if ch == '{':
            stack.append((ln, ctx, d_after))
        elif ch == '}':
            if stack:
                stack.pop()

    print(f"  Braces remaining on stack: {len(stack)}")
    for ln, ctx, d in stack:
        print(f"  ** Line {ln}: {ctx}")
    print()

    print("=== Context around unmatched brace ===")
    for ln, ctx, d in stack:
        start = max(0, ln-8)
        end = min(len(lines), ln+3)
        for k in range(start, end):
            marker = " >>>" if k+1 == ln else "    "
            print(f"{marker} {k+1}: {lines[k]}")
        print()
else:
    # Check for extra closing braces
    if depth < 0:
        print(f"=== Extra closing braces (depth went negative) ===")
        # Re-run to find where depth goes negative
        pass
    else:
        print("=== Brace balance is perfect! ===")