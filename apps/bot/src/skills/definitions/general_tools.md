---
name: general_tools
description: Search the web, send emails, generate images, convert files to markdown, and look up library docs. Use when a task needs one of these general-purpose tools.
---

These tools are only available via Python scripts (`from sdk.tools.<module> import <function>`). They are *not* in your native tool list, so actively remember they exist.

All tools are async. Run scripts with `python script.py` via the `bash` tool.
Scripts can import `from sdk.tools.<module> import <function>` — the SDK is pre-installed in your workspace.

## 1. Web Search — `quick_ai_search`

Search the web for current information. Use whenever asked about real-time data (weather, news, prices, events), factual lookups, or anything your training data might not cover.

```python
from sdk.tools.utils_tools import quick_ai_search

result = await quick_ai_search(search_question="weather in Amsterdam this weekend")
print(result["search_response"])  # Formatted answer with sources
```

- **Input**: `search_question` (str) — a natural language question
- **Output**: dict with `search_response` (str) — formatted answer with sources
- **When to use**: Weather, current events, fact-checking, product comparisons, "what is X", looking up people/companies, any question where your knowledge might be outdated
- **Don't forget**: If you're about to say "I don't have access to live data" — stop and use this tool instead

## 2. Image Generation — `coworker_text2im`

Generate artistic illustrations or edit existing images. Not for charts/diagrams (use matplotlib/plotly for those).

```python
from sdk.tools.utils_tools import coworker_text2im

# Generate new image
result = await coworker_text2im(
    prompt="A modern minimalist logo for a productivity app, blue and white",
    aspect_ratio="1:1",  # optional
)
print(result["local_path"])   # Local file path
print(result["image_url"])    # Public URL
```

- **Input**: `prompt` (str), optional `image_paths` (list[str]) for editing, optional `aspect_ratio`
- **Output**: dict with `local_path`, `image_url`, `file_uri`
- **When to use**: Social media graphics, mockups, illustrations, profile pictures, thumbnails
- **Not for**: Data visualizations, charts, diagrams — use code-based tools for those

## 3. File to Markdown — `file_to_markdown`

Convert documents to readable markdown. Essential for understanding uploaded files.

```python
from sdk.tools.utils_tools import file_to_markdown

result = await file_to_markdown(file_path="/work/document.pdf")
print(result["content"])  # Markdown text
```

- **Supported formats**: `.pdf`, `.docx`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.rtf`, `.odt`, `.ods`, `.odp`
- **When to use**: Any time you receive a document file and need to read its contents

## 4. Library Documentation — `docs_tools`

Look up current documentation for any library, framework, API, or tool.

```python
from sdk.tools.docs_tools import query_library_docs, resolve_library_id

# Step 1: Find the library
lib = await resolve_library_id(library_name="react", query="how to use useEffect cleanup")
print(lib["library_id"])  # e.g. '/facebook/react'

# Step 2: Query its docs
docs = await query_library_docs(library_id=lib["library_id"], query="useEffect cleanup functions")
print(docs["documentation"])
```

- **Works for**: Libraries (react, pandas), frameworks (next.js, django), APIs (stripe, twilio), databases (postgresql, redis)
- **When to use**: Before writing code that depends on a specific library's API

## 5. Writing Complex Scripts

For tasks that need loops, concurrency, or multi-step logic, write a Python script:

```python
#!/usr/bin/env python3
"""Example: batch process with concurrency."""
import asyncio
from sdk.tools.utils_tools import quick_ai_search

async def process_item(item):
    result = await quick_ai_search(search_question=f"What is {item}?")
    return item, result.get("search_response", "")

async def main():
    items = ["Python", "TypeScript", "Rust"]
    tasks = [process_item(i) for i in items]
    results = await asyncio.gather(*tasks)
    for name, answer in results:
        print(f"## {name}\n{answer}\n")

asyncio.run(main())
```

Save scripts to your workspace and run with `bash`: `python3 script.py`

## Quick Reference

| Need                 | Tool                                        | Module        |
| -------------------- | ------------------------------------------- | ------------- |
| Search the web       | `quick_ai_search(question)`                 | `utils_tools` |
| Generate/edit image  | `coworker_text2im(prompt)`                  | `utils_tools` |
| Read a PDF/DOCX/XLSX | `file_to_markdown(file_path)`               | `utils_tools` |
| Look up library docs | `resolve_library_id` → `query_library_docs` | `docs_tools`  |
