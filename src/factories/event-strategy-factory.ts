import { IEventRepository, IGroupRepository } from '../@types/repositories'
import { isDeleteEvent, isEphemeralEvent, isGroupMessage, isGroupMetadataUpdate, isParameterizedReplaceableEvent, isReplaceableEvent } from '../utils/event'
import { createSettings } from './settings-factory'
import { DefaultEventStrategy } from '../handlers/event-strategies/default-event-strategy'
import { DeleteEventStrategy } from '../handlers/event-strategies/delete-event-strategy'
import { EphemeralEventStrategy } from '../handlers/event-strategies/ephemeral-event-strategy'
import { Event } from '../@types/event'
import { Factory } from '../@types/base'
import { getCacheClient } from '../cache/client'
import { getMasterDbClient } from '../database/client'
import { GroupMessageEventStrategy } from '../handlers/event-strategies/group-message-event-strategy'
import { GroupMetadataUpdateEventStrategy } from '../handlers/event-strategies/group-metadata-update-event-strategy'
import { IEventStrategy } from '../@types/message-handlers'
import { IWebSocketAdapter } from '../@types/adapters'
import { ParameterizedReplaceableEventStrategy } from '../handlers/event-strategies/parameterized-replaceable-event-strategy'
import { RedisAdapter } from '../adapters/redis-adapter'
import { ReplaceableEventStrategy } from '../handlers/event-strategies/replaceable-event-strategy'
import { UserRepository } from '../repositories/user-repository'


export const eventStrategyFactory = (
  eventRepository: IEventRepository, groupRepository: IGroupRepository
): Factory<IEventStrategy<Event, Promise<void>>, [Event, IWebSocketAdapter]> =>
([event, adapter]: [Event, IWebSocketAdapter]) => {
  const dbClient = getMasterDbClient()
  const userRepository = new UserRepository(dbClient)  
  const cache = new RedisAdapter(getCacheClient()) 
   
  if (isReplaceableEvent(event)) {
    return new ReplaceableEventStrategy(adapter, eventRepository)
  } else if (isEphemeralEvent(event)) {
    return new EphemeralEventStrategy(adapter)
  } else if (isDeleteEvent(event)) {
    return new DeleteEventStrategy(adapter, eventRepository)
  } else if (isParameterizedReplaceableEvent(event)) {
    return new ParameterizedReplaceableEventStrategy(adapter, eventRepository)
  } else if (isGroupMetadataUpdate(event)) {
    return new GroupMetadataUpdateEventStrategy(adapter, eventRepository, 
                      groupRepository, userRepository, cache, dbClient, createSettings)
  } else if (isGroupMessage(event)) {
    return new GroupMessageEventStrategy(adapter, eventRepository, 
      groupRepository, dbClient)
  }

  return new DefaultEventStrategy(adapter, eventRepository)
}
  
