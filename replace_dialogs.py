import os
import re

def process_file(filepath):
    # Skip our dialog implementation files
    if 'dialog.ts' in filepath or 'DialogProvider.tsx' in filepath:
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Check if there are matches
    if not re.search(r'(?<!window\.)\b(alert|confirm|prompt)\(', content):
        return
    
    # Replace alert
    content = re.sub(r'(?<!window\.)\balert\(', 'customAlert(', content)
    # Replace confirm with await customConfirm
    content = re.sub(r'(?<!window\.)\bconfirm\(', 'await customConfirm(', content)
    # Replace prompt with await customPrompt
    content = re.sub(r'(?<!window\.)\bprompt\(', 'await customPrompt(', content)
    
    if content != original_content:
        # Check if import is already there
        if "from '@/lib/dialog'" not in content:
            # Add import after other imports. Find last import.
            imports_end = 0
            for match in re.finditer(r'^import .*?$', content, re.MULTILINE):
                imports_end = match.end()
            
            import_statement = "\nimport { customAlert, customConfirm, customPrompt } from '@/lib/dialog';\n"
            if imports_end > 0:
                content = content[:imports_end] + import_statement + content[imports_end:]
            else:
                content = import_statement + "\n" + content
                
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('c:/Users/pablo/Desktop/ezy_dashboard/src'):
    for file in files:
        if file.endswith(('.ts', '.tsx')):
            process_file(os.path.join(root, file))
