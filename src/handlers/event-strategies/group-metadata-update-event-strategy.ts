import { EventAction, EventTags, GroupRoles } from '../../constants/base'
import { ICacheAdapter, IWebSocketAdapter } from '../../@types/adapters'
import { IEventRepository, IGroupRepository, IUserRepository } from '../../@types/repositories'
import { createCommandResult } from '../../utils/messages'
import { createEvent } from '../../utils/event' 
import { createLogger } from '../../factories/logger-factory'
import { DatabaseClient } from '../../@types/base'
import { Event } from '../../@types/event'
import { Group } from '../../@types/group'
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
    const [, ...groupName] = event.tags.find((tag) => tag.length >= 2 && tag[1] === 'name') ?? [null, '']
    const [, ...groupPicture] = event.tags.find((tag) => tag.length >= 2 && tag[1] === 'picture') ?? [null, '']
    
    const groupAdd = event.tags.filter((tag) => tag.length >= 2  && tag[0] === 'action' && 
                              tag[1] === EventAction.Add && 
                              (tag[3] === (GroupRoles.Admin) ||  tag[3] === (GroupRoles.User))) 
     
                              
    const groupRemove = event.tags.filter((tag) => tag.length >= 2  && tag[0] === 'action' &&
                               tag[1] === EventAction.Remove)
                              
    debug('Group Info: %o, %s, %e', groupTag?groupTag[0]:'', groupName, groupPicture)
    debug('Group add: %o ', groupAdd?groupAdd:'' )
    debug('Group remove: %o ', groupRemove?groupRemove:'' )

    let groupId = await this.cache.getKey(groupTag?groupTag[0]:'')

    if (!groupId) groupId = await this.createGroup(event)

    if (groupId.startsWith('Error:'))   {
      this.webSocket.emit(
        WebSocketAdapterEvent.Message,
        createCommandResult(event.id, false, groupId),
      )
      return
    }       
           
    //const findEvents = await this.eventRepository.findByEventId(groupId)
    //debug('find events results: %o', findEvents)

    const eventUser = await this.groupRepository.findByPubkeyAndGroupTag(groupTag[0], event.pubkey)
    debug('find user in DB: %o', eventUser)

    try {

      let updateResult=true
      if (groupAdd.length > 0) updateResult = await this.upsertUserToGroup(eventUser, event, groupAdd, groupTag[0])

      if (!updateResult) {
        this.webSocket.emit(
          WebSocketAdapterEvent.Message,
          createCommandResult(event.id, false, 'Error: When updating group metadata to add user'),
        )
        return

      }

      if (groupRemove.length > 0) updateResult = await this.upsertUserToGroup(eventUser,event, groupRemove, groupTag[0])

      if (!updateResult) {
        this.webSocket.emit(
          WebSocketAdapterEvent.Message,
          createCommandResult(event.id, false, 'Error: When updating group metadata to remove user'),
        )
        return

      }
    
      const count = await this.eventRepository.create(event)
      this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(event.id, true, (count) ? '' : 'duplicate:'))

      if (count) {
        this.webSocket.emit(WebSocketAdapterEvent.Broadcast, event)
      }

    }
    catch (e) {
      debug('in catch with error: %o', e)
      this.webSocket.emit(
        WebSocketAdapterEvent.Message,
        createCommandResult(event.id, false, 'Error: When updating group metadata. Admin priviledges required'),
      )
      return

    }  

  }

  protected async createGroup(event: Event): Promise<string> {
      const date: Date = new Date() 
      const transaction = new Transaction(this.dbClient)
      const [, ...groupTag] = event.tags.find((tag) => tag.length >= 2 && tag[0] === EventTags.groupChat) ?? [null, '']
      const [, ...groupName] = event.tags.find((tag) => tag.length >= 2 && tag[2] === 'name') ?? [null, '']
      const [, ...groupPicture] = event.tags.find((tag) => tag.length >= 2 && tag[2] === 'picture') ?? [null, '']

      //Check to see if user has balance
      let userBalance = await this.userRepository.getBalanceByPubkey(event.pubkey)
      debug('User Balance: %o', userBalance)

      if (userBalance && userBalance > 0) {
        userBalance = userBalance - BigInt(1)
      } else {
          return 'Error: User does not have enough sats balance to create Group. Please visit https://spool.chat'
      }

      await transaction.begin()

      await this.userRepository.upsert(
        {
          pubkey: event.pubkey,
          balance: userBalance,
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

    await this.createAndSendEvent({ 
      
      kind: 39000, 
      content: event.content, 
      tags: [
        [EventTags.Deduplication, groupTag[0]],
        ['name', groupName?groupName[0]:''],
        ['picture', groupPicture?groupPicture[0]:''],
      ],
    
    })

    const eventId = await this.createAndSendEvent({ 
      
      kind: 39001, 
      content: event.content, 
      tags: [
        [EventTags.Deduplication, groupTag[0]],
        [EventTags.Pubkey, event.pubkey, GroupRoles.Admin],
        
      ],
    
    })

    
    await this.createAndSendEvent({  
      
      kind: 9, 
      content: 'This simple chat group ' + groupTag[0] + ' was created by #[0] on ' + date, 
      tags: [
        [EventTags.groupChat, groupTag[0]],
        [EventTags.Pubkey, event.pubkey, GroupRoles.Admin],
        
      ],
    
    })

    await this.cache.setKey(groupTag[0],eventId)

    return eventId
  }

  protected async createAndSendEvent(event: Partial<Event>): Promise<string> {

    const createSendEvent = await createEvent(event)
    const response = await this.eventRepository.upsert(createSendEvent)
    debug('Create event is: %o ', response)
    this.webSocket.emit(WebSocketAdapterEvent.Message, createCommandResult(createSendEvent.id, true, (response) ? '' : 'duplicate:'))
    this.webSocket.emit(WebSocketAdapterEvent.Broadcast, createSendEvent)

    return createSendEvent.id
  }

  protected async upsertUserToGroup(eventUser: Group, event: Event, groupUpdate:any[], 
                                                                groupTag: string): Promise<boolean> {
    const date: Date = new Date() 
    const transaction = new Transaction(this.dbClient)

    let noUpdate = true

    for (const upuser of groupUpdate) {
        const pubkey = upuser[2]

        debug('going to update user %o', pubkey)

        const findUser = await this.groupRepository.findByPubkeyAndGroupTag(groupTag, pubkey)

        let role=''
        let content=''
        if (pubkey === event.pubkey && upuser[1] === EventAction.Add) {
          role = GroupRoles.User
          content = 'User #[0] joined on ' + date 
        } else if (pubkey != event.pubkey && upuser[1] === EventAction.Add && 
                                            eventUser.role1 === GroupRoles.Admin) {
          content = 'User #[0] added on ' + date     
          role = upuser[3]
        }

        if (pubkey === event.pubkey && upuser[1] === EventAction.Remove) {
          role = GroupRoles.Removed
          content = 'User #[0] left on ' + date     
        } else if (pubkey != event.pubkey && upuser[1] === EventAction.Remove && 
                                            eventUser.role1 === GroupRoles.Admin) {
          role = GroupRoles.Banned
          content = 'User #[0] removed on ' + date     
        } 

        if (role === '') return false
        if (findUser && pubkey === event.pubkey && upuser[1] === EventAction.Add && 
                                            findUser.role1 === GroupRoles.Banned) return false

        if (!findUser || findUser.role1 != role) {

          await transaction.begin()
    
          await this.groupRepository.upsert(
            {
              groupTag: groupTag,
              pubkey: pubkey,
              role1: role,
    
            },
            transaction.transaction,
    
    
          )
    
          await transaction.commit()
  
          noUpdate=false

          await this.createAndSendEvent({  
      
            kind: 9, 
            content: content, 
            tags: [
              [EventTags.groupChat, groupTag[0]],
              [EventTags.Pubkey, pubkey, role],
              
            ],
          
          })
        }


    }

    if (noUpdate) return false

    const groupUsers:Group[] = await this.groupRepository.findByGroupTag(groupTag)

    const tags = []

    tags.push([EventTags.Deduplication, groupTag])

    for (const groupUser of groupUsers) {

        debug('Group user: %o ', groupUser)
        if (groupUser.role1 === GroupRoles.Admin || groupUser.role1 === GroupRoles.User) {
                  tags.push([EventTags.Pubkey, groupUser.pubkey, groupUser.role1])
        }
    }


    const eventId = await this.createAndSendEvent({ 
      
      kind: 39001, 
      content: event.id, 
      tags: tags,
    
    })

    if (eventId) return true

    return false
  }
}



  