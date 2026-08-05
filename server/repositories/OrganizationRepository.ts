import { organizations, type InsertOrganization, type Organization } from '@shared/schema';

import { db } from '../db';

import { BaseRepository } from './BaseRepository';

export class OrganizationRepository extends BaseRepository<
  typeof organizations,
  Organization,
  InsertOrganization
> {
  constructor(dbInstance?: typeof db) {
    super(organizations, dbInstance);
  }
}

export const organizationRepository = new OrganizationRepository();
