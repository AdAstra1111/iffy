"""
Count braces in code vs. non-code (strings, comments, templates).
"""
import re

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    content = f.read()

total_open = content.count('{')
total_close = content.count('}')
print(f"Total braces: {{={total_open}, }}={total_close} (net={total_open-total_close})")

# Strategy: remove non-code content and count what remains

def count_in_region(pattern, label):
    """Count braces matched by regex pattern"""
    opens = closes = 0
    for m in re.finditer(pattern, content, re.DOTALL):
        opens += m.group().count('{')
        closes += m.group().count('}')
    print(f"  In {label}: {{={opens}, }}={closes} (net={opens-closes})")
    return opens, closes

# 1. Block comments
bc_open, bc_close = count_in_region(r'/\*.*?\*/', 'block comments')

# 2. Line comments
# Find all //... lines and count braces
lc_open = lc_close = 0
for line in content.split('\n'):
    # Find // and count braces after it
    idx = line.find('//')
    if idx >= 0:
        rest = line[idx:]
        lc_open += rest.count('{')
        lc_close += rest.count('}')
print(f"  In line comments: {{={lc_open}, }}={lc_close} (net={lc_open-lc_close})")

# 3. Template literals (backtick strings with ${...} expressions)
# These are complex because ${...} contains code
# For now, count braces inside the non-expression parts of templates
# A template literal is `...${...}...${...}...`
# The ${...} parts contain code braces
# The rest of the template literal contains string braces
# Total template literal content: everything between backticks
template_pattern = re.compile(r'`(?:[^`\\$]|\\.|\$(?!\{))*`')
# This doesn't handle nested templates or complex cases
# Let me try a simpler approach

# Count ALL braces inside backtick pairs (mixed string + code)
tmpl_open = tmpl_close = 0
in_template = False
template_start = 0
for i, ch in enumerate(content):
    if ch == '`' and not in_template:
        in_template = True
        template_start = i
    elif ch == '`' and in_template:
        in_template = False
        segment = content[template_start:i+1]
        # Count braces in this template literal
        # Need to handle ${...} separately
        # For now: count all braces
        tmpl_open += segment.count('{')
        tmpl_close += segment.count('}')
print(f"  In template literals: {{={tmpl_open}, }}={tmpl_close} (net={tmpl_open-tmpl_close})")

# 4. Double-quoted strings  
dq_open = dq_close = 0
in_dq = False
dq_start = 0
for i, ch in enumerate(content):
    if ch == '"' and not in_dq:
        in_dq = True
        dq_start = i
    elif ch == '"' and in_dq:
        in_dq = False
        segment = content[dq_start:i+1]
        dq_open += segment.count('{')
        dq_close += segment.count('}')
# Skip escaped quotes - this is approximate
print(f"  In double-quoted strings: {{={dq_open}, }}={dq_close} (net={dq_open-dq_close})")

# 5. Single-quoted strings
sq_open = sq_close = 0
in_sq = False
sq_start = 0
for i, ch in enumerate(content):
    if ch == "'" and not in_sq:
        in_sq = True
        sq_start = i
    elif ch == "'" and in_sq:
        in_sq = False
        segment = content[sq_start:i+1]
        sq_open += segment.count('{')
        sq_close += segment.count('}')
print(f"  In single-quoted strings: {{={sq_open}, }}={sq_close} (net={sq_open-sq_close})")

# Now subtract from total
code_open = total_open - bc_open - lc_open - tmpl_open - dq_open - sq_open
code_close = total_close - bc_close - lc_close - tmpl_close - dq_close - sq_close
print(f"\nCode braces (estimated): {{={code_open}, }}={code_close} (net={code_open-code_close})")
print(f"(Note: template literal ${'{...}'} expressions counted in template row)")