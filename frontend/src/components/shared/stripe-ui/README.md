# Stripe-UI Design System

Visual primitives that give MemberMD its dashboard.stripe.com-grade
polish. Every primary surface across SuperAdmin / Practice / Patient /
Operator portals is built from these components.

## Core rules

1. **Page header**: 24px semibold tracking-tight title + 14px slate-500
   tagline + Refresh + (optional) primary action button.
2. **Section eyebrow**: 11px slate-400 uppercase tracking-wider.
   Replaces the older `<h3 className="text-lg font-semibold">` pattern.
3. **Primary action**: Stripe-purple `#635bff` background, hover
   `#544ee0`, 13px medium, rounded-md, shadow-sm.
4. **Cards**: flat `rounded-xl border border-slate-200 bg-white`
   instead of the legacy `glass` (gradient/blur) treatment.
5. **KPI tile**: 11px uppercase eyebrow + 20px semibold tabular-nums
   value + (optional) subvalue line.
6. **Status pill**: low-saturation bg + darker text + leading dot.
   `<StatusPill label={status} />` infers variant automatically.
7. **Table**: `<DataTable>` for any list of rows. Click-row pattern
   opens a `<DetailDrawer>` from the right edge.
8. **Filters**: `<FilterChips>` above the table — stackable,
   removable, keyboard-friendly.
9. **Row actions**: `<KebabMenu>` with destructive items separated
   below a divider in red.
10. **Money**: `<MoneyAmount amount={n} />` for tabular-nums currency.
11. **IDs**: `<EntityId prefix="inv" id={uuid} />` for Stripe-style
    `inv_xxxxxxxx` mono IDs with click-to-copy.

## Imports

```tsx
import {
  DataTable,
  type DataTableColumn,
  DetailDrawer,
  EntityId,
  FilterChips,
  type FilterFacet,
  type ActiveFilter,
  KebabMenu,
  type KebabAction,
  MoneyAmount,
  StatusPill,
} from "../shared/stripe-ui";
```

## Adding a new tab

1. Page header at the top:
   ```tsx
   <div className="flex items-end justify-between gap-4">
     <div>
       <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">Title</h2>
       <p className="text-sm text-slate-500 mt-0.5">Tagline</p>
     </div>
     <RefreshButton onRefresh={loadData} title="Refresh" />
   </div>
   ```
2. KPI tiles (optional) using the standard border-tile pattern.
3. Search + `<FilterChips>` row.
4. `<DataTable>` with typed columns, kebab actions, click-row drawer.
5. Empty state with "Clear filters" reset button.

## When NOT to use the flat card

Pricing cards (Membership Plans grid), brand callouts, the membership
card on the Patient home tab — these are intentionally illustrative
and keep their gradient/illustration treatment. The 24px page header
and section eyebrows still apply.

## Sidebar / chrome

`PortalShell` accepts `portalColor="stripe"` for the flat Stripe-style
chrome. Practice, Patient, and Operator portals are migrated. The
older teal/navy/sage/gold themes are preserved for legacy callers.
