import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyText?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyText = 'Tidak ada data.',
}: DataTableProps<T>): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800/80">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-slate-950/70 text-slate-400">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium uppercase tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition-colors hover:bg-slate-800/40">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-slate-200">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
