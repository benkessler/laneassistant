---
name: pdf_form_filling
description: Fill out PDF form fields programmatically. Use when completing or filling out PDF forms.
---

## PDF Form Filling

Use **fitz** (PyMuPDF) for filling PDF forms.

### Step 1: Check for Fillable Fields

```python
import fitz

doc = fitz.open("form.pdf")
for page in doc:
    widgets = page.widgets()
    for w in widgets:
        print(f"Field: {w.field_name}, Type: {w.field_type}, Value: {w.field_value}")
```

### Step 2a: If Fillable Fields Exist — Use the Field API

```python
doc = fitz.open("form.pdf")
for page in doc:
    for w in page.widgets():
        if w.field_name == "full_name":
            w.field_value = "John Doe"
            w.update()
        elif w.field_name == "date":
            w.field_value = "2026-03-15"
            w.update()

doc.save("filled_form.pdf")
```

### Step 2b: If No Fillable Fields — Place Text Visually

```python
doc = fitz.open("form.pdf")
page = doc[0]

# Place text at specific coordinates (x, y from top-left)
page.insert_text(
    fitz.Point(150, 200),
    "John Doe",
    fontsize=11,
    fontname="helv",
)

doc.save("filled_form.pdf")
```

To find the right coordinates, use `page.get_text("dict")` to inspect existing text positions, or use trial and error with known landmark text.
