---
name: pdf_creation
description: Create PDF documents from HTML/CSS. Use when creating PDFs, reports, or formatted documents.
---

## PDF Creation with WeasyPrint

Always use **WeasyPrint** (not ReportLab) for PDF creation. It renders HTML/CSS to PDF.

```python
from weasyprint import HTML

html_content = """
<html>
<head><style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'Lato', sans-serif; }
  h1 { color: #1a1a2e; }
</style></head>
<body>
  <h1>Report Title</h1>
  <p>Content here...</p>
</body>
</html>
"""

HTML(string=html_content).write_pdf("/work/output.pdf")
```

### Available System Fonts

Serif: Merriweather, Playfair Display, Lora, Source Serif Pro
Sans: Roboto, Lato, Open Sans, Montserrat, Raleway, Poppins, Source Sans Pro, Nunito, Work Sans, DM Sans, Space Grotesk, Outfit
Mono: Fira Code, JetBrains Mono, Source Code Pro
Icons: Font Awesome 6 Free
Display: Abril Fatface

### Google Fonts (via @import)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
```

### Page Breaks

```css
.page-break { page-break-after: always; }
h2 { page-break-before: always; }  /* Each h2 starts a new page */
table { page-break-inside: avoid; }  /* Keep tables together */
```

### Layout Tips

- Use flexbox for layouts (WeasyPrint supports it well)
- Use `@page` for margins, headers, footers
- Use `page-break-*` properties for multi-page documents
- CSS Grid has limited support — prefer flexbox

### Design Guidelines

- Make creative, distinctive designs — avoid generic templates
- Vary between light and dark themes
- Don't default to purple gradients or overused fonts (Inter, Roboto)
- Match the document's purpose: formal reports vs casual summaries
- Use color strategically for headers, accents, data highlights
