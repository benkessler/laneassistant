---
name: pptx_editing
description: Edit and modify PowerPoint presentations. Use when working with .pptx files.
---

## PowerPoint Editing Rules

When editing .pptx files with python-pptx:

### Use Blank Layouts or Clean Up Placeholders

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation("input.pptx")

# When adding slides, prefer blank layout to avoid "Insert text here" placeholders
blank_layout = prs.slide_layouts[6]  # Usually index 6 is blank
slide = prs.slides.add_slide(blank_layout)

# If using a layout with placeholders, remove empty ones
for shape in list(slide.placeholders):
    if not shape.has_text_frame or not shape.text_frame.text.strip():
        sp = shape._element
        sp.getparent().remove(sp)
```

### Always Read Structure First

```python
prs = Presentation("input.pptx")

for i, slide in enumerate(prs.slides):
    print(f"\n--- Slide {i+1} ---")
    print(f"Layout: {slide.slide_layout.name}")
    for shape in slide.shapes:
        print(f"  Shape: {shape.shape_type}, Name: {shape.name}")
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                print(f"    Text: {para.text}")
                for run in para.runs:
                    print(f"      Run: '{run.text}' (bold={run.font.bold}, size={run.font.size})")
```

### Common Mistakes

- Using layouts with placeholders without cleaning up empty ones
- Not reading the presentation structure before making changes
- Replacing paragraph text directly instead of using run-aware replacement (same issue as .docx)
- Assuming slide layouts are consistent across templates
