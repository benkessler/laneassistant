---
name: docx_editing
description: Edit and modify Word documents. Use when working with .docx files.
---

## Critical Rule for .docx Editing

When editing .docx files with python-docx, text is often split across multiple **runs** within a paragraph (due to formatting changes mid-sentence). If you replace `paragraph.text` directly, you destroy all formatting.

### Correct Pattern

```python
from docx import Document

doc = Document("input.docx")

# 1. First, READ the structure to understand how text is split
for para in doc.paragraphs:
    print(f"Paragraph: {para.text}")
    for run in para.runs:
        print(f"  Run: '{run.text}' (bold={run.bold}, italic={run.italic})")

# 2. Use run-aware replacement to preserve formatting
def replace_in_paragraph(paragraph, old_text, new_text):
    """Replace text across runs while preserving formatting."""
    full_text = paragraph.text
    if old_text not in full_text:
        return False

    # Build a map of character positions to runs
    char_map = []
    for run in paragraph.runs:
        for char in run.text:
            char_map.append(run)

    start = full_text.index(old_text)
    end = start + len(old_text)

    # Clear the old text from affected runs
    affected_runs = set()
    for i in range(start, end):
        if i < len(char_map):
            affected_runs.add(char_map[i])

    for run in affected_runs:
        run.text = ""

    # Insert new text into the first affected run
    if start < len(char_map):
        char_map[start].text = new_text

    return True

for para in doc.paragraphs:
    replace_in_paragraph(para, "old text", "new text")

doc.save("output.docx")

# 3. VERIFY by re-reading the saved document
verify = Document("output.docx")
for para in verify.paragraphs:
    print(para.text)
```

### Common Mistakes

- **Never** replace `paragraph.text` directly — it destroys bold, italic, font, color
- **Never** assume text is in a single run — Word splits runs at formatting boundaries
- **Always** read the document structure first before making changes
- **Always** verify the output by re-reading the saved document
