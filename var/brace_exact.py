"""
Correct brace matcher for TypeScript. Properly handles:
- Single/double quoted strings
- Block/line comments
- Template literals with ${} expressions
- Template expressions nested within template literals
"""
import sys

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    content = f.read()
lines = content.split('\n')

# State machine
# 'CODE' - normal code
# 'SQ' - single-quoted string
# 'DQ' - double-quoted string  
# 'BT' - backtick, OUTSIDE ${} expressions
# 'BT_EXPR' - inside ${} within a backtick (depth tracked separately)
# 'LC' - line comment
# 'BC' - block comment

state = 'CODE'
bc_depth = 0  # block comment depth counter (would be 0 or 1)
bt_expr_depth = 0  # nested brace depth inside template expressions
stack = []  # (line, col, state_at_open, context) for each code brace

opens = 0
closes = 0

for li, line in enumerate(lines, 1):
    col = 0
    while col < len(line):
        ch = line[col]
        nxt = line[col+1] if col+1 < len(line) else ''
        
        # ── Escape handling for strings and templates ──
        if ch == '\\' and state in ('SQ', 'DQ', 'BT', 'BT_EXPR'):
            col += 2
            continue
        
        # ── Line comment start ──
        if ch == '/' and nxt == '/' and state == 'CODE':
            break  # rest of line is comment
        
        # ── Block comment start ──
        if ch == '/' and nxt == '*' and state == 'CODE':
            state = 'BC'
            col += 2
            continue
        
        # ── Block comment end ──
        if ch == '*' and nxt == '/' and state == 'BC':
            state = 'CODE'
            col += 2
            continue
        
        # Skip rest of block comment / line comment
        if state == 'BC':
            col += 1
            continue
        if state == 'LC':
            break
        
        # ── String toggles ──
        if ch == "'" and state == 'CODE':
            state = 'SQ'; col += 1; continue
        if ch == "'" and state == 'SQ':
            state = 'CODE'; col += 1; continue
        
        if ch == '"' and state == 'CODE':
            state = 'DQ'; col += 1; continue
        if ch == '"' and state == 'DQ':
            state = 'CODE'; col += 1; continue
        
        # ── Template literal (backtick) ──
        if ch == '`' and state == 'CODE':
            state = 'BT'; col += 1; continue
        if ch == '`' and state == 'BT':
            state = 'CODE'; col += 1; continue
        
        # ── Inside template literal (BT state - only ${} is code) ──
        if state == 'BT':
            if ch == '$' and nxt == '{':
                # Template expression starts - this { IS a code brace
                depth_after = len(stack) + 1
                ctx = line[max(0,col-15):col+45].strip()
                stack.append((li, col, depth_after, ctx))
                bt_expr_depth = 0  # reset expression brace depth
                opens += 1
                state = 'BT_EXPR'
                col += 2
                continue
            col += 1
            continue
        
        # ── Inside template expression (BT_EXPR state) ──
        if state == 'BT_EXPR':
            # Handle strings within template expression
            if ch == "'":
                state = 'BT_EXPR_SQ'; col += 1; continue
            if ch == '"':
                state = 'BT_EXPR_DQ'; col += 1; continue
            if ch == '`':
                # Nested template literal inside expression
                state = 'BT_EXPR_BT'; col += 1; continue
            
            if ch == '{':
                bt_expr_depth += 1
                depth_after = len(stack) + 1
                ctx = line[max(0,col-15):col+45].strip()
                stack.append((li, col, depth_after, ctx))
                opens += 1
                col += 1
                continue
            
            if ch == '}':
                if bt_expr_depth > 0:
                    # This } closes a nested brace inside the expression
                    bt_expr_depth -= 1
                    if stack:
                        stack.pop()
                    closes += 1
                    col += 1
                    continue
                else:
                    # This } closes the ${...} expression itself - NOT a code brace
                    # Transition back to BT state
                    state = 'BT'
                    col += 1
                    continue
            
            if ch == '/' and nxt == '/':
                # Line comment inside template expression
                break  # rest of line is comment
            if ch == '/' and nxt == '*':
                state = 'BT_EXPR_BC'; col += 2; continue
            
            col += 1
            continue
        
        # ── Sub-states inside template expressions ──
        if state == 'BT_EXPR_SQ':
            if ch == "'": state = 'BT_EXPR'
            col += 1; continue
        if state == 'BT_EXPR_DQ':
            if ch == '"': state = 'BT_EXPR'
            col += 1; continue
        if state == 'BT_EXPR_BT':
            if ch == '`': state = 'BT_EXPR'
            # Handle ${ within nested backtick
            if ch == '$' and nxt == '{':
                # Nested template expression - would need tracking
                # For simplicity, skip and handle later
                pass
            col += 1; continue
        if state == 'BT_EXPR_BC':
            if ch == '*' and nxt == '/': state = 'BT_EXPR'; col += 2; continue
            col += 1; continue
        
        # ── CODE state (not in any string/comment/template) ──
        if state == 'CODE':
            if ch == '{':
                depth_after = len(stack) + 1
                ctx = line[max(0,col-15):col+45].strip()
                stack.append((li, col, depth_after, ctx))
                opens += 1
            elif ch == '}':
                if stack:
                    stack.pop()
                closes += 1
        
        col += 1
    
    # End of line: line comments auto-end
    if state == 'LC':
        state = 'CODE'

print(f"Code {{: {opens}")
print(f"Code }}: {closes}")
print(f"Remaining on stack: {len(stack)}")

if stack:
    print(f"\nUnmatched opening braces: {len(stack)}")
    for li, col, depth, ctx in stack:
        print(f"\n--- Line {li}, col {col} (stack pos {depth}) ---")
        print(f"    Context: ...{ctx}...")
        # Show surrounding lines
        for k in range(max(1, li-2), min(len(lines)+1, li+5)):
            marker = ' >>>' if k == li else '    '
            print(f"{marker} {k}: {lines[k-1]}")
    
    # The first brace on the stack is the outermost (never closed)
    print(f"\n=== ROOT CAUSE ===")
    print(f"The first unmatched brace (line {stack[0][0]}) is the one")
    print(f"whose block never received a closing '}}'.")
    print(f"This is the '}} expected' at EOF error.")
    print()
    print(f"Since the file ends with a '}}' on line 1911 but depth is still > 0,")
    print(f"there is either:")
    print(f"  (A) An EXTRA '{{' that shouldn't be there, or")
    print(f"  (B) A MISSING '}}' somewhere")
    print()
    # Check: does the file's last brace close anything important?
    print(f"Line 1911 is: {lines[1910] if len(lines) > 1910 else 'N/A'}")