---
name: excel_editing
description: Edit and modify Excel spreadsheets. Use when working with .xlsx files.
---

## Excel Editing Rules

### Library Selection
- **pandas**: Best for data analysis, filtering, aggregation
- **openpyxl**: Best for formatting, formulas, charts, cell-level control
- Use both together when needed: pandas for data manipulation, openpyxl for formatting

### Critical Rule: Use Formulas, Not Hardcoded Values

When creating or editing spreadsheets with calculated values, **always use Excel formulas** instead of computing values in Python:

```python
# WRONG — hardcoded value, breaks when data changes
ws["C2"] = 100 * 1.1  # = 110

# RIGHT — Excel formula, updates automatically
ws["C2"] = "=A2*B2"
```

### The data_only Trap

```python
# DANGEROUS — loads calculated values but DESTROYS all formulas on save
wb = openpyxl.load_workbook("file.xlsx", data_only=True)
wb.save("file.xlsx")  # All formulas are now gone!

# SAFE — read formulas (shows formula strings, not values)
wb = openpyxl.load_workbook("file.xlsx")
```

If you need both formulas and their current values, load twice:
```python
wb_formulas = openpyxl.load_workbook("file.xlsx")           # for editing
wb_values = openpyxl.load_workbook("file.xlsx", data_only=True)  # for reading values
```

### Financial Model Standards

Color-code cells by type:
- **Blue font** (#0000FF): Input/assumption cells (user-editable)
- **Black font**: Formula cells (auto-calculated)
- **Green font** (#008000): Links to other sheets/workbooks

### Common Errors

- Forgetting `data_only` trap — destroys formulas
- Using Python calculations instead of Excel formulas
- Not preserving existing formatting when updating cells
- Overwriting merged cells without checking first

### Best Practices

1. Always read the spreadsheet structure before editing
2. Preserve existing formatting — only modify what's needed
3. Use named ranges for clarity in complex formulas
4. Test formulas by opening the output in Excel/Sheets
