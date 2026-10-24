import { api } from '../api.js';
import { Alert, Badge, Card, fmtDay, Loading, PageTitle, Table, useAction, useLoad } from '../ui.jsx';

export default function StaffAppointments() {
  const { data, error, loading, reload } = useLoad(() => api.get('/appointments'));
  const act = useAction(reload);
  const setStatus = (id, status) => act.run(() => api.patch(`/appointments/${id}`, { status }));

  return (
    <>
      <PageTitle>Appointments</PageTitle>
      <Alert>{error || act.error}</Alert>
      <Card>
        {loading ? (
          <Loading />
        ) : (
          <Table
            empty="No appointments booked."
            rows={data ? data.items : []}
            columns={[
              { label: 'Date', render: (a) => fmtDay(a.scheduled_date) },
              { label: 'Time', key: 'time_slot' },
              { label: 'Citizen', render: (a) => (a.citizen.owner ? a.citizen.owner.full_name : a.citizen.phone_number) },
              { label: 'Phone', render: (a) => a.citizen.phone_number },
              { label: 'Purpose', render: (a) => a.purpose || '—' },
              { label: 'Status', render: (a) => <Badge status={a.status} /> },
              {
                label: '',
                render: (a) =>
                  a.status === 'scheduled' ? (
                    <span className="flex gap-3">
                      <button className="text-emerald-700 hover:underline" onClick={() => setStatus(a.id, 'completed')}>
                        Completed
                      </button>
                      <button className="text-red-600 hover:underline" onClick={() => setStatus(a.id, 'no_show')}>
                        No-show
                      </button>
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
