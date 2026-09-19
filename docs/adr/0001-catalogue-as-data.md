# Catalogue as data, orders as snapshots

Products, Options, Option values, Restrictions and Base prices are rows in generic tables, not typed Django models per product, so the other ~150 products can be added by the client as data without code or migrations. Restrictions are deliberately pairwise ("value X excludes value Y", with a reason) plus a per-Option yield order, rather than a condition language: it covers flyers, folded menus and business cards, and three-way rules can be added if a real one appears. Order lines keep a JSON snapshot of the Configuration (codes and labels) and the Quote, with **no foreign key to Option values**, so editing or deleting catalogue rows can never change a past order.

## Considered Options

- **Typed model per product** (e.g. `FlyerConfiguration` with size/paper fields): simpler queries and validation, but every new product is a code change and migration.
- **One JSON schema on Product:** flexible, but loses referential integrity between prices, Restrictions and values, and cannot be edited in Django admin.
- **Order line child rows with FK to Option values:** easier reporting joins, but ties past orders to live catalogue rows. Reporting on the snapshot is acceptable instead.

## Consequences

- A combination with no Base price row is treated as blocked ("Not available"), so a gappy client price list imports without failing; admin shows a completeness report.
- Uplifts are percentages only. Flat or per-quantity add-ons (e.g. rounded corners) need a new field on Option values later.
