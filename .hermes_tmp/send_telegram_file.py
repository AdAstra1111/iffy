#!/usr/bin/env python3
"""Send Ghost Frequency Runtime Analysis to Telegram via Bot API."""
import json
import urllib.request
import re

# Read bot token from Trinity profile config
with open("/Users/laralane/.hermes/profiles/trinity/config.yaml") as f:
    cfg = f.read()

m = re.search(r"telegram_bot_token:\s*['\"](\S+)['\"]", cfg)
if not m:
    m = re.search(r"telegram_bot_token:\s*(\S+)", cfg)
if not m:
    print("ERROR: Could not find telegram_bot_token")
    exit(1)

token = m.group(1)
chat_id = "6204624860"
file_path = "/Users/laralane/code/iffy/memory/shared/projects/iffy/ghost-frequency/Ghost_Frequency_Runtime_Analysis-2026-05-31.md"

# Send document via Telegram Bot API
# Use multipart/form-data
boundary = "----BOUNDARY123"

with open(file_path, "rb") as f:
    file_bytes = f.read()

filename = "Ghost_Frequency_Runtime_Analysis-2026-05-31.md"
caption = "Runtime regression analysis — Ghost Frequency (FS 91.2 min → PD 63.1 min)"

# Build multipart body
body = []
body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="chat_id"')
body.append(b"")
body.append(chat_id.encode())

body.append(f"--{boundary}".encode())
body.append(b'Content-Disposition: form-data; name="caption"')
body.append(b"")
body.append(caption.encode())

body.append(f"--{boundary}".encode())
body.append(f'Content-Disposition: form-data; name="document"; filename="{filename}"'.encode())
body.append(b"Content-Type: text/markdown")
body.append(b"")
body.append(file_bytes)

body.append(f"--{boundary}--".encode())
body.append(b"")

data = b"\r\n".join(body)

url = f"https://api.telegram.org/bot{token}/sendDocument"
req = urllib.request.Request(url, data=data)
req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        if result.get("ok"):
            print(f"✅ File sent to Telegram (msg {result['result']['message_id']})")
        else:
            print(f"❌ Telegram error: {result}")
except Exception as e:
    print(f"❌ Error: {e}")
