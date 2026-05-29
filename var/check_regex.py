with open('/Users/laralane/code/iffy/supabase/functions/generate-document/index.ts', 'rb') as f:
    lines = f.read().split(b'\n')

# Check line 324 (0-indexed 323) - should have the regex fix
line = lines[323]
print(f'Line 324: {line}')

if b'```' in line:
    print('FIX PRESENT: regex uses plain backticks')
    if b'\\\\' in line:
        print('WARNING: extra backslashes still present!')
    else:
        print('OK: no extra backslashes')
else:
    print('FIX NOT PRESENT: regex does not have plain backticks')

# Also check line 325
print(f'Line 325: {lines[324]}')

# Check if these are the right lines by looking at surrounding context
for i in range(320, 328):
    print(f'  {i+1}: {lines[i]}')