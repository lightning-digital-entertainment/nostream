import { EventTags, GroupRoles } from '../../constants/base'
import { ICacheAdapter, IWebSocketAdapter } from '../../@types/adapters'
import { IEventRepository, IGroupRepository, IUserRepository } from '../../@types/repositories'
import { createCommandResult } from '../../utils/messages'
import { createEvent } from '../../utils/event' 
import { createLogger } from '../../factories/logger-factory'
import { DatabaseClient } from '../../@types/base'
import { Event } from '../../@types/event'
import { IEventStrategy } from '../../@types/message-handlers'
import { Settings } from '../../@types/settings'
import { Transaction } from '../../database/transaction'
import { WebSocketAdapterEvent } from '../../constants/adapter'





const debug = createLogger('group-metadata-update-event-strategy')

export class GroupMetadataUpdateEventStrategy implements IEventStrategy<Event, Promise<void>> {
    public constructor(
        private readonly webSocket: IWebSocketAdapter,
        private readonly eventRepository: IEventRepository,
        private readonly groupRepository: IGroupRepository,
        private readonly userRepository: IUserRepository,
        private readonly cache: ICacheAdapter,
        private readonly dbClient: DatabaseClient,
        private readonly settings: () => Settings
      ) { }
    
    public async execute(event: Event): Promise<void> {
    debug('received group metadata update event: %o', event)

    const [, ...groupTag] = event.tags.find((tag) => tag.length >= 2 && tag[0] === EventTags.groupChat) ?? [null, '']
    const [, ...groupName] = event.tags.find((tag) => tag.length >= 2 && tag[0] === 'name') ?? [null, '']
    const [, ...groupPicture] = event.tags.find((tag) => tag.length >= 2 && tag[0] === 'picture') ?? [null, '']
     
    debug('Group Slash: %o', groupTag?groupTag[0]:'')
    if (groupTag && groupTag[0] === '/flavors') debug('inside group name is flavors: %o', groupTag[0])
    const transaction = new Transaction(this.dbClient)
    const groupRecord = await this.groupRepository.findByGroupTag(groupTag[0])

    if (groupRecord) debug('group record is: %o', groupRecord)

    const groupId = await this.cache.getKey(groupTag?groupTag[0]:'')

    //Create a new group
    if (!groupId) {

            //Check to see if the user has balance to create a group
            let userBalance = await this.userRepository.getBalanceByPubkey(event.pubkey)
            debug('User Balance: %o', userBalance)

            if (userBalance > 0) userBalance = userBalance - BigInt(1)

            const date = new Date()

            await transaction.begin()

            await this.userRepository.upsert(
              {
                pubkey: event.pubkey,
                balance: userBalance,
                updatedAt: date,
              },
              transaction.transaction,
            )

            await this.groupRepository.upsert(
              {
                groupTag: groupTag[0],
                pubkey: event.pubkey,
                role1: GroupRoles.Admin,

              },
              transaction.transaction,


            )

            await transaction.commit()

            debug('User Balance updated: %o', userBalance)

            const create39000Event = await createEvent({  
              
              kind: 39000, 
              content: event.content, 
              tags: [
                ['d', groupTag[0]],
                ['name', groupName?groupName[0]:''],
                ['picture', groupPicture?groupPicture[0]:''],
              ],
            
            })

            let response = await this.eventRepository.upsert(create39000Event)
            debug('count for 39000 event is: %o ', response)
            this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(create39000Event.id, true, (response) ? '' : 'duplicate:'))
            this.webSocket.emit(WebSocketAdapterEvent.Broadcast, create39000Event)

            const create39001Event = await createEvent({  
              
              kind: 39001, 
              content: event.content, 
              tags: [
                ['d', groupTag[0]],
                ['p', event.pubkey, GroupRoles.Admin],
                
              ],
            
            })


            response = await this.eventRepository.upsert(create39001Event)
            debug('count for 39001 event is: %o ', response)
            this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(create39001Event.id, true, (response) ? '' : 'duplicate:'))
            this.webSocket.emit(WebSocketAdapterEvent.Broadcast, create39001Event)

            await this.cache.setKey(groupTag[0],create39001Event.id)


    } else {

          debug('Group tag exists %o', groupTag[0])

          const findEvents = await this.eventRepository.findByEventId(groupId)
          debug('find events results2: %o', findEvents)

          const findUser = await this.groupRepository.findByPubkeyAndGroupTag(groupTag[0], event.pubkey)
          debug('find user in DB: %o', findUser)




    }

    const count = await this.eventRepository.create(event)
    this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

    if (count) {
      this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
    }
  }
}



  