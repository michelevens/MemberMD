// Stripe-grade design primitives — single import point.
//
// Usage:
//   import { DataTable, StatusPill, MoneyAmount, EntityId, DetailDrawer,
//            FilterChips, KebabMenu, type DataTableColumn, type KebabAction,
//            type FilterFacet, type ActiveFilter } from "../shared/stripe-ui";

export { DataTable, type DataTableColumn } from "./DataTable";
export { DetailDrawer } from "./DetailDrawer";
export { EntityId } from "./EntityId";
export { FilterChips, type FilterFacet, type ActiveFilter } from "./FilterChips";
export { KebabMenu, type KebabAction } from "./KebabMenu";
export { MoneyAmount } from "./MoneyAmount";
export { StatusPill } from "./StatusPill";
