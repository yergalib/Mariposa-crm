import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { createTenantContext } from "../lib/tenant/context";
import {
  addPurchaseItem,
  allocateAdditionalCost,
  archiveSupplier,
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  createSupplier,
  removePurchaseItem,
  updatePurchaseHeader,
  updatePurchaseItem,
  updateSupplier,
} from "../lib/purchases/management";
import { getPurchase, listPurchases } from "../lib/purchases/queries";

const organizations: string[] = [],
  users: string[] = [];
let passed = 0;
const ok = (name: string, value: unknown) => {
  if (!value) throw new Error(`FAIL ${name}`);
  passed++;
};
const rejects = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};
async function cleanup() {
  if (!organizations.length) return;
  await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_immutable_update"',
      );
      await tx.purchase.updateMany({
        where: { organizationId: { in: organizations } },
        data: { status: "DRAFT", confirmedAt: null, cancelledAt: null },
      });
      await tx.auditLog.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.purchaseItem.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.purchase.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.supplier.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.purchaseCounter.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.membershipPermissionOverride.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.membershipBranchAccess.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.organizationMembership.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.productVariant.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.product.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.size.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.category.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.branch.deleteMany({
        where: { organizationId: { in: organizations } },
      });
      await tx.$executeRawUnsafe(
        'ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_immutable_update"',
      );
      await tx.organization.deleteMany({
        where: { id: { in: organizations } },
      });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

