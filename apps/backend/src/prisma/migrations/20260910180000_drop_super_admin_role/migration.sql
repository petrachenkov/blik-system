-- Роль «Главный сисадмин» удалена: единый «Сисадмин» (ADMIN) с полным доступом,
-- «Практикант» (INTERN) ограничен, «Преподаватель» (USER) — заявитель.
-- Существующие SUPER_ADMIN уже переведены в ADMIN перед этой миграцией.

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'INTERN', 'USER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
COMMIT;
