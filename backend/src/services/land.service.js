const prisma = require('../lib/prisma');
const audit = require('./audit.service');
const { fail, str, paging, toId } = require('../lib/util');

// Turns Decimals, dates and undefined into plain JSON-safe values
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

const parcelInclude = {
  owner: {
    select: { id: true, user_id: true, full_name: true, national_id: true },
  },
};

// ---------- Owners ----------

async function createOwner(data, actor) {
  const body = data || {};
  const full_name = str(body.full_name);
  const national_id = str(body.national_id);
  const phone_number = str(body.phone_number);
  const address = str(body.address);

  if (!full_name || !national_id) {
    throw fail(400, 'full_name and national_id are required');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const owner = await tx.owner.create({
        data: {
          full_name,
          national_id,
          phone_number: phone_number || null,
          address: address || null,
        },
      });
      await audit.log(
        {
          userId: actor.id,
          action: 'OWNER_CREATED',
          entityType: 'owner',
          entityId: owner.id,
          newValues: { full_name, national_id },
          ipAddress: actor.ip,
        },
        tx
      );
      return owner;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw fail(409, 'An owner with this national ID already exists');
    }
    throw err;
  }
}

async function listOwners(query) {
  const { page, limit, skip } = paging(query);
  const search = str(query.search);
  const where = search
    ? {
        OR: [
          { full_name: { contains: search, mode: 'insensitive' } },
          { national_id: { contains: search, mode: 'insensitive' } },
          { phone_number: { contains: search } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.owner.count({ where }),
    prisma.owner.findMany({ where, orderBy: { id: 'desc' }, skip, take: limit }),
  ]);
  return { page, limit, total, items };
}

async function getOwner(idParam) {
  const id = toId(idParam);
  const owner = await prisma.owner.findUnique({
    where: { id },
    include: {
      parcels: {
        select: { id: true, parcel_number: true, kebele: true, area_sqm: true },
      },
    },
  });
  if (!owner) throw fail(404, 'Owner not found');
  return owner;
}

// ---------- Parcels ----------

async function createParcel(data, actor) {
  const body = data || {};
  const parcel_number = str(body.parcel_number);
  const kebele = str(body.kebele);
  const land_use = str(body.land_use);
  const sub_city = str(body.sub_city);
  const property_type = str(body.property_type);
  const cis_reference = str(body.cis_reference);
  const area = Number(body.area_sqm);

  if (!parcel_number || !kebele || !land_use) {
    throw fail(400, 'parcel_number, kebele, land_use and area_sqm are required');
  }
  if (!Number.isFinite(area) || area <= 0) {
    throw fail(400, 'area_sqm must be a positive number');
  }
  const owner_id =
    body.owner_id != null && body.owner_id !== '' ? toId(body.owner_id) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      if (owner_id) {
        const owner = await tx.owner.findUnique({ where: { id: owner_id } });
        if (!owner) throw fail(404, 'Owner not found');
      }

      const parcel = await tx.landParcel.create({
        data: {
          parcel_number,
          kebele,
          land_use,
          sub_city: sub_city || null,
          property_type: property_type || null,
          cis_reference: cis_reference || null,
          area_sqm: area,
          current_owner_id: owner_id,
        },
        include: parcelInclude,
      });

      // First entry of the ownership history
      if (owner_id) {
        await tx.registryEntry.create({
          data: { parcel_id: parcel.id, to_owner_id: owner_id },
        });
      }

      await audit.log(
        {
          userId: actor.id,
          action: 'PARCEL_CREATED',
          entityType: 'land_parcel',
          entityId: parcel.id,
          newValues: { parcel_number, kebele, area_sqm: area, owner_id },
          ipAddress: actor.ip,
        },
        tx
      );
      return parcel;
    });
  } catch (err) {
    if (err.code === 'P2002') {
      throw fail(409, 'A parcel with this parcel number already exists');
    }
    throw err;
  }
}

