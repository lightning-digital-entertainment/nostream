
import { EventTags, GroupRoles } from '../../constants/base'
import { IEventRepository, IGroupRepository } from '../../@types/repositories'
import { createCommandResult } from '../../utils/messages'
import { createLogger } from '../../factories/logger-factory'
import { DatabaseClient } from '../../@types/base'
import { Event } from '../../@types/event'
import { IEventStrategy } from '../../@types/message-handlers'
import { IWebSocketAdapter } from '../../@types/adapters'
import { WebSocketAdapterEvent } from '../../constants/adapter'










const debug = createLogger('group-message-event-strategy')
const specialChars = /[!@#$%^&*()_+=[\]{};':"\\|,.<>?]+/

export class GroupMessageEventStrategy implements IEventStrategy<Event, Promise<void>> {
  public constructor(
    private readonly webSocket: IWebSocketAdapter,
    private readonly eventRepository: IEventRepository,
    private readonly groupRepository: IGroupRepository,
    private readonly dbClient: DatabaseClient,

  ) { }

  public async execute(event: Event): Promise<void> {
    debug('received event: %o', event)

    const [, ...groupSlug] = event.tags.find((tag) => tag.length >= 2 && tag[0] === EventTags.groupChat) ?? [null, '']

    const groupSlugn = groupSlug[0].split('/')

    if (  specialChars.test(groupSlug[0]) || !groupSlugn[1]) {

      this.webSocket.emit(
        WebSocketAdapterEvent.Message,
        createCommandResult(event.id, false, 'Error: Incorrect Group Slug or cannnot contain special Chars. '),
      )
      return


    }

    if (groupSlug.length === 0) {
        this.webSocket.emit(
            WebSocketAdapterEvent.Message,
            createCommandResult(event.id, false, 'Error: No Group Slug found'),
          )
          return

    }

    const eventUser = await this.groupRepository.findByPubkeyAndgroupSlug('/'+groupSlug[0].split('/')[1], event.pubkey)
    debug('find user in DB: %o', eventUser)

    if (!eventUser) {
        this.webSocket.emit(
            WebSocketAdapterEvent.Message,
            createCommandResult(event.id, false, 'Error: User not authorized to post messages'),
          )
          return

    } else if (eventUser.role1 != GroupRoles.Admin && eventUser.role1 != GroupRoles.User) {
        this.webSocket.emit(
            WebSocketAdapterEvent.Message,
            createCommandResult(event.id, false, 'Error: User not authorized to post messages'),
          )
          return

    }
    
    const count = await this.eventRepository.create(event)
    this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

    if (count) {
      this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
    }
  }
}
