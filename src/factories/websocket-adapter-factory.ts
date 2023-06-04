import { IEventRepository, IGroupRepository, IUserRepository } from '../@types/repositories'
import { createSettings } from './settings-factory'
import { IncomingMessage } from 'http'
import { IWebSocketServerAdapter } from '../@types/adapters'
import { messageHandlerFactory } from './message-handler-factory'
import { slidingWindowRateLimiterFactory } from './rate-limiter-factory'
import { WebSocket } from 'ws'
import { WebSocketAdapter } from '../adapters/web-socket-adapter'




export const webSocketAdapterFactory = (
  eventRepository: IEventRepository,
  userRepository: IUserRepository,
  groupRepository: IGroupRepository
) => ([client, request, webSocketServerAdapter]: [WebSocket, IncomingMessage, IWebSocketServerAdapter]) =>
    new WebSocketAdapter(
      client,
      request,
      webSocketServerAdapter,
      messageHandlerFactory(eventRepository, userRepository, groupRepository),
      slidingWindowRateLimiterFactory,
      createSettings,
    )
