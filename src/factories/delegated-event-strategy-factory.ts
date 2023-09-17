
import { isDeleteEvent, isEphemeralEvent, isReplaceableEvent } from '../utils/event'
import { DefaultEventStrategy } from '../handlers/event-strategies/default-event-strategy'
import { EphemeralEventStrategy } from '../handlers/event-strategies/ephemeral-event-strategy'
import { Event } from '../@types/event'
import { Factory } from '../@types/base'
import { getCacheClient } from '../cache/client'
import { IEventRepository } from '../@types/repositories'
import { IEventStrategy } from '../@types/message-handlers'
import { IWebSocketAdapter } from '../@types/adapters'
import { RedisAdapter } from '../adapters/redis-adapter'

export const delegatedEventStrategyFactory = (
  eventRepository: IEventRepository,
): Factory<IEventStrategy<Event, Promise<void>>, [Event, IWebSocketAdapter]> =>
  ([event, adapter]: [Event, IWebSocketAdapter]) => {
    if (isEphemeralEvent(event)) {
      return new EphemeralEventStrategy(adapter)
    } else if (isReplaceableEvent(event) || isDeleteEvent(event)) {
      return
    }
    const cache = new RedisAdapter(getCacheClient())   
    return new DefaultEventStrategy(adapter, eventRepository, cache)
  }
