import dotenv from "dotenv";
import { Prisma, PrismaClient, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

dotenv.config({
  path: new URL("../.env", import.meta.url)
});

const prisma = new PrismaClient();

function toDelegateName(modelName: string) {
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}`;
}

async function resolveSuperAdminUserId() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (!email) {
    throw new Error("Missing SUPERADMIN_EMAIL.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (!existingUser && !password) {
    throw new Error("SUPERADMIN_EMAIL not found. Set SUPERADMIN_PASSWORD to create a new superadmin user.");
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const updateData: Prisma.UserUpdateInput = {
    emailVerifiedAt: new Date(),
    fullName: "Helar Super Admin",
    status: UserStatus.ACTIVE
  };

  if (passwordHash) {
    updateData.passwordHash = passwordHash;
  }

  const createData: Prisma.UserCreateInput = {
    email,
    emailVerifiedAt: new Date(),
    fullName: "Helar Super Admin",
    passwordHash: passwordHash as string,
    status: UserStatus.ACTIVE
  };

  const user = await prisma.user.upsert({
    where: { email },
    update: updateData,
    create: createData,
    select: { id: true }
  });

  return user.id;
}

async function resetDatabaseToSuperAdmin() {
  if (process.env.RESET_DB_CONFIRM?.trim() !== "YES") {
    throw new Error("Refusing to reset database. Set RESET_DB_CONFIRM=YES to proceed.");
  }

  const superAdminUserId = await resolveSuperAdminUserId();

  const superAdminRole = await prisma.role.upsert({
    where: { code: "super_admin" },
    update: { name: "Super Admin" },
    create: { code: "super_admin", name: "Super Admin" },
    select: { id: true }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdminUserId,
        roleId: superAdminRole.id
      }
    },
    update: {},
    create: {
      userId: superAdminUserId,
      roleId: superAdminRole.id
    }
  });

  const protectedModels = new Set([
    "User",
    "Role",
    "Permission",
    "UserRole",
    "RolePermission",
    "SubscriptionPlan",
    "Category"
  ]);

  const prismaDelegates = prisma as unknown as Record<string, { deleteMany: (args?: unknown) => Promise<unknown> }>;
  const models = Prisma.dmmf.datamodel.models.map((model) => model.name);

  for (const modelName of models) {
    if (protectedModels.has(modelName)) {
      continue;
    }

    const delegate = prismaDelegates[toDelegateName(modelName)];
    if (delegate?.deleteMany) {
      await delegate.deleteMany({});
    }
  }

  await prisma.userRole.deleteMany({
    where: {
      userId: { not: superAdminUserId }
    }
  });

  await prisma.user.deleteMany({
    where: {
      id: { not: superAdminUserId }
    }
  });
}

resetDatabaseToSuperAdmin()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
