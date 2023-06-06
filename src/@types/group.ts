import { Pubkey } from './base'

export interface Group {
  groupSlug: string  
  pubkey: Pubkey
  role1: string
  createdAt: Date
  updatedAt: Date
}

export interface DBGroup {
  group_slug: string  
  pubkey: Buffer
  role_1: string
  created_at: Date
  updated_at: Date
}
