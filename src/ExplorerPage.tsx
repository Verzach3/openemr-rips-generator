import { useState, useEffect, useCallback, useMemo } from "react";
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table";
import type {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    PaginationState,
    RowData,
    Column,
} from "@tanstack/react-table";
import { orpc } from "./lib/orpc";

declare module "@tanstack/react-table" {
    interface ColumnMeta<TData extends RowData, TValue> {
        filterVariant?: "text" | "select";
        selectOptions?: string[];
    }
}

interface ReferenceRow {
    id: number;
    tableName: string;
    externalId: number;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    habilitado: boolean;
    creationDateTime: string | null;
    lastUpdateDateTime: string | null;
    extraI: string | null;
    extraII: string | null;
    extraIII: string | null;
    extraIV: string | null;
    extraV: string | null;
    extraVI: string | null;
    extraVII: string | null;
    extraVIII: string | null;
    extraIX: string | null;
    extraX: string | null;
    valor: string | null;
    updatedAt: string;
}

// --- Debounced input component ---
function DebouncedInput({
    value: initialValue,
    onChange,
    debounce = 400,
    ...props
}: {
    value: string | number;
    onChange: (value: string | number) => void;
    debounce?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange">) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            onChange(value);
        }, debounce);
        return () => clearTimeout(timeout);
    }, [value]);

    return (
        <input
            {...props}
            value={value}
            onChange={(e) => setValue(e.target.value)}
        />
    );
}