async function listParcels(query) {
  const { page, limit, skip } = paging(query);
  const where = {};

  const search = str(query.search);
  if (search) {
    where.OR = [
      { parcel_number: { contains: search, mode: 'insensitive' } },
      { kebele: { contains: search, mode: 'insensitive' } },
      { sub_city: { contains: search, mode: 'insensitive' } },
      { owner: { full_name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const kebele = str(query.kebele);
  if (kebele) where.kebele = { equals: kebele, mode: 'insensitive' };
  if (query.owner_id) where.current_owner_id = toId(query.owner_id);

  const [total, items] = await Promise.all([
    prisma.landParcel.count({ where }),
    prisma.landParcel.findMany({
      where,
      include: parcelInclude,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  return { page, limit, total, items };
}

async function listMyParcels(userId) {
  const items = await prisma.landParcel.findMany({
    where: { owner: { user_id: userId } },
    include: parcelInclude,
    orderBy: { id: 'desc' },
  });
  return { total: items.length, items };
}

async function getParcel(idParam, actor) {
  const id = toId(idParam);
  const parcel = await prisma.landParcel.findUnique({
    where: { id },
    include: parcelInclude,
  });
  if (!parcel) throw fail(404, 'Parcel not found');

  // Citizens may only see their own parcels; otherwise pretend it does not exist
  if (
    actor.role === 'CITIZEN' &&
    !(parcel.owner && parcel.owner.user_id === actor.id)
  ) {
    throw fail(404, 'Parcel not found');
  }
  return parcel;
}

async function updateParcel(idParam, data, actor) {
  const id = toId(idParam);
  const body = data || {};

  const version = Number(body.version);
  if (!Number.isInteger(version)) {
    throw fail(400, 'version is required (send the version you loaded)');
  }

  const changes = {};
  if (body.kebele !== undefined) {
    const v = str(body.kebele);
    if (!v) throw fail(400, 'kebele cannot be empty');
    changes.kebele = v;
  }
  if (body.land_use !== undefined) {
    const v = str(body.land_use);
    if (!v) throw fail(400, 'land_use cannot be empty');
    changes.land_use = v;
  }
  if (body.area_sqm !== undefined) {
    const a = Number(body.area_sqm);
    if (!Number.isFinite(a) || a <= 0) {
      throw fail(400, 'area_sqm must be a positive number');
    }
    changes.area_sqm = a;
  }
  if (body.sub_city !== undefined) changes.sub_city = str(body.sub_city) || null;
  if (body.property_type !== undefined) {
    changes.property_type = str(body.property_type) || null;
  }
  if (body.cis_reference !== undefined) {
    changes.cis_reference = str(body.cis_reference) || null;
  }
  if (Object.keys(changes).length === 0) {
    throw fail(400, 'No updatable fields provided');
  }

  return prisma.$transaction(async (tx) => {
    const old = await tx.landParcel.findUnique({ where: { id } });
    if (!old) throw fail(404, 'Parcel not found');

    // Optimistic locking (FR-35): only succeeds if nobody changed it meanwhile
    const result = await tx.landParcel.updateMany({
      where: { id, version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw fail(409, 'This parcel was changed by someone else. Reload it and try again.');
    }

    const oldValues = {};
    for (const key of Object.keys(changes)) oldValues[key] = plain(old[key]);

    await audit.log(
      {
        userId: actor.id,
        action: 'PARCEL_UPDATED',
        entityType: 'land_parcel',
        entityId: id,
        oldValues,
        newValues: plain(changes),
        ipAddress: actor.ip,
      },
      tx
    );

    return tx.landParcel.findUnique({ where: { id }, include: parcelInclude });
  });
}

module.exports = {
  createOwner,
  listOwners,
  getOwner,
  createParcel,
  listParcels,
  listMyParcels,
  getParcel,
  updateParcel,
};