import { useState } from 'react';
import { api, openPdf } from '../api.js';
import { Alert, Badge, Button, Card, fmtDate, Loading, money, PageTitle, Table, useAction, useLoad } from '../ui.jsx';

export default function Tax() {
  const records = useLoad(() => api.get('/tax/mine'));
  const payments = useLoad(() => api.get('/payments/mine'));
  const [checkout, setCheckout] = useState(null);

  const refresh = async () => {
    await Promise.all([records.reload(), payments.reload()]);
  };
  const act = useAction(refresh);

  const startPayment = (record) =>
    act.run(async () => {
      const p = await api.post('/payments', { tax_record_id: record.id });
      setCheckout({ id: p.id, ref: p.transaction_ref, amount: p.amount, parcel: record.parcel.parcel_number });
    });

  const finish = (outcome) =>
    act.run(async () => {
      await api.post(`/payments/${checkout.id}/mock-gateway`, { outcome });
      setCheckout(null);
    });

  return (
    <>
      <PageTitle>Tax and payments</PageTitle>
      <Alert>{act.error || records.error}</Alert>

      {checkout && (
        <Card title="telebirr checkout (demo)" className="mb-4 border-emerald-300">
          <p className="text-sm text-slate-600">
            Paying <b>{money(checkout.amount)}</b> for parcel {checkout.parcel}. Reference: {checkout.ref}
          </p>
          <p className="text-xs text-slate-500 mb-3">
            This stands in for the telebirr app. In production the gateway confirms the payment by itself.
          </p>
          <div className="flex gap-2">
            <Button disabled={act.busy} onClick={() => finish('success')}>
              Confirm payment
            </Button>
            <Button variant="secondary" disabled={act.busy} onClick={() => finish('fail')}>
              Simulate a failed payment
            </Button>
          </div>
        </Card>
      )}

      <Card title="Property tax">
        {records.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No tax has been assessed on your parcels."
            rows={records.data ? records.data.items : []}
            columns={[
              { label: 'Parcel', render: (r) => r.parcel.parcel_number },
              { label: 'Year', key: 'tax_year' },
              { label: 'Tax', render: (r) => money(r.tax_amount) },
              { label: 'Paid', render: (r) => money(r.paid_amount) },
              { label: 'Balance', render: (r) => money(r.balance) },
              { label: 'Status', render: (r) => <Badge status={r.status} /> },
              {
                label: '',
                render: (r) =>
                  Number(r.balance) > 0 ? (
                    <Button disabled={act.busy} onClick={() => startPayment(r)}>
                      Pay with telebirr
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Card title="Payment history" className="mt-4">
        {payments.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No payments yet."
            rows={payments.data ? payments.data.items : []}
            columns={[
              { label: 'Date', render: (p) => fmtDate(p.created_at) },
              { label: 'Parcel', render: (p) => p.tax_record.parcel.parcel_number },
              { label: 'Amount', render: (p) => money(p.amount) },
              { label: 'Method', key: 'method' },
              { label: 'Status', render: (p) => <Badge status={p.status} /> },
              {
                label: '',
                render: (p) =>
                  p.status === 'completed' ? (
                    <button className="text-emerald-700 hover:underline" onClick={() => act.run(() => openPdf(`/payments/${p.id}/receipt`))}>
                      Receipt
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
