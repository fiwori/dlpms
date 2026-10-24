import { useState } from 'react';
import { api, openPdf } from '../api.js';
import { Alert, Badge, Button, Card, fmtDate, Input, Loading, money, PageTitle, Select, Table, useAction, useLoad } from '../ui.jsx';

export default function TaxDesk() {
  const parcels = useLoad(() => api.get('/parcels?limit=100'));
  const records = useLoad(() => api.get('/tax/records?limit=100'));
  const payments = useLoad(() => api.get('/payments?limit=50'));

  const refresh = async () => {
    await Promise.all([records.reload(), payments.reload()]);
  };
  const act = useAction(refresh);

  const [parcelId, setParcelId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [paying, setPaying] = useState(null); // the record being paid at the counter
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');

  const createRecord = (e) => {
    e.preventDefault();
    act.run(() => api.post('/tax/records', { parcel_id: Number(parcelId), tax_year: Number(year) }));
  };

  const recordCash = (e) => {
    e.preventDefault();
    act.run(async () => {
      await api.post('/payments/offline', {
        tax_record_id: paying.id,
        amount: Number(amount),
        payer_name: payer,
      });
      setPaying(null);
      setAmount('');
      setPayer('');
    });
  };

  return (
    <>
      <PageTitle>Tax desk</PageTitle>
      <Alert>{act.error}</Alert>

      <Card title="Assess tax for a parcel">
        <form onSubmit={createRecord} className="flex flex-wrap items-end gap-3">
          <Select label="Parcel" value={parcelId} onChange={(e) => setParcelId(e.target.value)} required>
            <option value="">Select a parcel</option>
            {(parcels.data ? parcels.data.items : []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.parcel_number} ({p.land_use}, {p.area_sqm} sq. m)
              </option>
            ))}
          </Select>
          <Input label="Tax year" type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} required />
          <Button type="submit" disabled={act.busy}>
            Calculate and save
          </Button>
        </form>
        <p className="text-xs text-slate-500 mt-2">The amount is the parcel area times the rate set by the administrator under Settings.</p>
      </Card>

      {paying && (
        <Card title={`Counter payment for ${paying.parcel.parcel_number} (${paying.tax_year})`} className="mt-4 border-emerald-300">
          <form onSubmit={recordCash} className="flex flex-wrap items-end gap-3">
            <Input label={`Amount (balance ${money(paying.balance)})`} type="number" step="any" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <Input label="Paid by" value={payer} onChange={(e) => setPayer(e.target.value)} required />
            <Button type="submit" disabled={act.busy}>
              Record cash payment
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPaying(null)}>
              Close
            </Button>
          </form>
        </Card>
      )}

      <Card title="Tax records" className="mt-4">
        {records.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No tax records yet."
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
                    <button
                      className="text-emerald-700 hover:underline"
                      onClick={() => {
                        setPaying(r);
                        setAmount(String(r.balance));
                      }}
                    >
                      Record counter payment
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Card title="Recent payments" className="mt-4">
        {payments.loading ? (
          <Loading />
        ) : (
          <Table
            empty="No payments yet."
            rows={payments.data ? payments.data.items : []}
            columns={[
              { label: 'Date', render: (p) => fmtDate(p.created_at) },
              { label: 'Reference', key: 'transaction_ref' },
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
