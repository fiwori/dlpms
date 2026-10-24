import { useCallback, useEffect, useState } from 'react';

// Loads data from the API and lets a page reload it after an action
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

export const Card = ({ title, children, className = '' }) => (
  <section className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 ${className}`}>
    {title && <h2 className="text-lg font-semibold text-slate-800 mb-3">{title}</h2>}
    {children}
  </section>
);

const BUTTONS = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export const Button = ({ variant = 'primary', className = '', ...props }) => (
  <button
    className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${BUTTONS[variant]} ${className}`}
    {...props}
  />
);

const fieldClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

export const Input = ({ label, ...props }) => (
  <label className="block text-sm">
    <span className="text-slate-600">{label}</span>
    <input className={fieldClass} {...props} />
  </label>
);

export const Select = ({ label, children, ...props }) => (
  <label className="block text-sm">
    <span className="text-slate-600">{label}</span>
    <select className={fieldClass} {...props}>
      {children}
    </select>
  </label>
);

export const Alert = ({ kind = 'error', children }) => {
  if (!children) return null;
  const style =
    kind === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${style}`}>{children}</div>;
};

export const Loading = () => <p className="text-slate-500 text-sm">Loading…</p>;

const BADGES = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-800',
  tax_verified: 'bg-cyan-100 text-cyan-800',
  tax_hold: 'bg-amber-100 text-amber-800',
  under_review: 'bg-indigo-100 text-indigo-800',
  docs_requested: 'bg-orange-100 text-orange-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-200 text-slate-600',
  unpaid: 'bg-amber-100 text-amber-800',
  partial: 'bg-orange-100 text-orange-800',
  paid: 'bg-emerald-100 text-emerald-800',
  initiated: 'bg-slate-100 text-slate-700',
  pending: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-slate-200 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-800',
  no_show: 'bg-red-100 text-red-800',
};

export const Badge = ({ status }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGES[status] || BADGES.draft}`}>
    {String(status).replace(/_/g, ' ')}
  </span>
);

export const money = (v) =>
  `${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

export const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '—');
export const fmtDay = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '—');

// columns: [{ key, label, render?(row) }]
export function Table({ columns, rows, empty = 'Nothing here yet.' }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            {columns.map((c) => (
              <th key={c.label} className="py-2 pr-4 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="border-b border-slate-100 last:border-0">
              {columns.map((c) => (
                <td key={c.label} className="py-2 pr-4 align-top">
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const PageTitle = ({ children, action }) => (
  <div className="flex items-center justify-between mb-4">
    <h1 className="text-2xl font-semibold text-slate-800">{children}</h1>
    {action}
  </div>
);

// Runs an action, shows its error, and reloads afterwards
export function useAction(reload) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (reload) await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
