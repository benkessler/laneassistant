---
name: pdf_signing
description: Add digital signatures to PDF documents. Use when signing PDFs or adding signatures.
---

## PDF Signing

To add a signature to a PDF, use the **Kalam** font (a handwriting-style Google Font) to render the signer's name as a natural-looking signature.

```python
import fitz

# Download Kalam font if not available
import urllib.request
import os

font_path = "/work/temp/Kalam-Regular.ttf"
if not os.path.exists(font_path):
    os.makedirs("/work/temp", exist_ok=True)
    urllib.request.urlretrieve(
        "https://github.com/google/fonts/raw/main/ofl/kalam/Kalam-Regular.ttf",
        font_path,
    )

doc = fitz.open("document.pdf")
page = doc[-1]  # Usually sign on the last page

# Insert signature
page.insert_text(
    fitz.Point(100, 700),  # Adjust coordinates to the signature line
    "John Doe",
    fontsize=24,
    fontname="kalam",
    fontfile=font_path,
    color=(0, 0, 0.3),  # Dark blue ink
)

# Optionally add date below
page.insert_text(
    fitz.Point(100, 725),
    "March 15, 2026",
    fontsize=10,
    fontname="helv",
)

doc.save("signed_document.pdf")
```
