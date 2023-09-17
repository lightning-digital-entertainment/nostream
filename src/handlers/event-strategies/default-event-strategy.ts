import { createCommandResult, createNoticeMessage } from '../../utils/messages'
import { createLogger } from '../../factories/logger-factory'
import { Event } from '../../@types/event'
import { ICacheAdapter } from '../../@types/adapters'
import { IEventRepository } from '../../@types/repositories'
import { IEventStrategy } from '../../@types/message-handlers'
import { IWebSocketAdapter } from '../../@types/adapters'
import { WebSocketAdapterEvent } from '../../constants/adapter'



const debug = createLogger('default-event-strategy')

export class DefaultEventStrategy implements IEventStrategy<Event, Promise<void>> {
  public constructor(
    private readonly webSocket: IWebSocketAdapter,
    private readonly eventRepository: IEventRepository,
    private readonly cache: ICacheAdapter
  ) { }

  public async execute(event: Event): Promise<void> {
    debug('received event: %o', event)
    const user = await this.cache.getKey('username_' + event.pubkey)

    debug('User from Redis: ', user)
    //only allow if the event is signed by Current User for DVM events
    if (user === null && event.kind > 65000 && event.kind < 66999) {
      
      debug('Not a current user, Not writing to DVM events: %o', event)
      createNoticeMessage('Not a current user, Not writing to DB')
    

    } else {

      const count = await this.eventRepository.create(event)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

      if (count) {
        this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
      }

     
    }
    
  }
}
