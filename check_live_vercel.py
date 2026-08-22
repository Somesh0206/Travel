import urllib.request
import re

url = "https://travel-beige-iota.vercel.app/"
html = urllib.request.urlopen(url).read().decode('utf-8')
print("HTML Title and headers:")
for line in html.splitlines()[:20]:
    print(line)

js_files = re.findall(r'/static/js/[a-zA-Z0-9\._-]+\.js', html)
print("JS files referenced in live HTML:", js_files)

for js in js_files:
    js_url = f"https://travel-beige-iota.vercel.app{js}"
    try:
        content = urllib.request.urlopen(js_url).read().decode('utf-8', errors='ignore')
        print(f"File {js}: length {len(content)}")
        print("Contains 'Chat with Admin':", "Chat with Admin" in content)
        print("Contains 'hero-chat-admin-btn':", "hero-chat-admin-btn" in content)
        print("Contains 'Encrypted':", "Encrypted" in content)
    except Exception as e:
        print(f"Error fetching {js_url}: {e}")
