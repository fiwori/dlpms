import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Badge, Button, Card, fmtDay, Input, Loading, PageTitle, Table, useAction, useLoad } from '../ui.jsx';

export default function Appointments() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [purpose, setPurpose] = useState('');
  const slots = useLoad(() => api.get(`/appointments/slots?date=${date}`), [date]);
  const mine = useLoad(() => api.get('/appointments/mine'));

  const refresh = async () => {
    await Promise.all([slots.reload(), mine.reload()]);
  };
  const act = useAction(refresh);

  return (
    <>
      <PageTitle>Appointments</PageTitle>
      <Alert>{act.error}</Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Book a visit">
          <div className="space-y-3">
            <Input label="Date (Monday to Friday)" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Purpose (optional)" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <Alert>{slots.error}</Alert>
            {slots.loading ? (
              <Loading />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(slots.data ? slots.data.slots : []).map((s) => (
                  <button
                    key={s.time}
                    disabled={act.busy || s.free === 0}
                    onClick={() => act.run(() => api.post('/appointments', { date, time_slot: s.time, purpose }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s.time}
                    <span className="block text-xs text-slate-500">{s.free === 0 ? 'full' : `${s.free} free`}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title="My appointments">
          {mine.loading ? (
            <Loading />
          ) : (
            <Table
              empty="You have no appointments."
              rows={mine.data ? mine.data.items : []}
              columns={[
                { label: 'Date', render: (a) => fmtDay(a.scheduled_date) },
                { label: 'Time', key: 'time_slot' },
                { label: 'Status', render: (a) => <Badge status={a.status} /> },
                {
                  label: '',
                  render: (a) =>
                    a.status === 'scheduled' ? (
                      <button className="text-red-600 hover:underline" onClick={() => act.run(() => api.del(`/appointments/${a.id}`))}>
                        Cancel
                      </button>
                    ) : null,
                },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}
