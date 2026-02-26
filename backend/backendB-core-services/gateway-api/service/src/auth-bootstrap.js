import { envValue } from "./helpers.js";
import { hashPassword } from "@maple/security";
export async function bootstrapAuthUsers(database) {
    await database.purgeExpiredSessions();
    const existingUsers = await database.countUsers();
    const adminUsername = envValue(process.env.MAPLE_ADMIN_USERNAME) ?? "";
    const adminPassword = envValue(process.env.MAPLE_ADMIN_PASSWORD) ?? "";
    const adminEmail = envValue(process.env.MAPLE_ADMIN_EMAIL);
    if (adminUsername && adminPassword) {
        const syncedUser = await database.syncUserPasswordByUsername({
            username: adminUsername,
            email: adminEmail,
            passwordHash: hashPassword(adminPassword),
        });
        const action = existingUsers > 0 ? "Synced" : "Bootstrapped";
        console.log(`[AUTH] ${action} admin user "${syncedUser.username}" from MAPLE_ADMIN_* env.`);
        return;
    }
    if (existingUsers > 0) {
        return;
    }
    if (!adminUsername || !adminPassword) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("No users found. Set MAPLE_ADMIN_USERNAME and MAPLE_ADMIN_PASSWORD for production startup.");
        }
        const devUser = envValue(process.env.MAPLE_DEV_USERNAME) || "admin";
        const devPass = envValue(process.env.MAPLE_DEV_PASSWORD) || "maple-demo-password";
        await database.createUser({
            username: devUser,
            email: envValue(process.env.MAPLE_DEV_EMAIL) || "admin@local.maple",
            passwordHash: hashPassword(devPass),
        });
        console.log(`[AUTH] Bootstrapped local dev user "${devUser}" with MAPLE_DEV_PASSWORD/default.`);
        return;
    }
}
//# sourceMappingURL=auth-bootstrap.js.map