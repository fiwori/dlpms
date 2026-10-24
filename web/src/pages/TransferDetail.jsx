import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, openPdf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Badge, Button, Card, fmtDate, Input, Loading, money, PageTitle, Select, useAction, useLoad } from '../ui.jsx';

const ACTIVE = ['draft', 'submitted', 'tax_verified', 'tax_hold', 'under_review', 'docs_requested'];

export default function TransferDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: d, error, loading, reload } = useLoad(() => api.get(`/transfers/${id}`), [id]);
  const act = useAction(reload);
  const [docName, setDocName] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  if (loading && !d) return <Loading />;
  if (error && !d) return <Alert>{error}</Alert>;

  const isCreator = user.id === d.created_by_id;
  const isAdmin = user.role === 'SYSTEM_ADMIN';
  const isOfficer = user.role === 'LAND_OFFICER' || isAdmin;
  const canReview = isOfficer && (isAdmin || d.assigned_officer_id === user.id);
  const post = (path, body) => act.run(() => api.post(`/transfers/${id}/${path}`, body));

  return (
    <>
      <PageTitle action={<Badge status={d.status} />}>Transfer {d.tracking_id}</PageTitle>
      <Alert>{act.error}</Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Details">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Parcel</dt>
            <dd className="col-span-2">{d.parcel.parcel_number} ({d.parcel.kebele}, {d.parcel.area_sqm} sq. m)</dd>
            <dt className="text-slate-500">Seller</dt>
            <dd className="col-span-2">{d.seller.full_name} ({d.seller.national_id})</dd>
            <dt className="text-slate-500">Buyer</dt>
            <dd className="col-span-2">{d.buyer.full_name} ({d.buyer.national_id})</dd>
            <dt className="text-slate-500">Price</dt>
            <dd className="col-span-2">{d.sale_price ? money(d.sale_price) : '—'}</dd>
            <dt className="text-slate-500">Officer</dt>
            <dd className="col-span-2">{d.assigned_officer ? d.assigned_officer.phone_number : 'Not assigned yet'}</dd>
            {d.officer_notes && (
              <>
                <dt className="text-slate-500">Officer note</dt>
                <dd className="col-span-2">{d.officer_notes}</dd>
              </>
            )}
            {d.rejection_reason && (
              <>
                <dt className="text-slate-500">Rejected because</dt>
                <dd className="col-span-2">{d.rejection_reason}</dd>
              </>
            )}
          </dl>
          <h3 className="mt-4 mb-1 text-sm font-medium text-slate-700">Documents</h3>
          <ul className="text-sm list-disc pl-5">
            {(d.documents || []).map((x, i) => (
              <li key={i}>
                {x.name} <span className="text-slate-500">({x.type})</span>
              </li>
            ))}
            {(!d.documents || d.documents.length === 0) && <li className="list-none -ml-5 text-slate-500">None yet</li>}
          </ul>
        </Card>

        <Card title="Actions">
          <div className="space-y-4">
            {d.status === 'approved' && (
              <Button onClick={() => act.run(() => openPdf(`/transfers/${id}/certificate`))}>
                Download certificate
              </Button>
            )}

            {isCreator && d.status === 'draft' && (
              <Button disabled={act.busy} onClick={() => post('submit')}>
                Submit request
              </Button>
            )}

            {isCreator && d.status === 'tax_hold' && (
              <div className="space-y-2">
                <p className="text-sm text-amber-800">
                  This request is waiting for unpaid property tax. Pay it under “Tax and payments”, then re-check.
                </p>
                <Button variant="secondary" disabled={act.busy} onClick={() => post('recheck-tax')}>
                  I have paid, re-check
                </Button>
              </div>
            )}

            {isCreator && ['draft', 'docs_requested'].includes(d.status) && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input label="Add a document (file name)" value={docName} onChange={(e) => setDocName(e.target.value)} />
                </div>
                <Button
                  variant="secondary"
                  disabled={act.busy || !docName.trim()}
                  onClick={() => post('documents', { documents: [{ name: docName.trim(), type: 'other' }] }).then(() => setDocName(''))}
                >
                  Add
                </Button>
              </div>
            )}

            {user.role === 'LAND_OFFICER' && d.status === 'tax_verified' && (
              <Button disabled={act.busy} onClick={() => post('assign')}>
                Take for review
              </Button>
            )}

            {canReview && d.status === 'under_review' && (
              <div className="space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input label="Ask the citizen for more documents" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <Button variant="secondary" disabled={act.busy || !note.trim()} onClick={() => post('request-documents', { note })}>
                    Request
                  </Button>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input label="Reason for rejecting" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  <Button variant="danger" disabled={act.busy || !reason.trim()} onClick={() => post('reject', { reason, version: d.version })}>
                    Reject
                  </Button>
                </div>
                <Button disabled={act.busy} onClick={() => post('approve', { version: d.version })}>
                  Approve and transfer ownership
                </Button>
              </div>
            )}

            {(isCreator || isAdmin) && ACTIVE.includes(d.status) && (
              <Button variant="danger" disabled={act.busy} onClick={() => post('cancel', { reason: 'Cancelled from the web app' })}>
                Cancel request
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card title="History" className="mt-4">
        <ol className="space-y-2 text-sm">
          {(d.history || []).map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-slate-500 w-44 shrink-0">{fmtDate(h.created_at)}</span>
              <span className="font-medium">{h.action.replace('TRANSFER_', '').replace(/_/g, ' ').toLowerCase()}</span>
              <span className="text-slate-600">{h.new_values && h.new_values.reason ? `– ${h.new_values.reason}` : ''}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
