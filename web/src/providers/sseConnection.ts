import { postAPI } from '@/lib/api'
import {
  getLastSeq,
  progressSnapshotCache,
  resetLastSeq,
  setLastSeq,
} from '@/lib/webCache'
import type {
  ProgressEvent,
  SessionEvent,
  WSClientMessage,
  WSMessage,
} from '@/types/shared'
import type { WSConnection } from '@/types/ws'

const STATUS_POLL_MS = 5_000
const REPLAY_GRACE_MS = 1_000
const SEND_RETRY_DELAYS_MS = [1_000, 2_000]

export const SSE_EVENT_TYPES = [
  'text',
  'progress_structured',
  'stream_content',
  'ask_user',
  'card',
  'user_echo',
  'inject_user',
  'plugin_widgets',
  'session',
  'runner_status',
  'sync_progress',
] as const

type Handler<T> = (payload: T) => void

/** One native EventSource for the active chat plus REST for client-to-server calls. */
export class SSEConnectionImpl implements WSConnection {
  private source: EventSource | null = null
  private _connected = false
  private _chatID: string | null = null
  private _channel = 'web'
  private disposed = false
  private reconnecting = false
  private eventsSinceOpen = 0
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private replayTimer: ReturnType<typeof setTimeout> | null = null
  private stateVersion = 0

  private messageHandlers = new Set<Handler<WSMessage>>()
  private sessionHandlers = new Set<Handler<SessionEvent>>()
  private progressHandlers = new Set<Handler<ProgressEvent>>()
  private connHandlers = new Set<Handler<boolean>>()

  get connected(): boolean {
    return this._connected
  }

  get chatID(): string | null {
    return this._chatID
  }

  get channel(): string | null {
    return this._chatID ? this._channel : null
  }

  setLastSeq(chatID: string, seq: number): void {
    if (chatID && seq > 0) setLastSeq(chatID, seq)
  }

  async send(msg: WSClientMessage): Promise<void> {
    switch (msg.type) {
      case 'message':
        await this.sendMessageWithRetry(msg)
        return
      case 'cancel':
        await postAPI('/api/cancel', sessionBody(msg))
        return
      case 'ask_user_response':
        await postAPI('/api/ask_user/respond', {
          ...sessionBody(msg),
          answers: msg.answers,
          cancelled: msg.cancelled,
        })
        return
      default:
        throw new Error(`unsupported REST message type: ${msg.type}`)
    }
  }

  subscribe(chatID: string, channel = 'web'): void {
    if (this.disposed) return
    if (this._chatID === chatID && this._channel === channel && this.source) return
    this.disconnect()
    this._chatID = chatID
    this._channel = channel
    this.connect()
  }

  disconnect(): void {
    this.stateVersion += 1
    this.clearPoll()
    this.clearReplayTimer()
    if (this.source) {
      this.source.close()
      this.source = null
    }
    this.reconnecting = false
    this.eventsSinceOpen = 0
    this._chatID = null
    this._channel = 'web'
    this.setConnected(false)
  }

  rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    return postAPI<T>('/api/rpc', { method, params: params ?? {} })
  }

  onMessage = (handler: Handler<WSMessage>) => this.subscribeHandler(this.messageHandlers, handler)
  onSession = (handler: Handler<SessionEvent>) => this.subscribeHandler(this.sessionHandlers, handler)
  onProgress = (handler: Handler<ProgressEvent>) => this.subscribeHandler(this.progressHandlers, handler)
  onConnectionChange = (handler: Handler<boolean>) => this.subscribeHandler(this.connHandlers, handler)

  dispose(): void {
    this.disposed = true
    this.disconnect()
    this.messageHandlers.clear()
    this.sessionHandlers.clear()
    this.progressHandlers.clear()
    this.connHandlers.clear()
  }

  private connect(): void {
    const chatID = this._chatID
    if (this.disposed || !chatID || typeof EventSource === 'undefined') return

    const params = new URLSearchParams({ chat_id: chatID })
    const lastSeq = getLastSeq(chatID)
    if (lastSeq > 0) params.set('last_event_id', String(lastSeq))

    let source: EventSource
    try {
      source = new EventSource(`/api/sse?${params.toString()}`)
    } catch {
      this.startPolling()
      return
    }
    this.source = source
    for (const eventType of SSE_EVENT_TYPES) {
      source.addEventListener(eventType, (event) => {
        if (this.source !== source) return
        this.handleEvent(eventType, event as MessageEvent<string>)
      })
    }
    source.onopen = () => {
      if (this.source !== source) return
      const resumed = this.reconnecting
      this.reconnecting = false
      this.eventsSinceOpen = 0
      this.clearPoll()
      this.setConnected(true)
      if (resumed) this.scheduleReplayFallback(source, chatID)
    }
    source.onerror = () => {
      if (this.source !== source) return
      this.reconnecting = true
      this.setConnected(false)
      this.startPolling()
    }
  }

  private handleEvent(eventType: string, event: MessageEvent<string>): void {
    let msg: WSMessage
    try {
      msg = JSON.parse(event.data) as WSMessage
    } catch {
      return
    }
    msg.type = eventType
    const seq = msg.seq ?? parseSequence(event.lastEventId)
    const chatID = this._chatID
    let replayGap = false
    if (chatID && seq > 0) {
      let previousSeq = getLastSeq(chatID)
      if (seq < previousSeq) {
        resetLastSeq(chatID)
        previousSeq = 0
      } else if (seq === previousSeq) {
        return
      }
      if (previousSeq > 0 && seq > previousSeq + 1) {
        replayGap = true
      }
      msg.seq = seq
      setLastSeq(chatID, seq)
    }
    this.eventsSinceOpen += 1
    this.stateVersion += 1
    this.dispatch(msg)
    if (chatID && replayGap) void this.restoreActiveProgress(chatID)
  }

  private dispatch(msg: WSMessage): void {
    if (msg.type === 'progress_structured' && msg.progress && this._chatID) {
      progressSnapshotCache.set(this._chatID, msg.progress)
    }
    if (msg.type === 'session' && msg.session) {
      this.sessionHandlers.forEach((handler) => handler(msg.session!))
    }
    if ((msg.type === 'progress_structured' || msg.type === 'stream_content' || msg.type === 'sync_progress') && msg.progress) {
      this.progressHandlers.forEach((handler) => handler(msg.progress!))
    }
    this.messageHandlers.forEach((handler) => handler(msg))
  }

  private async sendMessageWithRetry(msg: WSClientMessage): Promise<void> {
    const body = {
      content: msg.content ?? '',
      file_ids: msg.file_ids,
      file_names: msg.file_names,
      file_sizes: msg.file_sizes,
      upload_keys: msg.upload_keys,
      file_mimes: msg.file_mimes,
      ...sessionBody(msg),
    }
    for (let attempt = 0; attempt <= SEND_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await postAPI('/api/message', body)
        return
      } catch (error) {
        if (attempt === SEND_RETRY_DELAYS_MS.length) throw error
        await delay(SEND_RETRY_DELAYS_MS[attempt])
      }
    }
  }

  private scheduleReplayFallback(source: EventSource, chatID: string): void {
    this.clearReplayTimer()
    this.replayTimer = setTimeout(() => {
      this.replayTimer = null
      if (this.source !== source || this._chatID !== chatID || this.eventsSinceOpen > 0) return
      void this.restoreActiveProgress(chatID)
    }, REPLAY_GRACE_MS)
  }

  private async restoreActiveProgress(chatID: string): Promise<void> {
    const stateVersion = this.stateVersion
    try {
      const progress = await this.rpc<ProgressEvent | null>('get_active_progress', {
        channel: this._channel,
        chat_id: chatID,
      })
      if (
        !progress ||
        progress.phase === 'done' ||
        this._chatID !== chatID ||
        this.stateVersion !== stateVersion
      ) return
      this.stateVersion += 1
      this.dispatch({
        type: 'progress_structured',
        chat_id: chatID,
        progress,
      })
    } catch {
      // The next native SSE reconnect or status poll gets another recovery chance.
    }
  }

  private startPolling(): void {
    if (this.pollTimer || !this._chatID) return
    this.pollTimer = setInterval(() => {
      const chatID = this._chatID
      const source = this.source
      if (!chatID) return
      void postAPI('/api/session/status', { channel: this._channel, chat_id: chatID })
        .then(() => {
          if (this._chatID !== chatID || this._connected) return
          if (!source || source.readyState === 2) {
            source?.close()
            if (this.source === source) this.source = null
            this.connect()
          }
        })
        .catch(() => undefined)
    }, STATUS_POLL_MS)
  }

  private clearPoll(): void {
    if (!this.pollTimer) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private clearReplayTimer(): void {
    if (!this.replayTimer) return
    clearTimeout(this.replayTimer)
    this.replayTimer = null
  }

  private setConnected(value: boolean): void {
    if (this._connected === value) return
    this._connected = value
    this.connHandlers.forEach((handler) => handler(value))
  }

  private subscribeHandler<T>(handlers: Set<Handler<T>>, handler: Handler<T>): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  }
}

function sessionBody(msg: WSClientMessage): { channel?: string; chat_id?: string } {
  return { channel: msg.channel, chat_id: msg.chat_id }
}

function parseSequence(raw: string): number {
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : 0
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
