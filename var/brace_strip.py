#!/usr/bin/env python3
"""
Brute-force: strip all string literals, template literals, comments,
regex literals, then count braces. This isolates the code-structure braces.
"""
import re

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    content = f.read()

# Strategy: Replace all non-code content with spaces, preserving positions

# 1. Block comments
content = re.sub(r'/\*[\s\S]*?\*/', lambda m: ' ' * len(m.group()), content)

# 2. Line comments
content = re.sub(r'//[^\n]*', lambda m: ' ' * len(m.group()), content)

# 3. Template literals (backtick strings) - these can have ${...} expressions
# We need to handle ${...} carefully - the braces inside are code
# Replace template literal text outside ${} with spaces
# Process: find backtick pairs, then preserve ${...} content
def replace_template(m):
    full = m.group()
    # Replace everything except ${...} with spaces
    result = list(full)
    # We need to keep ${...} expressions intact
    # Mark positions: keep positions of $, {, } inside ${...} but replace everything else
    depth = 0
    expr_start = -1
    expr_depth = 0
    for i, ch in enumerate(full):
        if ch == '$' and i+1 < len(full) and full[i+1] == '{' and depth == 0:
            # Start of expression
            pass
    # Simpler approach: keep ${ and its matching } and the content between them
    # Replace all other characters with spaces
    result = []
    i = 0
    while i < len(full):
        if full[i] == '$' and i+1 < len(full) and full[i+1] == '{':
            # Keep "${"
            result.extend(['$', '{'])
            i += 2
            # Now track nested braces until matching close
            bd = 1
            while i < len(full) and bd > 0:
                if full[i] == '{':
                    bd += 1
                elif full[i] == '}':
                    bd -= 1
                if bd > 0:
                    result.append(full[i])
                else:
                    result.append('}')
                i += 1
        else:
            result.append(' ')
            i += 1
    return ''.join(result)

content = re.sub(r'`[^`]*`', replace_template, content)

# 4. Single-quoted strings (replace content with spaces, keep quotes)
content = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", lambda m: "'" + ' ' * (len(m.group())-2) + "'", content)

# 5. Double-quoted strings
content = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', lambda m: '"' + ' ' * (len(m.group())-2) + '"', content)

# 6. Regex literals (/.../) - approximate: after certain tokens
# This is hard, skip for now

# Now count braces line by line
lines = content.split('\n')
total_open = 0
total_close = 0
line_braces = []

for i, line in enumerate(lines, 1):
    opens = line.count('{')
    closes = line.count('}')
    total_open += opens
    total_close += closes
    net = opens - closes
    if net != 0:
        line_braces.append((i, opens, closes, net))

print(f"Total {{: {total_open}")
print(f"Total }}: {total_close}")
print(f"Net: {total_open - total_close}")
print()
print("Lines with brace imbalance:")
for ln, o, c, n in line_braces:
    print(f"  Line {ln}: +{o} / -{c} = {n:+d}")

if total_open > total_close:
    print(f"\nMissing {total_open - total_close} closing brace(s)")