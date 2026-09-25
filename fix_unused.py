import re
import os

def fix_imports(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return

    if 'formatVnd' in content:
        if len(re.findall(r'formatVnd\(', content)) == 0:
            content = re.sub(r'formatVnd,\s*', '', content)
            content = re.sub(r',\s*formatVnd\b', '', content)
            content = re.sub(r'import\s*\{\s*formatVnd\s*\}\s*from\s*[\'"][^\'"]+[\'"]\n?', '', content)
            
    if 'formatVndWithSuffix' in content:
        if len(re.findall(r'formatVndWithSuffix\(', content)) == 0:
            content = re.sub(r'formatVndWithSuffix,\s*', '', content)
            content = re.sub(r',\s*formatVndWithSuffix\b', '', content)
            content = re.sub(r'import\s*\{\s*formatVndWithSuffix\s*\}\s*from\s*[\'"][^\'"]+[\'"]\n?', '', content)

    if 'AlertCircle' in content:
        if len(re.findall(r'<AlertCircle', content)) == 0 and len(re.findall(r'icon=\{AlertCircle\}', content)) == 0:
            content = re.sub(r'AlertCircle,\s*', '', content)
            content = re.sub(r',\s*AlertCircle\b', '', content)
            content = re.sub(r'import\s*\{\s*AlertCircle\s*\}\s*from\s*[\'"][^\'"]+[\'"]\n?', '', content)
            
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for root, dirs, files in os.walk('apps/web/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            fix_imports(os.path.join(root, file))
