const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, str, toId } = require('../lib/util');

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:4000';

function maskName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function renderPdf(d, qrPng) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Border
    doc.lineWidth(2).rect(30, 30, pageW - 60, pageH - 60).stroke('#1f3a5f');

    // Watermark
    doc.save();
    doc.rotate(-35, { origin: [pageW / 2, pageH / 2] });
    doc.fillColor('#1f3a5f').fillOpacity(0.06).font('Helvetica-Bold').fontSize(90);
    doc.text('DLPMS', 0, pageH / 2 - 45, { width: pageW, align: 'center' });
    doc.restore();

    // Header
    doc.fillOpacity(1).fillColor('#1f3a5f');
    doc.font('Helvetica-Bold').fontSize(20);
    doc.text('Dire Dawa Land Administration', 50, 70, { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#444');
    doc.text('Digital Land and Property Management System', { align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000');
    doc.text('CERTIFICATE OF OWNERSHIP TRANSFER', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(12);
    doc.text(`Certificate No: ${d.certificate_number}`, { align: 'center' });
    doc.moveDown(1.5);

    // Details
    const rows = [
      ['Tracking ID', d.tracking_id],
      ['Parcel number', d.parcel_number],
      ['Location', d.location],
      ['Area', `${d.area_sqm} sq. m`],
      ['Land use', d.land_use],
      ['Previous owner', d.seller],
      ['New owner', d.buyer],
    ];
    if (d.sale_price) rows.push(['Sale price', `${d.sale_price} ETB`]);
    rows.push(['Date approved', d.approved_on]);

    const left = 80;
    const labelW = 150;
    let y = doc.y;
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333');
      doc.text(label, left, y, { width: labelW });
      doc.font('Helvetica').fontSize(11).fillColor('#000');
      doc.text(String(value), left + labelW, y, { width: pageW - left - labelW - 70 });
      y = doc.y + 8;
    });

    // QR code and note
    doc.image(qrPng, left, y + 20, { width: 110 });
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    doc.text(
      'Scan the QR code to verify this certificate against the land registry.',
      left + 125,
      y + 45,
      { width: 280 }
    );
    doc.text(d.verify_url, left + 125, doc.y + 4, { width: 280 });

    // Footer
    doc.fontSize(8).fillColor('#666');
    doc.text(
      'This certificate is valid only while it matches the current entry in the land registry.',
      50,
      pageH - 75,
      { width: pageW - 100, align: 'center' }
    );

    doc.end();
  });
}

async function buildCertificate(idParam, actor) {
  const id = toId(idParam);
  const t = await prisma.transferRequest.findUnique({
    where: { id },
    include: { parcel: true, seller: true, buyer: true, registry_entry: true },
  });
  if (!t) throw fail(404, 'Transfer request not found');

  const related =
    t.created_by_id === actor.id ||
    t.seller.user_id === actor.id ||
    t.buyer.user_id === actor.id;
  if (actor.role === 'CITIZEN' && !related) {
    throw fail(404, 'Transfer request not found');
  }

  const entry = t.registry_entry;
  if (t.status !== 'approved' || !entry || !entry.certificate_number) {
    throw fail(409, 'A certificate is only available for approved transfers');
  }

  const verify_url = `${PUBLIC_URL}/api/verify/${encodeURIComponent(entry.certificate_number)}`;
  const qrPng = await QRCode.toBuffer(verify_url, { width: 300, margin: 1 });

  const approvedAt = t.decided_at || entry.registered_at;
  const buffer = await renderPdf(
    {
      certificate_number: entry.certificate_number,
      tracking_id: t.tracking_id,
      parcel_number: t.parcel.parcel_number,
      location: t.parcel.sub_city
        ? `${t.parcel.kebele}, ${t.parcel.sub_city}`
        : t.parcel.kebele,
      area_sqm: t.parcel.area_sqm.toString(),
      land_use: t.parcel.land_use,
      seller: `${t.seller.full_name} (${t.seller.national_id})`,
      buyer: `${t.buyer.full_name} (${t.buyer.national_id})`,
      sale_price: t.sale_price ? t.sale_price.toString() : null,
      approved_on: approvedAt.toISOString().slice(0, 10),
      verify_url,
    },
    qrPng
  );

  // Recording the download must never block the download itself
  try {
    await audit.log({
      userId: actor.id,
      action: 'CERTIFICATE_DOWNLOADED',
      entityType: 'registry_entry',
      entityId: entry.id,
      newValues: { certificate_number: entry.certificate_number },
      ipAddress: actor.ip,
    });
  } catch (e) {
    console.error('Audit log failed:', e);
  }

  return { buffer, filename: `${entry.certificate_number}.pdf` };
}

// Public: tells anyone with the QR code whether a certificate is genuine
async function verify(numberParam) {
  const number = str(numberParam);
  if (!number || number.length > 40) throw fail(400, 'Invalid certificate number');

  const entry = await prisma.registryEntry.findUnique({
    where: { certificate_number: number },
    include: {
      parcel: { select: { parcel_number: true, kebele: true } },
      to_owner: { select: { full_name: true } },
    },
  });
  if (!entry) throw fail(404, 'Certificate not found');

  const latest = await prisma.registryEntry.findFirst({
    where: { parcel_id: entry.parcel_id },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  const valid = latest.id === entry.id;

  return {
    valid,
    certificate_number: entry.certificate_number,
    parcel_number: entry.parcel.parcel_number,
    kebele: entry.parcel.kebele,
    owner: maskName(entry.to_owner.full_name),
    issued_on: entry.registered_at.toISOString().slice(0, 10),
    note: valid
      ? 'This certificate matches the current registry entry.'
      : 'This certificate has been superseded by a later transfer.',
  };
}

module.exports = { buildCertificate, verify };