import { ICacheAdapter, IWebSocketAdapter } from '../../@types/adapters'
import { IEventRepository, IGroupRepository, IUserRepository } from '../../@types/repositories'
import { createCommandResult } from '../../utils/messages'
import { createLogger } from '../../factories/logger-factory'
import { Event } from '../../@types/event'
import { EventTags } from '../../constants/base'
import { IEventStrategy } from '../../@types/message-handlers'
import { WebSocketAdapterEvent } from '../../constants/adapter'




const debug = createLogger('group-metadata-update-event-strategy')

export class GroupMetadataUpdateEventStrategy implements IEventStrategy<Event, Promise<void>> {
    public constructor(
        private readonly webSocket: IWebSocketAdapter,
        private readonly eventRepository: IEventRepository,
        private readonly groupRepository: IGroupRepository,
        private readonly userRepository: IUserRepository,
        private readonly cache: ICacheAdapter
      ) { }
    
    public async execute(event: Event): Promise<void> {
    debug('received group metadata update event: %o', event)
    const [, ...groupName] = event.tags.find((tag) => tag.length >= 2 && tag[0] === EventTags.groupChat) ?? [null, '']

    debug('Group Name: %o', groupName)
    if (groupName[0] === '/flavors') debug('inside group name is flavors: %o', groupName[0])

    const groupRecord = await this.groupRepository.findByGroupName(groupName[0])

    if (groupRecord) debug('group record is: %o', groupRecord)

    const groupId = await this.cache.getKey(groupName[0])

    if (!groupId) {

            //Check to see if the user has balance to create a group
            const balance = await this.userRepository.getBalanceByPubkey(event.pubkey)
            debug('User Balance: %o', balance)
            
            

    }

    const count = await this.eventRepository.create(event)
    this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

    if (count) {
      this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
    }
  }
}



  