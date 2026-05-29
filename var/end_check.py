with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'rb') as f:
    content = f.read()
    
lines = content.split(b'\n')
print(f'Total lines: {len(lines)}')
print(f'Last 5 lines:')
for i in range(max(0, len(lines)-5), len(lines)):
    print(f'  {i+1}: {lines[i]}')

# Check the last character
newline = b'\n'
print(f'Does file end with newline? {content.endswith(newline)}')
print(f'Last char: {chr(content[-1]) if content[-1] < 128 else hex(content[-1])}')