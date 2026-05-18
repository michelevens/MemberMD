// Stripe-grade data table.
//
// Visual rules:
//   - Tight rows (44px height), zebra-free
//   - Hairline horizontal dividers (1px slate-100)
//   - Hover row gets a subtle slate-50 background, click cursor
//   - Column headers are uppercase 11px slate-500
//   - Sticky header inside scroll container
//   - Empty + loading + error states render inside the same shell
//
// Functional rules:
//   - Pass `columns` as a typed list with `header`, `accessor` (key or fn),
//     and optional `align` / `width`
//   - Pass `rows`, get a row key from `rowKey(row)`
//   - `onRowClick(row)` enables the slide-over drawer pattern
//   - `actions(row)` returns KebabAction[] rendered in a final cell

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { KebabMenu, type KebabAction } from "./KebabMenu";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";

export interface DataTableColumn<T> {
  /** Stable key for React + future column toggling. */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer — gets the row, returns a node. */
  cell: (row: T) => ReactNode;
  /** Cell text alignment. Default left. */
  align?: "left" | "right" | "center";
  /** Optional explicit width (CSS). */
  width?: string | number;
  /** Hide on screens narrower than this Tailwind breakpoint. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
}

interface Props<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Render a kebab menu in the final cell with these actions per row. */
  actions?: (row: T) => KebabAction[];
  /** Click handler — entire row becomes interactive. */
  onRowClick?: (row: T) => void;
  /** State helpers. */
  loading?: boolean;
  error?: string | null;
  /** Empty state node — defaults to a generic "No results" panel. */
  empty?: ReactNode;
  /** Optional footer node (e.g. pagination). */
  footer?: ReactNode;
  /** Layout. */
  className?: string;
  /** Highlight the row whose key matches this id (e.g. selected detail). */
  highlightRowId?: string | null;
}

const HIDE_CLASSES: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  actions,
  onRowClick,
  loading,
  error,
  empty,
  footer,
  className,
  highlightRowId,
}: Props<T>) {
  const colCount = columns.length + (actions ? 1 : 0);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white overflow-hidden ${className ?? ""}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${
                    col.align === "right" ? "text-right" :
                    col.align === "center" ? "text-center" : "text-left"
                  } ${col.hideBelow ? HIDE_CLASSES[col.hideBelow] : ""}`}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
              {actions && (
                <th className="px-2 py-2.5 w-16 text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colCount} className="px-4">
                  <LoadingState compact />
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-red-500 text-sm">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4">
                  {empty ?? (
                    <EmptyState
                      icon={<Inbox className="w-5 h-5" />}
                      title="No results"
                      description="Try adjusting filters or check back later."
                    />
                  )}
                </td>
              </tr>
            )}
            {!loading && !error && rows.map((row) => {
              const k = rowKey(row);
              const isHighlighted = highlightRowId === k;
              return (
                <tr
                  key={k}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-slate-100 last:border-b-0 transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${isHighlighted ? "bg-blue-50/40" : "hover:bg-slate-50/60"}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 text-slate-700 ${
                        col.align === "right" ? "text-right" :
                        col.align === "center" ? "text-center" : "text-left"
                      } ${col.hideBelow ? HIDE_CLASSES[col.hideBelow] : ""}`}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                  {actions && (
                    <td
                      className="px-2 py-2.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <KebabMenu actions={actions(row)} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          {footer}
        </div>
      )}
    </div>
  );
}
