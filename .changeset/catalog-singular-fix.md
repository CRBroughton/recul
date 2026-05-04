---
"@crbroughton/recul": patch
---

Fix catalog: singular shorthand not being read. Projects using catalog: (top-level key) instead of catalogs.default: now correctly get fromCatalog set, catalog edit suggestions, and --fix support.
