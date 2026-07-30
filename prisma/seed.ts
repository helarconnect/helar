import dotenv from "dotenv";
import { PrismaClient, SubscriptionInterval, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

dotenv.config({
  path: new URL("../.env", import.meta.url)
});

const prisma = new PrismaClient();

const roles = [
  ["super_admin", "Super Admin"],
  ["judge", "Judge"],
  ["administrator", "Administrator"],
  ["academic_administrator", "Academic Administrator"],
  ["tutor", "Tutor"],
  ["student", "Student"],
  ["moderator", "Moderator"],
  ["support_staff", "Support Staff"],
  ["finance_officer", "Finance Officer"]
] as const;

const permissions = [
  ["platform.manage", "Manage platform settings"],
  ["users.manage", "Manage users and RBAC"],
  ["courses.manage", "Manage courses and lessons"],
  ["library.manage", "Manage study materials"],
  ["assignments.grade", "Grade assignments"],
  ["exams.manage", "Create and publish CBT exams"],
  ["community.moderate", "Moderate discussions"],
  ["billing.manage", "Manage subscriptions and payments"],
  ["analytics.view", "View admin analytics"]
] as const;

const plans = [
  ["trial", "Free Trial", SubscriptionInterval.TRIAL, 0, "NGN"],
  ["monthly", "Monthly Subscription", SubscriptionInterval.MONTHLY, 200_000, "NGN"],
  ["six_months", "6 Months Subscription", SubscriptionInterval.MONTHLY, 1_100_000, "NGN"],
  ["quarterly", "Quarterly", SubscriptionInterval.QUARTERLY, 0, "NGN"],
  ["annual", "One Year Subscription", SubscriptionInterval.ANNUAL, 2_200_000, "NGN"],
  ["enterprise", "Enterprise", SubscriptionInterval.ENTERPRISE, 0, "NGN"]
] as const;

async function main() {
  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name }
    });
  }

  for (const [code, name] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name }
    });
  }

  for (const [code, name, interval, priceMinor, currency] of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { code },
      update: { currency, deletedAt: null, name, interval, priceMinor },
      create: { code, currency, deletedAt: null, name, interval, priceMinor }
    });
  }

  const adminPasswordHash = await bcrypt.hash("HelarAdmin123!", 10);
  const primarySuperAdminPasswordHash = await bcrypt.hash("Helar10@", 10);
  const studentPasswordHash = await bcrypt.hash("Helar123!", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@helar.test" },
    update: {
      fullName: "Helar Super Admin",
      passwordHash: adminPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    },
    create: {
      email: "admin@helar.test",
      fullName: "Helar Super Admin",
      passwordHash: adminPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    }
  });

  const primarySuperAdminUser = await prisma.user.upsert({
    where: { email: "helarconnect@gmail.com" },
    update: {
      fullName: "Helar Super Admin",
      passwordHash: primarySuperAdminPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    },
    create: {
      email: "helarconnect@gmail.com",
      fullName: "Helar Super Admin",
      passwordHash: primarySuperAdminPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    }
  });

  const studentUser = await prisma.user.upsert({
    where: { email: "student@helar.test" },
    update: {
      fullName: "Adaeze Okonkwo",
      passwordHash: studentPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    },
    create: {
      email: "student@helar.test",
      fullName: "Adaeze Okonkwo",
      passwordHash: studentPasswordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      city: "Lagos",
      country: "Nigeria",
      state: "Lagos"
    }
  });

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { code: "super_admin" }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: superAdminRole.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: superAdminRole.id
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: primarySuperAdminUser.id,
        roleId: superAdminRole.id
      }
    },
    update: {},
    create: {
      userId: primarySuperAdminUser.id,
      roleId: superAdminRole.id
    }
  });

  const studentRole = await prisma.role.findUniqueOrThrow({
    where: { code: "student" }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: studentUser.id,
        roleId: studentRole.id
      }
    },
    update: {},
    create: {
      userId: studentUser.id,
      roleId: studentRole.id
    }
  });

  await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
