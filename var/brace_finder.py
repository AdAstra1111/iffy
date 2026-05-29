"""
Surgical brace matching. Uses a stack tracker that records which `{` each `}` closes.
Prints the UNBALANCED chain leading to the EOF error.
"""
import re

with open('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'r') as f:
    lines = f.readlines()

# State machine: accurate string/comment/template tracking
# Returns (char, is_code) for each character
# 'code' = actual code brace to track
class BraceMatcher:
    def __init__(self, lines):
        self.lines = lines
        self.stack = []  # (line_no, col, depth_before, snippet)
        
    def run(self):
        state = 'NORMAL'     # NORMAL, LINE_COMMENT, BLOCK_COMMENT
        sq = dq = bt = False  # inside single/double/backtick string
        
        template_depth = []  # stack tracking ${...} depth inside backticks
        
        code_opens = 0
        code_closes = 0
        
        for i, line in enumerate(self.lines, 1):
            j = 0
            while j < len(line):
                ch = line[j]
                next_ch = line[j+1] if j+1 < len(line) else ''
                
                # Handle string escapes
                if ch == '\\' and (sq or dq or bt):
                    j += 2
                    continue
                
                # Line comment
                if ch == '/' and next_ch == '/' and not sq and not dq and not bt and state == 'NORMAL':
                    state = 'LINE_COMMENT'
                    j += 2
                    continue
                
                # Block comment
                if ch == '/' and next_ch == '*' and not sq and not dq and not bt and state == 'NORMAL':
                    state = 'BLOCK_COMMENT'
                    j += 2
                    continue
                if ch == '*' and next_ch == '/' and state == 'BLOCK_COMMENT':
                    state = 'NORMAL'
                    j += 2
                    continue
                
                if state == 'LINE_COMMENT':
                    break  # rest of line is comment
                if state == 'BLOCK_COMMENT':
                    j += 1
                    continue
                
                # String toggles
                if ch == "'" and not dq and not bt:
                    sq = not sq
                elif ch == '"' and not sq and not bt:
                    dq = not dq
                elif ch == '`' and not sq and not dq:
                    bt = not bt
                    continue
                
                # Inside template literal: track ${...}
                if bt and ch == '$' and next_ch == '{' and not sq and not dq:
                    # This is a template expression start. 
                    # The { IS code that needs matching.
                    ctx = self._snippet(line, j)
                    self.stack.append((i, j, len(self.stack), ctx))
                    template_depth.append(len(self.stack) - 1)
                    code_opens += 1
                    j += 2
                    continue
                
                if bt:
                    # Skip everything in template literal except tracked ${...}
                    j += 1
                    continue
                
                if not sq and not dq and not bt and state == 'NORMAL':
                    if ch == '{':
                        ctx = self._snippet(line, j)
                        self.stack.append((i, j, len(self.stack), ctx))
                        code_opens += 1
                    elif ch == '}':
                        if self.stack:
                            self.stack.pop()
                            code_closes += 1
                        # else extra close - shouldn't happen
                
                j += 1
            
            if state == 'LINE_COMMENT':
                state = 'NORMAL'
        
        print(f"Code {{: {code_opens}")
        print(f"Code }}: {code_closes}")
        print(f"Stack remaining: {len(self.stack)}")
        print()
        
        if self.stack:
            print("=== UNMATCHED OPENING BRACES (stack trace) ===")
            for idx, (ln, col, depth_before, ctx) in enumerate(self.stack):
                print(f"\n--- Unmatched brace #{idx+1} ---")
                print(f"  Line {ln}, col {col} (depth position {depth_before}):")
                print(f"  Context: ...{ctx}...")
                # Show surrounding lines
                for k in range(max(0, ln-2), min(len(self.lines), ln+3)):
                    marker = " >>>" if k+1 == ln else "    "
                    print(f"{marker} {k+1}: {self.lines[k].rstrip()}")
        
        return self.stack
    
    def _snippet(self, line, col, width=50):
        start = max(0, col - 20)
        end = min(len(line), col + width)
        return line[start:end].strip().replace('\n', '\\n')

matcher = BraceMatcher(lines)
stack = matcher.run()

if stack:
    print("\n=== ANALYSIS ===")
    print(f"The LAST unmatched brace at the bottom of the stack is the one")
    print(f"that causes the 'Expected }}' error at EOF.")
    print(f"Every brace opened AFTER this one WAS properly closed.")
    print(f"The missing '}}' should come AFTER line {stack[-1][0]}'s block.")
    print(f"Check for: an extra '{{' that shouldn't be there, or a missing '}}'.")