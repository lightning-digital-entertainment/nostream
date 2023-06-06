import { PassThrough } from 'stream'

import { DatabaseClient, EventId, Pubkey } from './base'
import { DBEvent, Event } from './event'
import { Group } from './group'
import { Invoice } from './invoice'
import { SubscriptionFilter } from './subscription'
import { User } from './user'

export type ExposedPromiseKeys = 'then' | 'catch' | 'finally'

export interface IQueryResult<T> extends Pick<Promise<T>, keyof Promise<T> & ExposedPromiseKeys> {
  stream(options?: Record<string, any>): PassThrough & AsyncIterable<T>
}

export interface IEventRepository {
  create(event: Event): Promise<number>
  upsert(event: Event): Promise<number>
  findByFilters(filters: SubscriptionFilter[]): IQueryResult<DBEvent[]>
  findByEventId(eventId: string, client?: DatabaseClient): Promise<DBEvent>
  insertStubs(pubkey: string, eventIdsToDelete: EventId[]): Promise<number>
  deleteByPubkeyAndIds(pubkey: Pubkey, ids: EventId[]): Promise<number>
}

export interface IInvoiceRepository {
  findById(id: string, client?: DatabaseClient): Promise<Invoice | undefined>
  upsert(invoice: Partial<Invoice>, client?: DatabaseClient): Promise<number>
  updateStatus(
    invoice: Pick<Invoice, 'id' | 'status'>,
    client?: DatabaseClient,
  ): Promise<Invoice | undefined>
  confirmInvoice(
    invoiceId: string,
    amountReceived: bigint,
    confirmedAt: Date,
    client?: DatabaseClient,
  ): Promise<void>
  findPendingInvoices(
    offset?: number,
    limit?: number,
    client?: DatabaseClient,
  ): Promise<Invoice[]>
}

export interface IUserRepository {
  findByPubkey(pubkey: Pubkey, client?: DatabaseClient): Promise<User | undefined>
  upsert(user: Partial<User>, client?: DatabaseClient): Promise<number>
  getBalanceByPubkey(pubkey: Pubkey, client?: DatabaseClient): Promise<bigint>
}

export interface IGroupRepository {
  findByPubkey(pubkey: Pubkey, client?: DatabaseClient): Promise<Group | undefined>
  findByGroupTag(groupTag: string, client?: DatabaseClient): Promise<Group[] | undefined>
  findByPubkeyAndGroupTag(groupTag: string, pubkkey: Pubkey, client?: DatabaseClient): Promise<Group | undefined>
  upsert(group: Partial<Group>, client?: DatabaseClient): Promise<number>
  
}