import {
  DatavaultTablesRepository,
  datavaultTablesRepository,
} from "../repositories/DatavaultTablesRepository";
import { UserRepository, userRepository } from "../repositories/UserRepository";
import { withCurrentTenant } from "../utils/rlsContext";

export class AdminUserService {
  private readonly userRepo: UserRepository;
  private readonly datavaultTablesRepo: DatavaultTablesRepository;

  constructor(
    userRepo?: UserRepository,
    datavaultTablesRepo?: DatavaultTablesRepository
  ) {
    this.userRepo = userRepo ?? userRepository;
    this.datavaultTablesRepo = datavaultTablesRepo ?? datavaultTablesRepository;
  }

  async deleteUser(userId: string): Promise<void> {
    // RLS-7: `users` and `datavault_tables` are both RLS-covered, and this
    // opened a BARE transaction — so under enforcement `findById` saw nothing
    // and every admin user-deletion answered 404 "User not found" for an
    // account that exists. Same-tenant by nature (an admin removing a
    // colleague's account), so the ambient tenant is the right scope; a
    // platform admin deleting into a tenant they are not in is out of scope
    // and fails closed.
    await withCurrentTenant(async (tx) => {
      const user = await this.userRepo.findById(userId, tx);
      if (user === undefined) {
        throw new Error("User not found");
      }

      // Delete personal DataVault tables first to avoid competing cascades:
      // user -> table -> rows (CASCADE) and user -> rows (SET NULL).
      await this.datavaultTablesRepo.deleteOwnedByUser(userId, tx);
      await this.userRepo.deleteUser(userId, tx);
    });
  }
}

export const adminUserService = new AdminUserService();
