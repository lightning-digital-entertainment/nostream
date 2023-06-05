import { Pubkey } from './base'

export interface Group {
  groupTag: string  
  pubkey: Pubkey
  role1: string
  createdAt: Date
  updatedAt: Date
}

export interface DBGroup {
  group_tag: string  
  pubkey: Buffer
  role_1: string
  created_at: Date
  updated_at: Date
}