async function main() {
  await cleanup();
  const orgId = randomUUID(),
    otherOrgId = randomUUID(),
    ownerId = randomUUID(),
    sellerId = randomUUID();
  organizations.push(orgId, otherOrgId);
  users.push(ownerId, sellerId);
  await db.organization.createMany({
    data: [
      {
        id: orgId,
        name: "Stage 9C-1",
        slug: `stage-9c-1-${orgId.slice(0, 8)}`,
      },
      {
        id: otherOrgId,
        name: "Stage 9C-1 Other",
        slug: `stage-9c-1-other-${orgId.slice(0, 8)}`,
      },
    ],
  });
  const hash = createHash("sha256").update(orgId).digest("hex");
  await db.user.createMany({
    data: [
      {
        id: ownerId,
        email: `9c1-owner-${orgId}@test.invalid`,
        displayName: "Owner",
        passwordHash: hash,
      },
      {
        id: sellerId,
        email: `9c1-seller-${orgId}@test.invalid`,
        displayName: "Seller",
        passwordHash: hash,
      },
    ],
  });
  const branchA = await db.branch.create({
      data: {
        organizationId: orgId,
        name: "A",
        code: "A",
        city: "Test",
        timezone: "Asia/Qyzylorda",
      },
    }),
    branchB = await db.branch.create({
      data: {
        organizationId: orgId,
        name: "B",
        code: "B",
        city: "Test",
        timezone: "Asia/Qyzylorda",
      },
    }),
    otherBranch = await db.branch.create({
      data: {
        organizationId: otherOrgId,
        name: "X",
        code: "X",
        city: "Test",
        timezone: "Asia/Qyzylorda",
      },
    });
  const owner = await db.organizationMembership.create({
      data: {
        organizationId: orgId,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
        defaultBranchId: branchA.id,
      },
    }),
    seller = await db.organizationMembership.create({
      data: {
        organizationId: orgId,
        userId: sellerId,
        role: "SELLER",
        status: "ACTIVE",
        defaultBranchId: branchA.id,
      },
    });
  await db.membershipBranchAccess.create({
    data: {
      organizationId: orgId,
      membershipId: seller.id,
      branchId: branchA.id,
    },
  });
  const tenant = createTenantContext(orgId),
    actor = { userId: ownerId, membershipId: owner.id, role: "OWNER" as const },
    sellerActor = {
      userId: sellerId,
      membershipId: seller.id,
      role: "SELLER" as const,
    };
  const category = await db.category.create({
      data: { organizationId: orgId, name: "Платья", slug: `dress-${orgId}` },
    }),
    size = await db.size.create({
      data: { organizationId: orgId, code: "M", name: "M", sortOrder: 1 },
    }),
    product = await db.product.create({
      data: {
        organizationId: orgId,
        categoryId: category.id,
        name: "Аврора",
        internalCode: `A-${orgId}`,
        trackingMode: "SERIALIZED",
        publicationStatus: "ACTIVE",
      },
    }),
    variant1 = await db.productVariant.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        sizeId: size.id,
        sku: `A-M-${orgId}`,
      },
    }),
    size2 = await db.size.create({
      data: { organizationId: orgId, code: "L", name: "L", sortOrder: 2 },
    }),
    variant2 = await db.productVariant.create({
      data: {
        organizationId: orgId,
        productId: product.id,
        sizeId: size2.id,
        sku: `A-L-${orgId}`,
      },
    });
  const supplier = await createSupplier(
    tenant,
    {
      name: "Fashion House",
      contactName: "Aida",
      phone: "+77000000000",
      email: "supply@test.invalid",
      address: "Almaty",
      notes: "Main",
    },
    actor,
  );
  ok("supplier create", supplier.status === "ACTIVE");
  const edited = await updateSupplier(
    tenant,
    supplier.id,
    {
      name: "Fashion House KZ",
      contactName: "Aida",
      phone: "+77000000001",
      email: "supply@test.invalid",
      address: "Almaty",
      notes: "Updated",
    },
    actor,
  );
  ok(
    "supplier edit",
    edited.name === "Fashion House KZ" && edited.phone?.endsWith("1"),
  );
  const archived = await createSupplier(
    tenant,
    { name: "Old Supplier" },
    actor,
  );
  await archiveSupplier(tenant, archived.id, actor);
  ok(
    "supplier archive",
    (await db.supplier.findUniqueOrThrow({ where: { id: archived.id } }))
      .status === "ARCHIVED",
  );
  const header = (
      key: string,
      supplierId = supplier.id,
      branchId = branchA.id,
    ) => ({
      supplierId,
      destinationBranchId: branchId,
      currency: "KZT",
      additionalCostMinor: BigInt(100),
      externalReference: "INV-1",
      note: "Закупка",
      idempotencyKey: key,
    }),
    items = [
      {
        productVariantId: variant1.id,
        orderedQuantity: 1,
        unitCostMinor: BigInt(10000),
        lineDiscountMinor: BigInt(1000),
        note: "one",
      },
      {
        productVariantId: variant2.id,
        orderedQuantity: 3,
        unitCostMinor: BigInt(10000),
        lineDiscountMinor: BigInt(0),
        note: "two",
      },
    ];
  ok(
    "archived supplier rejected",
    await rejects(() =>
      createPurchase(tenant, header("archived", archived.id), items, actor),
    ),
  );
  const before = {
    stock: await db.stockLevel.count({ where: { organizationId: orgId } }),
    instances: await db.productInstance.count({
      where: { organizationId: orgId },
    }),
    movements: await db.inventoryMovement.count({
      where: { organizationId: orgId },
    }),
    finance: await db.financialTransaction.count({
      where: { organizationId: orgId },
    }),
    allocations: await db.capacityAllocation.count({
      where: { organizationId: orgId },
    }),
  };
  const purchase = await createPurchase(
    tenant,
    header("create-main"),
    items,
    actor,
  );
  ok(
    "purchase create",
    purchase.status === "DRAFT" && purchase.items.length === 2,
  );
  const stored = await db.purchase.findUniqueOrThrow({
    where: { id: purchase.id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  ok(
    "server totals",
    stored.subtotalMinor === BigInt(40000) &&
      stored.lineDiscountTotalMinor === BigInt(1000) &&
      stored.totalMinor === BigInt(39100),
  );
  ok(
    "additional allocation exact",
    stored.items[0]!.allocatedAdditionalCostMinor === BigInt(23) &&
      stored.items[1]!.allocatedAdditionalCostMinor === BigInt(77) &&
      stored.items.reduce(
        (s, x) => s + x.allocatedAdditionalCostMinor,
        BigInt(0),
      ) === BigInt(100),
  );
  ok(
    "allocation helper deterministic",
    allocateAdditionalCost(stored.items, BigInt(100))
      .map((x) => x.value)
      .join(",") === "23,77",
  );
  const replay = await createPurchase(
    tenant,
    header("create-main"),
    items,
    actor,
  );
  ok("create replay", replay.id === purchase.id);
  ok(
    "create collision",
    await rejects(() =>
      createPurchase(
        tenant,
        { ...header("create-main"), note: "different" },
        items,
        actor,
      ),
    ),
  );
  const concurrent = await Promise.all([
    createPurchase(tenant, header("create-race"), items, actor),
    createPurchase(tenant, header("create-race"), items, actor),
  ]);
  ok("concurrent create replay", concurrent[0].id === concurrent[1].id);
  const add = await addPurchaseItem(
    tenant,
    purchase.id,
    {
      productVariantId: variant1.id,
      orderedQuantity: 2,
      unitCostMinor: BigInt(5000),
      lineDiscountMinor: BigInt(0),
    },
    actor,
  );
  ok(
    "item add",
    (await db.purchaseItem.count({ where: { purchaseId: purchase.id } })) === 3,
  );
  await updatePurchaseItem(
    tenant,
    purchase.id,
    add.id,
    {
      productVariantId: variant1.id,
      orderedQuantity: 1,
      unitCostMinor: BigInt(6000),
      lineDiscountMinor: BigInt(500),
    },
    actor,
  );
  ok(
    "item edit",
    (await db.purchaseItem.findUniqueOrThrow({ where: { id: add.id } }))
      .unitCostMinor === BigInt(6000),
  );
  await removePurchaseItem(tenant, purchase.id, add.id, actor);
  ok(
    "item delete",
    (await db.purchaseItem.count({ where: { purchaseId: purchase.id } })) === 2,
  );
  let current = await db.purchase.findUniqueOrThrow({
    where: { id: purchase.id },
  });
  await updatePurchaseHeader(
    tenant,
    purchase.id,
    {
      supplierId: supplier.id,
      destinationBranchId: branchA.id,
      currency: "KZT",
      additionalCostMinor: BigInt(200),
      externalReference: "INV-2",
      note: "Updated",
      expectedVersion: current.version,
    },
    actor,
  );
  current = await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
  ok(
    "draft header edit",
    current.additionalCostMinor === BigInt(200) &&
      current.totalMinor === BigInt(39200),
  );
  ok(
    "optimistic conflict",
    await rejects(() =>
      updatePurchaseHeader(
        tenant,
        purchase.id,
        {
          supplierId: supplier.id,
          destinationBranchId: branchA.id,
          currency: "KZT",
          additionalCostMinor: BigInt(1),
          externalReference: null,
          note: null,
          expectedVersion: 1,
        },
        actor,
      ),
    ),
  );
  const confirmed = await confirmPurchase(
    tenant,
    purchase.id,
    "confirm-main",
    actor,
  );
  ok("confirm", confirmed.status === "CONFIRMED");
  ok(
    "confirm replay",
    (await confirmPurchase(tenant, purchase.id, "confirm-main", actor)).id ===
      purchase.id,
  );
  ok(
    "confirm collision",
    await rejects(() =>
      confirmPurchase(tenant, purchase.id, "confirm-other", actor),
    ),
  );
  ok(
    "confirmed immutable service",
    await rejects(() => addPurchaseItem(tenant, purchase.id, items[0]!, actor)),
  );
  ok(
    "confirmed immutable DB",
    await rejects(() =>
      db.purchase.update({
        where: { id: purchase.id },
        data: { note: "tamper" },
      }),
    ),
  );
  const draftCancel = await createPurchase(
    tenant,
    header("draft-cancel"),
    items,
    actor,
  );
  await cancelPurchase(tenant, draftCancel.id, "cancel-draft", actor);
  ok(
    "cancel draft",
    (await db.purchase.findUniqueOrThrow({ where: { id: draftCancel.id } }))
      .status === "CANCELLED",
  );
  const confirmedCancel = await createPurchase(
    tenant,
    header("confirmed-cancel"),
    items,
    actor,
  );
  await confirmPurchase(tenant, confirmedCancel.id, "confirm-cancel", actor);
  await cancelPurchase(tenant, confirmedCancel.id, "cancel-confirmed", actor);
  ok(
    "cancel confirmed before receipts",
    (await db.purchase.findUniqueOrThrow({ where: { id: confirmedCancel.id } }))
      .status === "CANCELLED",
  );
  ok(
    "cancel replay",
    (
      await cancelPurchase(
        tenant,
        confirmedCancel.id,
        "cancel-confirmed",
        actor,
      )
    ).id === confirmedCancel.id,
  );
  ok(
    "cancel collision",
    await rejects(() =>
      cancelPurchase(tenant, confirmedCancel.id, "cancel-other", actor),
    ),
  );
  const numbers = await db.purchase.findMany({
    where: { organizationId: orgId },
    select: { purchaseNumber: true },
  });
  ok(
    "purchase number unique",
    new Set(numbers.map((x) => x.purchaseNumber)).size === numbers.length,
  );
  const editRace = await createPurchase(
    tenant,
    header("edit-confirm-race"),
    items,
    actor,
  );
  const editRaceVersion = (
    await db.purchase.findUniqueOrThrow({ where: { id: editRace.id } })
  ).version;
  await Promise.allSettled([
    confirmPurchase(tenant, editRace.id, "edit-confirm-race-confirm", actor),
    updatePurchaseHeader(
      tenant,
      editRace.id,
      {
        supplierId: supplier.id,
        destinationBranchId: branchA.id,
        currency: "KZT",
        additionalCostMinor: BigInt(300),
        externalReference: "RACE",
        note: "Race",
        expectedVersion: editRaceVersion,
      },
      actor,
    ),
  ]);
  ok(
    "confirm versus edit serialized",
    (await db.purchase.findUniqueOrThrow({ where: { id: editRace.id } }))
      .status === "CONFIRMED",
  );
  const cancelRace = await createPurchase(
    tenant,
    header("confirm-cancel-race"),
    items,
    actor,
  );
  await Promise.allSettled([
    confirmPurchase(tenant, cancelRace.id, "race-confirm", actor),
    cancelPurchase(tenant, cancelRace.id, "race-cancel", actor),
  ]);
  ok(
    "confirm versus cancel serialized",
    (await db.purchase.findUniqueOrThrow({ where: { id: cancelRace.id } }))
      .status === "CANCELLED",
  );
  ok(
    "permissions seller denied",
    (await rejects(() =>
      createSupplier(tenant, { name: "Denied" }, sellerActor),
    )) &&
      (await rejects(() =>
        createPurchase(tenant, header("denied"), items, sellerActor),
      )),
  );
  await db.membershipPermissionOverride.createMany({
    data: ["PURCHASE_VIEW", "SUPPLIER_VIEW"].map((permissionKey) => ({
      organizationId: orgId,
      membershipId: seller.id,
      permissionKey,
      effect: "ALLOW" as const,
    })),
  });
  const hidden = await getPurchase(tenant, purchase.id, sellerActor);
  ok(
    "sensitive DTO filtered",
    !hidden.costVisible &&
      hidden.totalMinor === null &&
      hidden.items.every((x) => x.unitCostMinor === null),
  );
  const branchPurchase = await createPurchase(
    tenant,
    header("branch-b", supplier.id, branchB.id),
    items,
    actor,
  );
  ok(
    "branch isolation",
    await rejects(() => getPurchase(tenant, branchPurchase.id, sellerActor)),
  );
  const otherSupplier = await db.supplier.create({
    data: { organizationId: otherOrgId, name: "Foreign" },
  });
  ok(
    "tenant supplier rejected",
    await rejects(() =>
      createPurchase(tenant, header("foreign", otherSupplier.id), items, actor),
    ),
  );
  ok(
    "foreign branch rejected",
    await rejects(() =>
      createPurchase(
        tenant,
        header("foreign-branch", supplier.id, otherBranch.id),
        items,
        actor,
      ),
    ),
  );
  const list = await listPurchases(tenant, sellerActor);
  ok(
    "branch scoped list",
    list.rows.every((x) => x.destinationBranch.name === "A") &&
      list.rows.every((x) => x.totalMinor === null),
  );
  ok(
    "audit",
    (await db.auditLog.count({
      where: {
        organizationId: orgId,
        action: {
          in: [
            "SUPPLIER_CREATED",
            "SUPPLIER_EDITED",
            "SUPPLIER_ARCHIVED",
            "PURCHASE_CREATED",
            "PURCHASE_EDITED",
            "PURCHASE_ITEM_ADDED",
            "PURCHASE_ITEM_EDITED",
            "PURCHASE_ITEM_REMOVED",
            "PURCHASE_CONFIRMED",
            "PURCHASE_CANCELLED",
          ],
        },
      },
      })) >= 10,
  );
  await archiveSupplier(tenant, supplier.id, actor);
  ok(
    "archived supplier keeps purchase history",
    (await db.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { supplier: true },
    })).supplier.status === "ARCHIVED",
  );
  ok(
    "no operational side effects",
    (await db.stockLevel.count({ where: { organizationId: orgId } })) ===
      before.stock &&
      (await db.productInstance.count({ where: { organizationId: orgId } })) ===
        before.instances &&
      (await db.inventoryMovement.count({
        where: { organizationId: orgId },
      })) === before.movements &&
      (await db.financialTransaction.count({
        where: { organizationId: orgId },
      })) === before.finance &&
      (await db.capacityAllocation.count({
        where: { organizationId: orgId },
      })) === before.allocations,
  );
  const security = await db.$queryRaw<
    Array<{
      tables: number;
      rls: number;
      anon: number;
      authenticated: number;
      policies: number;
    }>
  >`SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity) rls,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon') anon,(SELECT count(*)::int FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='authenticated') authenticated,(SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND roles && ARRAY['anon','authenticated','public']::name[]) policies`;
  ok(
    "RLS/security",
    security[0]!.tables === security[0]!.rls &&
      security[0]!.anon === 0 &&
      security[0]!.authenticated === 0 &&
      security[0]!.policies === 0,
  );
  await cleanup();
  ok(
    "cleanup",
    (await db.organization.count({
      where: { slug: { startsWith: "stage-9c-1-" } },
    })) === 0,
  );
  const triggers = await db.$queryRaw<
    Array<{ enabled: string }>
  >`SELECT tgenabled::text enabled FROM pg_trigger WHERE tgname='audit_logs_immutable_update'`;
  ok("audit trigger restored", triggers[0]?.enabled === "O");
  console.log(`PASS Stage 9C-1 (${passed} checks)`);
}
main()
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
