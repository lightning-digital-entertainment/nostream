import { always, applySpec, omit, pipe, prop } from 'ramda'

import { DatabaseClient, Pubkey } from '../@types/base'
import { DBGroup, Group } from '../@types/group'
import { fromDBGroup, toBuffer } from '../utils/transform'
import { createLogger } from '../factories/logger-factory'
import { IGroupRepository } from '../@types/repositories'



const debug = createLogger('group-repository')

export class GroupRepository implements IGroupRepository {
  public constructor(private readonly dbClient: DatabaseClient) { }

  public async findByPubkey(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<Group | undefined> {
    debug('find by pubkey: %s', pubkey)
    const [dbgroup] = await client<DBGroup>('groups')
      .where('pubkey', toBuffer(pubkey))
      .select()

    if (!dbgroup) {
      return
    }

    return fromDBGroup(dbgroup)
  }

  public async findByGroupTag(
    groupTag: string,
    client: DatabaseClient = this.dbClient
  ): Promise<Group[] | undefined> {
    debug('find by groupTag: %s', groupTag)
    const dbgroupUsers = await client<DBGroup>('groups')
      .where('group_tag', groupTag)
      .select()

    if (!dbgroupUsers) {
      return
    }

    return dbgroupUsers.map(fromDBGroup) 
  }

  public async findByPubkeyAndGroupTag(
    groupTag: string,
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<Group | undefined> {
    debug('find by groupTag & Pubkey: %s %o', groupTag, pubkey)
    const [dbgroup] = await client<DBGroup>('groups')
      .where('group_tag', groupTag)
      .andWhere('pubkey', toBuffer(pubkey))
      .select()

    if (!dbgroup) {
      return
    }

    return fromDBGroup(dbgroup)
  }

  public async upsert(
    group: Group,
    client: DatabaseClient = this.dbClient,
  ): Promise<number> {
    debug('upsert: %o', group)

    const date = new Date()

    const row = applySpec<DBGroup>({
      group_tag: prop('groupTag'),
      pubkey: pipe(prop('pubkey'), toBuffer),
      role_1: prop('role1'),
      updated_at: always(date),
      created_at: always(date),
    })(group)

    const query = client<DBGroup>('groups')
      .insert(row)
      .onConflict(['pubkey', 'group_tag'])
      .merge(
        omit([
          'pubkey',
          'group_tag',
          'created_at',
        ])(row)
      )

    return {
      then: <T1, T2>(onfulfilled: (value: number) => T1 | PromiseLike<T1>, onrejected: (reason: any) => T2 | PromiseLike<T2>) => query.then(prop('rowCount') as () => number).then(onfulfilled, onrejected),
      catch: <T>(onrejected: (reason: any) => T | PromiseLike<T>) => query.catch(onrejected),
      toString: (): string => query.toString(),
    } as Promise<number>
  }

  
}