"""
create_demo_data.py — Generate all demo datasets for PS08.

Run: python create_demo_data.py

Creates clean datasets AND intentionally problematic ones to test:
  - Missing data refusal
  - Duplicate row detection
  - Unit mismatch refusal
  - Conflicting source refusal
  - Ambiguous dates
"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).parent / "demo"
OUT.mkdir(parents=True, exist_ok=True)

rng = np.random.default_rng(42)

PRODUCTS = ["Product_A", "Product_B", "Product_C", "Product_D"]

# ============================================================
# 1. sales.csv — clean Q1+Q2 2026 daily sales
# ============================================================
dates_q1q2 = pd.date_range("2026-01-01", "2026-06-30", freq="D")
n = len(dates_q1q2)
sales = pd.DataFrame({
    "date": dates_q1q2.strftime("%Y-%m-%d"),
    "product": rng.choice(PRODUCTS, n),
    "units_sold": rng.integers(10, 200, n),
    "unit_price_usd": rng.uniform(5.0, 50.0, n).round(2),
})
sales["revenue_usd"] = (sales["units_sold"] * sales["unit_price_usd"]).round(2)
sales.to_csv(OUT / "sales.csv", index=False)
print("Created sales.csv")

# ============================================================
# 2. expenses.csv — monthly expenses per product Q1+Q2 2026
# ============================================================
months = pd.date_range("2026-01", "2026-06", freq="MS")
expense_rows = []
for m in months:
    for prod in PRODUCTS:
        expense_rows.append({
            "month": m.strftime("%Y-%m"),
            "product": prod,
            "cogs_usd": round(rng.uniform(500, 5000), 2),
            "marketing_usd": round(rng.uniform(100, 1000), 2),
            "overhead_usd": round(rng.uniform(50, 500), 2),
        })
expenses = pd.DataFrame(expense_rows)
expenses["total_expense_usd"] = (
    expenses["cogs_usd"] + expenses["marketing_usd"] + expenses["overhead_usd"]
).round(2)
expenses.to_csv(OUT / "expenses.csv", index=False)
print("Created expenses.csv")

# ============================================================
# 3. inventory.csv — current stock levels
# ============================================================
inventory = pd.DataFrame({
    "product": PRODUCTS,
    "stock_units": rng.integers(100, 2000, len(PRODUCTS)),
    "reorder_threshold": rng.integers(50, 300, len(PRODUCTS)),
    "warehouse": rng.choice(["WH_North", "WH_South", "WH_East"], len(PRODUCTS)),
})
inventory.to_csv(OUT / "inventory.csv", index=False)
print("Created inventory.csv")

# ============================================================
# 4. duplicate_sales.csv — sales with intentional duplicates
# ============================================================
dup_sales = sales.copy()
dup_rows = dup_sales.sample(20, random_state=42)
dup_sales = pd.concat([dup_sales, dup_rows], ignore_index=True)
dup_sales.to_csv(OUT / "duplicate_sales.csv", index=False)
print("Created duplicate_sales.csv")

# ============================================================
# 5. missing_expenses.csv — Q1 only (April/May/June missing)
# ============================================================
missing_exp = expenses[expenses["month"] < "2026-04"].copy()
missing_exp.to_csv(OUT / "missing_expenses.csv", index=False)
print("Created missing_expenses.csv (Q2 expenses missing)")

# ============================================================
# 6. conflicting_revenue.csv — same months, different revenue values
# ============================================================
conflict_rows = []
for m in months:
    for prod in PRODUCTS:
        # Deliberately different from sales.csv aggregation
        conflict_rows.append({
            "month": m.strftime("%Y-%m"),
            "product": prod,
            "revenue_usd": round(rng.uniform(2000, 20000), 2),  # different scale
        })
conflicting = pd.DataFrame(conflict_rows)
conflicting.to_csv(OUT / "conflicting_revenue.csv", index=False)
print("Created conflicting_revenue.csv")

# ============================================================
# 7. mixed_currency.csv — revenue in USD, costs in EUR
# ============================================================
mixed = pd.DataFrame({
    "month": [m.strftime("%Y-%m") for m in months for _ in PRODUCTS],
    "product": PRODUCTS * len(months),
    "revenue_usd": rng.uniform(1000, 10000, len(months) * len(PRODUCTS)).round(2),
    "cost_eur": rng.uniform(500, 5000, len(months) * len(PRODUCTS)).round(2),
    "note": ["No conversion rate available"] * (len(months) * len(PRODUCTS)),
})
mixed.to_csv(OUT / "mixed_currency.csv", index=False)
print("Created mixed_currency.csv")

# ============================================================
# 8. ambiguous_dates.csv — mixed date formats in one column
# ============================================================
ambig_dates = []
for i in range(100):
    if i % 3 == 0:
        ambig_dates.append(f"{rng.integers(1, 28):02d}/{rng.integers(1, 12):02d}/2026")  # DD/MM
    elif i % 3 == 1:
        ambig_dates.append(f"2026-{rng.integers(1, 12):02d}-{rng.integers(1, 28):02d}")  # ISO
    else:
        ambig_dates.append(f"{rng.integers(1, 12):02d}-{rng.integers(1, 28):02d}-2026")  # MM-DD
ambiguous = pd.DataFrame({
    "sale_date": ambig_dates,
    "product": rng.choice(PRODUCTS, 100),
    "revenue_usd": rng.uniform(100, 5000, 100).round(2),
})
ambiguous.to_csv(OUT / "ambiguous_dates.csv", index=False)
print("Created ambiguous_dates.csv")

print(f"\nAll demo datasets created in: {OUT.resolve()}")
