const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, toId } = require('../lib/util');

function validatePolygon(geo) {
  if (!geo || geo.type !== 'Polygon' || !Array.isArray(geo.coordinates) || geo.coordinates.length === 0) {
    throw fail(400, 'boundary must be a GeoJSON Polygon');
  }
  const ring = geo.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    throw fail(400, 'A polygon needs at least 3 corners');
  }
  for (const pt of ring) {
    const ok =
      Array.isArray(pt) &&
      pt.length >= 2 &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]) &&
      Math.abs(pt[0]) <= 180 &&
      Math.abs(pt[1]) <= 90;
    if (!ok) throw fail(400, 'Coordinates must be [longitude, latitude]');
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw fail(400, 'The polygon must be closed (first and last point equal)');
  }
  // Only the outer ring is kept
  return { type: 'Polygon', coordinates: [ring.map((p) => [p[0], p[1]])] };
}

// FR-22 / FR-23 / FR-24: save a boundary, refusing invalid shapes and overlaps
async function setBoundary(idParam, data, actor) {
  const id = toId(idParam);
  const geo = validatePolygon((data || {}).boundary);
  const json = JSON.stringify(geo);

  return prisma.$transaction(async (tx) => {
    const parcel = await tx.landParcel.findUnique({
      where: { id },
      select: { id: true, parcel_number: true },
    });
    if (!parcel) throw fail(404, 'Parcel not found');

    const valid = await tx.$queryRaw`
      SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${json}::text), 4326)) AS ok`;
    if (!valid[0].ok) {
      throw fail(400, 'The boundary is not a valid shape (for example, it crosses itself)');
    }

    // Neighbours may share an edge, but their areas must not overlap
    const overlaps = await tx.$queryRaw`
      SELECT id, parcel_number FROM land_parcels
      WHERE id <> ${id} AND boundary IS NOT NULL
        AND ST_Intersects(boundary, ST_SetSRID(ST_GeomFromGeoJSON(${json}::text), 4326))
        AND NOT ST_Touches(boundary, ST_SetSRID(ST_GeomFromGeoJSON(${json}::text), 4326))`;
    if (overlaps.length > 0) {
      throw fail(
        409,
        `The boundary overlaps parcel ${overlaps.map((o) => o.parcel_number).join(', ')}`
      );
    }

    await tx.$executeRaw`
      UPDATE land_parcels
      SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(${json}::text), 4326),
          version = version + 1,
          updated_at = now()
      WHERE id = ${id}`;

    await audit.log(
      {
        userId: actor.id,
        action: 'PARCEL_BOUNDARY_SET',
        entityType: 'land_parcel',
        entityId: id,
        newValues: { parcel_number: parcel.parcel_number, corners: geo.coordinates[0].length - 1 },
        ipAddress: actor.ip,
      },
      tx
    );
    return { parcel_id: id, parcel_number: parcel.parcel_number, boundary: geo };
  });
}

async function getBoundary(idParam) {
  const id = toId(idParam);
  const rows = await prisma.$queryRaw`
    SELECT parcel_number,
           ST_AsGeoJSON(boundary) AS geojson,
           ST_Area(boundary::geography) AS area_sqm
    FROM land_parcels WHERE id = ${id}`;
  if (rows.length === 0) throw fail(404, 'Parcel not found');
  const row = rows[0];
  return {
    parcel_id: id,
    parcel_number: row.parcel_number,
    boundary: row.geojson ? JSON.parse(row.geojson) : null,
    measured_area_sqm: row.area_sqm == null ? null : Math.round(Number(row.area_sqm) * 100) / 100,
  };
}

async function featureCollection() {
  const rows = await prisma.$queryRaw`
    SELECT p.id, p.parcel_number, p.kebele, o.full_name AS owner,
           ST_AsGeoJSON(p.boundary) AS geojson
    FROM land_parcels p
    LEFT JOIN owners o ON o.id = p.current_owner_id
    WHERE p.boundary IS NOT NULL
    ORDER BY p.id
    LIMIT 500`;
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      properties: { id: r.id, parcel_number: r.parcel_number, kebele: r.kebele, owner: r.owner },
      geometry: JSON.parse(r.geojson),
    })),
  };
}

module.exports = { setBoundary, getBoundary, featureCollection };
