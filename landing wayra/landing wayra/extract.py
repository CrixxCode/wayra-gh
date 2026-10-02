import re

try:
    text = open('main.js', 'r', encoding='utf-8').read()
    # Find all strings that look like human-readable text (at least 10 chars, some spaces)
    strings = re.findall(r'\"([A-Z][^\"]{10,})\"', text)
    # Filter out obvious code strings
    readable = [s for s in strings if ' ' in s and not s.startswith('http') and not '{' in s]
    
    with open('extracted_text.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(set(readable)))
except Exception as e:
    print(e)
