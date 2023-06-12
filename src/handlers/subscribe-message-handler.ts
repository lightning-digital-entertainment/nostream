import { anyPass, equals, isNil, map, propSatisfies, uniqWith } from 'ramda'
import { createEvent, isEventMatchingFilter, toNostrEvent } from '../utils/event'
import { EventKinds, EventTags, GroupRoles  } from '../constants/base'
import { IEventRepository, IGroupRepository } from '../@types/repositories'
// import { addAbortSignal } from 'stream'
import { createEndOfStoredEventsNoticeMessage, createNoticeMessage, createOutgoingEventMessage } from '../utils/messages'
import { IAbortable, IMessageHandler } from '../@types/message-handlers'
import { streamEach, streamEnd, streamFilter, streamMap } from '../utils/stream'
import { SubscriptionFilter, SubscriptionId } from '../@types/subscription'
import { createLogger } from '../factories/logger-factory'
import { Event} from '../@types/event'
import { Group } from '../@types/group'
import { IWebSocketAdapter } from '../@types/adapters'
import { pipeline } from 'stream/promises'
import { Settings } from '../@types/settings'
import { SubscribeMessage } from '../@types/messages'
import { WebSocketAdapterEvent } from '../constants/adapter'

const debug = createLogger('subscribe-message-handler')

export class SubscribeMessageHandler implements IMessageHandler, IAbortable {
  //private readonly abortController: AbortController

  public constructor(
    private readonly webSocket: IWebSocketAdapter,
    private readonly eventRepository: IEventRepository,
    private readonly groupRepository: IGroupRepository,
    private readonly settings: () => Settings,
  ) {
    //this.abortController = new AbortController()
  }

  public abort(): void {
    //this.abortController.abort()
  }

  public async handleMessage(message: SubscribeMessage): Promise<void> {
    const subscriptionId = message[1]
    const filters = uniqWith(equals, message.slice(2)) as SubscriptionFilter[]

    const reason = this.canSubscribe(subscriptionId, filters)
    if (reason) {
      debug('subscription %s with %o rejected: %s', subscriptionId, filters, reason)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createNoticeMessage(`Subscription rejected: ${reason}`))
      return
    }

    this.webSocket.emit(WebSocketAdapterEvent.Subscribe, subscriptionId, filters)

    await this.createGroupSubscriptionEvent(subscriptionId,filters)

    await this.fetchAndSend(subscriptionId, filters)
  }

  private async fetchAndSend(subscriptionId: string, filters: SubscriptionFilter[]): Promise<void> {
    debug('fetching events for subscription %s with filters %o', subscriptionId, filters)
    const sendEvent = (event: Event) =>
      this.webSocket.emit(WebSocketAdapterEvent.Message, createOutgoingEventMessage(subscriptionId, event))
    const sendEOSE = () =>
      this.webSocket.emit(WebSocketAdapterEvent.Message, createEndOfStoredEventsNoticeMessage(subscriptionId))
    const isSubscribedToEvent = SubscribeMessageHandler.isClientSubscribedToEvent(filters)

    const findEvents = this.eventRepository.findByFilters(filters).stream()

    // const abortableFindEvents = addAbortSignal(this.abortController.signal, findEvents)

    try {
      await pipeline(
        findEvents,
        streamFilter(propSatisfies(isNil, 'deleted_at')),
        streamMap(toNostrEvent),
        streamFilter(isSubscribedToEvent),
        streamEach(sendEvent),
        streamEnd(sendEOSE),
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        debug('subscription %s aborted: %o', subscriptionId, error)
       findEvents.destroy()
      } else {
        debug('error streaming events: %o', error)
      }
      throw error
    }
  }

  private static isClientSubscribedToEvent(filters: SubscriptionFilter[]): (event: Event) => boolean {
    return anyPass(map(isEventMatchingFilter)(filters))
  }

  private canSubscribe(subscriptionId: SubscriptionId, filters: SubscriptionFilter[]): string | undefined {
    const subscriptions = this.webSocket.getSubscriptions()
    const existingSubscription = subscriptions.get(subscriptionId)
    const subscriptionLimits = this.settings().limits?.client?.subscription

    if (existingSubscription?.length && equals(filters, existingSubscription)) {
        return `Duplicate subscription ${subscriptionId}: Ignorning`
    }

    const maxSubscriptions = subscriptionLimits?.maxSubscriptions ?? 0
    if (maxSubscriptions > 0
      && !existingSubscription?.length && subscriptions.size + 1 > maxSubscriptions
    ) {
      return `Too many subscriptions: Number of subscriptions must be less than or equal to ${maxSubscriptions}`
    }

    const maxFilters = subscriptionLimits?.maxFilters ?? 0
    if (maxFilters > 0) {
      if (filters.length > maxFilters) {
        return `Too many filters: Number of filters per susbscription must be less then or equal to ${maxFilters}`
      }
    }

    if (
      typeof subscriptionLimits.maxSubscriptionIdLength === 'number'
      && subscriptionId.length > subscriptionLimits.maxSubscriptionIdLength
    ) {
      return `Subscription ID too long: Subscription ID must be less or equal to ${subscriptionLimits.maxSubscriptionIdLength}`
    }

  }

  protected async createGroupSubscriptionEvent(subscriptionId: string,filters: SubscriptionFilter[]) {   

    for (const currentFilter of filters) {  


      if (currentFilter.kinds[0] === EventKinds.GROUP_METADATA_SUBSCRIPTION) {

        const ptag = Object.keys(currentFilter).some((key) => key === '#p')

        if (ptag) {
          const { '#p': value } = currentFilter
        

          const groupUsers:Group[] = await this.groupRepository.findByPubkey(value[0])

          const tags = []

          tags.push([EventTags.Deduplication, value[0]])
          tags.push([EventTags.Pubkey, value[0]])

          for (const groupUser of groupUsers) {

              debug('Group user: %o ', groupUser)
               if (groupUser.role1 === GroupRoles.Admin || groupUser.role1 === GroupRoles.User) {
                  tags.push([EventTags.groupChat, groupUser.groupSlug, groupUser.role1])
               }
          }


          if (groupUsers) {

              const event:Partial<Event> = {  

                kind: EventKinds.GROUP_METADATA_SUBSCRIPTION, 
                content: '', 
                tags: tags,
              
              }

              const createSubscribedGroupEvent = await createEvent(event)

              debug ('Group subscription event: %o', createSubscribedGroupEvent)

              this.webSocket.emit(WebSocketAdapterEvent.Message, 
                                          createOutgoingEventMessage(subscriptionId, createSubscribedGroupEvent))


          }

        }
           

      }

    }

  }



  
}