// --- Column filter component ---
function ColumnFilter({
    column,
}: {
    column: Column<ReferenceRow, unknown>;
}) {
    const { filterVariant, selectOptions } = column.columnDef.meta ?? {};
    const columnFilterValue = column.getFilterValue();

    if (filterVariant === "select") {
        return (
            <select
                id={`filter-${column.id}`}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                value={(columnFilterValue as string) ?? ""}
                className="w-full border border-gray-300 text-xs px-1.5 py-1 mt-1 bg-white focus:outline-none focus:border-slate-500"
                onClick={(e) => e.stopPropagation()}
            >
                <option value="">All</option>
                {(selectOptions ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </select>
        );
    }

    return (
        <DebouncedInput
            type="text"
            value={(columnFilterValue ?? "") as string}
            onChange={(value) => column.setFilterValue(value || undefined)}
            placeholder="Search…"
            className="w-full border border-gray-300 text-xs px-1.5 py-1 mt-1 focus:outline-none focus:border-slate-500"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
    );
}

export function ExplorerPage() {
    const [data, setData] = useState<ReferenceRow[]>([]);
    const [rowCount, setRowCount] = useState(0);
    const [tableNames, setTableNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 20,
    });

    // Fetch distinct table names on mount
    useEffect(() => {
        orpc.explorer.getTableNames()
            .then((names) => setTableNames(names as string[]))
            .catch(() => { /* ignore */ });
    }, []);

    // Fetch data whenever pagination, sorting, or filters change
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await orpc.explorer.query({
                pageIndex: pagination.pageIndex,
                pageSize: pagination.pageSize,
                sorting: sorting.map((s) => ({ id: s.id, desc: s.desc })),
                filters: columnFilters
                    .filter((f) => f.value !== undefined && f.value !== "")
                    .map((f) => ({
                        id: f.id,
                        value: f.value as string,
                    })),
            });
            setData(result.rows as ReferenceRow[]);
            setRowCount(result.rowCount);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [pagination.pageIndex, pagination.pageSize, sorting, columnFilters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset page to 0 when filters or sorting change
    useEffect(() => {
        setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, [columnFilters, sorting]);

    const columns = useMemo<ColumnDef<ReferenceRow, any>[]>(
        () => [
            {
                accessorKey: "tableName",
                header: "Table",
                size: 200,
                meta: {
                    filterVariant: "select" as const,
                    selectOptions: tableNames,
                },
            },
            {
                accessorKey: "externalId",
                header: "Ext. ID",
                size: 80,
                enableColumnFilter: false,
            },
            {
                accessorKey: "codigo",
                header: "Código",
                size: 120,
                meta: { filterVariant: "text" as const },
            },
            {
                accessorKey: "nombre",
                header: "Nombre",
                size: 240,
                meta: { filterVariant: "text" as const },
            },
            {
                accessorKey: "descripcion",
                header: "Descripción",
                size: 240,
                meta: { filterVariant: "text" as const },
                cell: ({ getValue }) => getValue() ?? "—",
            },
            {
                accessorKey: "habilitado",
                header: "Habilitado",
                size: 90,
                enableColumnFilter: false,
                cell: ({ getValue }) =>
                    getValue() ? (
                        <span className="inline-block bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 font-semibold">
                            Sí
                        </span>
                    ) : (
                        <span className="inline-block bg-red-100 text-red-700 text-xs px-2 py-0.5 font-semibold">
                            No
                        </span>
                    ),
            },
            {
                accessorKey: "valor",
                header: "Valor",
                size: 100,
                meta: { filterVariant: "text" as const },
                cell: ({ getValue }) => getValue() ?? "—",
            },
            {
                accessorKey: "extraI",
                header: "Extra I",
                size: 120,
                meta: { filterVariant: "text" as const },
                cell: ({ getValue }) => getValue() ?? "—",
            },
            {
                accessorKey: "extraII",
                header: "Extra II",
                size: 120,
                meta: { filterVariant: "text" as const },
                cell: ({ getValue }) => getValue() ?? "—",
            },
            {
                accessorKey: "extraIII",
                header: "Extra III",
                size: 120,
                meta: { filterVariant: "text" as const },
                cell: ({ getValue }) => getValue() ?? "—",
            },
            {
                accessorKey: "updatedAt",
                header: "Updated",
                size: 160,
                enableColumnFilter: false,
                cell: ({ getValue }) => {
                    const v = getValue() as string;
                    return v ? new Date(v).toLocaleString() : "—";
                },
            },
        ],
        [tableNames]
    );

    const pageCount = Math.ceil(rowCount / pagination.pageSize);

    const table = useReactTable({
        data,
        columns,
        rowCount,
        state: {
            sorting,
            columnFilters,
            pagination,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount,
        debugTable: false,
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-300 pb-2">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Data Explorer
                    </h1>
                    <p className="text-gray-500 text-xs mt-0.5">
                        Browse and filter synced SISPRO reference records
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {loading && (
                        <span className="text-xs text-slate-500 animate-pulse">
                            Loading…
                        </span>
                    )}
                    <span className="text-xs text-gray-500 font-mono">
                        {rowCount.toLocaleString()} records
                    </span>
                    <button
                        className="btn-primary"
                        onClick={fetchData}
                        disabled={loading}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-300 text-red-800 text-sm p-3">
                    <strong>Error:&nbsp;</strong>
                    {error}
                </div>
            )}

            <div className="enterprise-panel p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left" id="explorer-table">
                        <thead>
                            {table.getHeaderGroups().map((headerGroup) => (
                                <tr
                                    key={headerGroup.id}
                                    className="border-b border-gray-300 bg-gray-50"
                                >
                                    {headerGroup.headers.map((header) => (
                                        <th
                                            key={header.id}
                                            colSpan={header.colSpan}
                                            className="py-2 px-3 text-xs uppercase tracking-wide text-gray-600 font-semibold whitespace-nowrap"
                                            style={{
                                                width: header.getSize(),
                                                minWidth: header.getSize(),
                                            }}
                                        >
                                            {header.isPlaceholder ? null : (
                                                <>
                                                    <div
                                                        className={
                                                            header.column.getCanSort()
                                                                ? "cursor-pointer select-none flex items-center gap-1"
                                                                : "flex items-center gap-1"
                                                        }
                                                        onClick={header.column.getToggleSortingHandler()}
                                                    >
                                                        {flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                        {{
                                                            asc: " ↑",
                                                            desc: " ↓",
                                                        }[header.column.getIsSorted() as string] ?? null}
                                                    </div>
                                                    {header.column.getCanFilter() ? (
                                                        <ColumnFilter column={header.column} />
                                                    ) : null}
                                                </>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {data.length === 0 && !loading ? (
                                <tr>
                                    <td
                                        colSpan={columns.length}
                                        className="py-12 text-center text-gray-400 text-sm"
                                    >
                                        No records found. Adjust your filters or sync data first.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors duration-100"
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <td
                                                key={cell.id}
                                                className="py-1.5 px-3 text-gray-700 text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-xs"
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination controls */}
                <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                        <button
                            className="border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            onClick={() => table.firstPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            ««
                        </button>
                        <button
                            className="border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            ‹ Prev
                        </button>
                        <button
                            className="border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            Next ›
                        </button>
                        <button
                            className="border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            onClick={() => table.lastPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            »»
                        </button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span>
                            Page{" "}
                            <strong>
                                {table.getState().pagination.pageIndex + 1}
                            </strong>{" "}
                            of{" "}
                            <strong>{pageCount.toLocaleString()}</strong>
                        </span>
                        <span className="text-gray-300">|</span>
                        <label className="flex items-center gap-1">
                            Go to:
                            <input
                                type="number"
                                min={1}
                                max={pageCount}
                                defaultValue={
                                    table.getState().pagination.pageIndex + 1
                                }
                                key={table.getState().pagination.pageIndex}
                                onChange={(e) => {
                                    const page = e.target.value
                                        ? Number(e.target.value) - 1
                                        : 0;
                                    table.setPageIndex(page);
                                }}
                                className="border border-gray-300 px-1.5 py-0.5 w-14 text-xs focus:outline-none focus:border-slate-500"
                            />
                        </label>
                        <span className="text-gray-300">|</span>
                        <select
                            value={table.getState().pagination.pageSize}
                            onChange={(e) =>
                                table.setPageSize(Number(e.target.value))
                            }
                            className="border border-gray-300 px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:border-slate-500"
                        >
                            {[10, 20, 30, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                    {size} / page
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Active filters summary */}
            {columnFilters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-gray-500 font-semibold">Active filters:</span>
                    {columnFilters.map((f) => (
                        <span
                            key={f.id}
                            className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-700 px-2 py-0.5"
                        >
                            <strong>{f.id}</strong>: {String(f.value)}
                            <button
                                className="ml-1 text-slate-400 hover:text-red-600 transition-colors"
                                title="Remove filter"
                                onClick={() => {
                                    const col = table.getColumn(f.id);
                                    col?.setFilterValue(undefined);
                                }}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    <button
                        className="text-red-600 hover:text-red-800 font-semibold transition-colors"
                        onClick={() => setColumnFilters([])}
                    >
                        Clear all
                    </button>
                </div>
            )}
        </div>
    );
}
