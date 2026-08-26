import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import {
  MembershipRole,
  MembershipStatus,
  InventoryTrackingMode,
  PriceType,
  PrismaClient,
  ProductInstanceCondition,
  ProductInstanceOperationalStatus,
  PublicationStatus,
  UserStatus
} from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the database seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

type SeedVariant = {
  size: string;
  sku: string;
  rentalPrice: bigint;
  salePrice: bigint;
  instanceCount: number;
  statuses: Array<ProductInstanceOperationalStatus | "RESERVED">;
};

type SeedProduct = {
  internalCode: string;
  name: string;
  supplierModel: string;
  color: string;
  description: string;
  variants: SeedVariant[];
};

const products: SeedProduct[] = [
  {
    internalCode: "0060",
    name: "Белоснежка",
    supplierModel: "23156",
    color: "Белый",
    description: "Пышное белое платье для аренды и продажи.",
    variants: [
      { size: "110", sku: "0060.110", rentalPrice: BigInt(7000), salePrice: BigInt(80000), instanceCount: 16, statuses: ["AVAILABLE", "AVAILABLE", "RENTED", "RESERVED", "CLEANING", "REPAIR"] },
      { size: "120", sku: "0060.120", rentalPrice: BigInt(7000), salePrice: BigInt(80000), instanceCount: 12, statuses: ["AVAILABLE", "AVAILABLE", "AVAILABLE", "RENTED", "RESERVED"] },
      { size: "130", sku: "0060.130", rentalPrice: BigInt(7000), salePrice: BigInt(80000), instanceCount: 10, statuses: ["AVAILABLE", "AVAILABLE", "AVAILABLE", "AVAILABLE"] },
      { size: "140", sku: "0060.140", rentalPrice: BigInt(7000), salePrice: BigInt(80000), instanceCount: 8, statuses: ["AVAILABLE", "RESERVED"] },
      { size: "150", sku: "0060.150", rentalPrice: BigInt(7000), salePrice: BigInt(80000), instanceCount: 5, statuses: ["AVAILABLE", "AVAILABLE", "REPAIR"] }
    ]
  },
  {
    internalCode: "0142",
    name: "Аврора",
    supplierModel: "8821",
    color: "Розовый",
    description: "Нежно-розовое платье для мероприятий.",
    variants: [
      { size: "110", sku: "0142.110", rentalPrice: BigInt(8000), salePrice: BigInt(90000), instanceCount: 6, statuses: ["AVAILABLE", "AVAILABLE", "RENTED"] },
      { size: "120", sku: "0142.120", rentalPrice: BigInt(8000), salePrice: BigInt(90000), instanceCount: 7, statuses: ["AVAILABLE", "RESERVED"] },
      { size: "130", sku: "0142.130", rentalPrice: BigInt(8000), salePrice: BigInt(90000), instanceCount: 4, statuses: ["AVAILABLE"] }
    ]
  }
];

function normalizeSeedStatus(
  status: ProductInstanceOperationalStatus | "RESERVED" | undefined
): ProductInstanceOperationalStatus {
  // RESERVED is calendar state in the database model. Existing mock records marked
  // RESERVED remain physically AVAILABLE until allocations are seeded in a later stage.
  return status === "RESERVED"
    ? ProductInstanceOperationalStatus.AVAILABLE
    : status ?? ProductInstanceOperationalStatus.AVAILABLE;
}

