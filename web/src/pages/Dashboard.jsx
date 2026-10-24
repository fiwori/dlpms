import { api, downloadFile } from '../api.js';
import { Alert, Button, Card, Loading, money, PageTitle, Table, useAction, useLoad } from '../ui.jsx';

const Stat = ({ label, value }) => (
  <Card>
    <div className="text-sm text-slate-500">{label}</div>
    <div className="text-2xl font-semibold text-slate-800">{value}</div>
  </Card>
);

export default function Dashboard() {
  const { data, error, loading } = useLoad(() => api.get('/reports/summary'));
  const act = useAction();

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;

  const statuses = Object.entries(data.transfers);

  return (
    <>
      <PageTitle
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => act.run(() => downloadFile('/reports/transfers.csv', 'transfers.csv'))}>
              Transfers (CSV)
            </Button>
            <Button variant="secondary" onClick={() => act.run(() => downloadFile('/reports/payments.csv', 'payments.csv'))}>
              Payments (CSV)
            </Button>
          </div>
        }
      >
        Dashboard
      </PageTitle>
      <Alert>{act.error}</Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Parcels" value={data.parcels} />
        <Stat label="Owners" value={data.owners} />
        <Stat label="User accounts" value={data.users} />
        <Stat label="Upcoming appointments" value={data.upcoming_appointments} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Property tax">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Assessed</dt>
            <dd className="text-right">{money(data.tax.assessed)}</dd>
            <dt className="text-slate-500">Collected</dt>
            <dd className="text-right">{money(data.tax.collected)}</dd>
            <dt className="text-slate-500">Outstanding</dt>
            <dd className="text-right font-semibold">{money(data.tax.outstanding)}</dd>
          </dl>
          <h3 className="mt-4 mb-1 text-sm font-medium text-slate-700">Completed payments</h3>
          <Table
            empty="No payments yet."
            rows={data.payments.map((p) => ({ ...p, id: p.method }))}
            columns={[
              { label: 'Method', key: 'method' },
              { label: 'Count', key: 'count' },
              { label: 'Total', render: (p) => money(p.total) },
            ]}
          />
        </Card>

        <Card title="Transfer requests by status">
          <Table
            empty="No transfer requests yet."
            rows={statuses.map(([status, count]) => ({ id: status, status, count }))}
            columns={[
              { label: 'Status', render: (r) => r.status.replace(/_/g, ' ') },
              { label: 'Requests', key: 'count' },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
