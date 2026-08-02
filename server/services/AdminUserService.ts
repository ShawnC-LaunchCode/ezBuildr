import {
  DatavaultTablesRepository,
  datavaultTablesRepository,
} from "../repositories/DatavaultTablesRepository";
import { UserRepository, userRepository } from "../repositories/UserRepository";

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
    await this.userRepo.transaction(async (tx) => {
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