async function upsertPrice(input: {
  organizationId: string;
  productVariantId: string;
  type: PriceType;
  amountMinor: bigint;
}) {
  const existing = await prisma.productPrice.findFirst({
    where: {
      organizationId: input.organizationId,
      productVariantId: input.productVariantId,
      branchId: null,
      type: input.type,
      validUntil: null
    }
  });

  const data = {
    amountMinor: input.amountMinor,
    currency: "KZT",
    validFrom: new Date("2026-01-01T00:00:00.000Z")
  };

  if (existing) {
    return;
  }

  await prisma.productPrice.create({ data: { ...input, ...data } });
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "mariposa" },
    update: {
      name: "MARIPOSA",
      defaultCurrency: "KZT",
      timezone: "Asia/Almaty",
      defaultLocale: "ru-KZ"
    },
    create: {
      name: "MARIPOSA",
      slug: "mariposa",
      defaultCurrency: "KZT",
      timezone: "Asia/Almaty",
      defaultLocale: "ru-KZ"
    }
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    update: { barcodePrefix: "MAR" },
    create: { organizationId: organization.id, barcodePrefix: "MAR" }
  });

  const branch = await prisma.branch.upsert({
    where: {
      organizationId_code: { organizationId: organization.id, code: "AST" }
    },
    update: {
      name: "MARIPOSA Astana",
      city: "Astana",
      timezone: "Asia/Almaty"
    },
    create: {
      organizationId: organization.id,
      name: "MARIPOSA Astana",
      code: "AST",
      city: "Astana",
      timezone: "Asia/Almaty",
      isPublic: true
    }
  });

  const location = await prisma.location.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "AST-MAIN"
      }
    },
    update: {
      branchId: branch.id,
      name: "Основной шоурум / склад",
      type: "SHOWROOM"
    },
    create: {
      organizationId: organization.id,
      branchId: branch.id,
      name: "Основной шоурум / склад",
      code: "AST-MAIN",
      type: "SHOWROOM"
    }
  });

  const category = await prisma.category.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "detskie-platya"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Детские платья",
      slug: "detskie-platya",
      status: PublicationStatus.ACTIVE
    }
  });

  const sizeIds = new Map<string, string>();
  for (const code of ["110", "120", "130", "140", "150"]) {
    const size = await prisma.size.upsert({
      where: {
        organizationId_code: { organizationId: organization.id, code }
      },
      update: {},
      create: {
        organizationId: organization.id,
        code,
        name: code,
        sizeSystem: "HEIGHT_CM",
        sortOrder: Number(code)
      }
    });
    sizeIds.set(code, size.id);
  }

  for (const productData of products) {
    const product = await prisma.product.upsert({
      where: {
        organizationId_internalCode: {
          organizationId: organization.id,
          internalCode: productData.internalCode
        }
      },
      update: {},
      create: {
        organizationId: organization.id,
        categoryId: category.id,
        internalCode: productData.internalCode,
        name: productData.name,
        supplierModel: productData.supplierModel,
        color: productData.color,
        description: productData.description,
        trackingMode: InventoryTrackingMode.SERIALIZED,
        publicationStatus: PublicationStatus.ACTIVE
      }
    });

    for (const variantData of productData.variants) {
      const sizeId = sizeIds.get(variantData.size);
      if (!sizeId) throw new Error(`Missing seed size ${variantData.size}`);

      const variant = await prisma.productVariant.upsert({
        where: {
          organizationId_sku: {
            organizationId: organization.id,
            sku: variantData.sku
          }
        },
        update: {},
        create: {
          organizationId: organization.id,
          productId: product.id,
          sizeId,
          sku: variantData.sku
        }
      });

      await upsertPrice({
        organizationId: organization.id,
        productVariantId: variant.id,
        type: PriceType.RENTAL,
        amountMinor: variantData.rentalPrice
      });
      await upsertPrice({
        organizationId: organization.id,
        productVariantId: variant.id,
        type: PriceType.SALE,
        amountMinor: variantData.salePrice
      });

      for (let index = 0; index < variantData.instanceCount; index += 1) {
        const suffix = String(index + 1).padStart(3, "0");
        const inventoryNumber = `${variantData.sku}.${suffix}`;
        const operationalStatus = normalizeSeedStatus(variantData.statuses[index]);

        await prisma.productInstance.upsert({
          where: {
            organizationId_inventoryNumber: {
              organizationId: organization.id,
              inventoryNumber
            }
          },
          // Existing physical inventory may already have real operational state.
          // A repeated seed must never move it or reset that state.
          update: {},
          create: {
            organizationId: organization.id,
            productVariantId: variant.id,
            inventoryNumber,
            barcode: inventoryNumber,
            operationalStatus,
            conditionStatus: ProductInstanceCondition.GOOD,
            homeBranchId: branch.id,
            currentBranchId: branch.id,
            currentLocationId: location.id,
            acquiredAt: new Date("2026-01-01T00:00:00.000Z"),
            currency: "KZT"
          }
        });
      }
    }
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const ownerName = process.env.SEED_OWNER_NAME?.trim();
  const ownerValues = [ownerEmail, ownerPassword, ownerName];
  const hasAnyOwnerValue = ownerValues.some(Boolean);
  const hasAllOwnerValues = ownerValues.every(Boolean);

  if (hasAnyOwnerValue && !hasAllOwnerValues) {
    throw new Error(
      "Set SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD and SEED_OWNER_NAME together, or leave all three empty."
    );
  }

  if (hasAllOwnerValues) {
    if (!ownerEmail!.includes("@")) {
      throw new Error("SEED_OWNER_EMAIL must be a valid email address.");
    }
    if (ownerPassword!.length < 12) {
      throw new Error("SEED_OWNER_PASSWORD must contain at least 12 characters.");
    }

    const existingOwner = await prisma.user.findUnique({
      where: { email: ownerEmail! }
    });

    const owner = existingOwner ?? await prisma.user.create({
      data: {
        email: ownerEmail!,
        displayName: ownerName!,
        passwordHash: await hash(ownerPassword!, {
          algorithm: 2,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1
        }),
        status: UserStatus.ACTIVE
      }
    });

    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: owner.id
        }
      },
      update: {
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        defaultBranchId: branch.id
      },
      create: {
        organizationId: organization.id,
        userId: owner.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        defaultBranchId: branch.id,
        joinedAt: new Date()
      }
    });
  } else {
    console.info("Owner seed skipped: SEED_OWNER_* variables are not set.");
  }

  console.info("Seed completed: MARIPOSA tenant, Astana branch, catalog and instances.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
