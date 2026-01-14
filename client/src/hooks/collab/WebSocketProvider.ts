import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface WebSocketProviderOptions {
  params?: Record<string, string>;
  awareness?: Awareness;
  connect?: boolean;
}

export type WebSocketProviderStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Custom WebSocket provider for Y.js collaboration
 */
export class WebSocketProvider {
  public doc: Y.Doc;
  public awareness: Awareness;
  public url: string;
  public roomname: string;

  private ws: WebSocket | null = null;
  private wsconnecting = false;
  private wsconnected = false;
  private synced = false;
  private shouldConnect = true;

  private listeners = new Map<string, Set<Function>>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  constructor(
    serverUrl: string,
    roomname: string,
    doc: Y.Doc,
    options: WebSocketProviderOptions = {}
  ) {
    this.doc = doc;
    this.roomname = roomname;
    this.awareness = options.awareness || new Awareness(doc);

    // Build WebSocket URL with room parameter
    const url = new URL(serverUrl);
    url.searchParams.set('room', roomname);

    // Add additional params
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    this.url = url.toString();

    // Setup document observers
    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);

    // Connect if requested
    if (options.connect !== false) {
      this.connect();
    }
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    this.shouldConnect = true;
    if (this.wsconnected || this.wsconnecting) {
      return;
    }

    this.wsconnecting = true;
    this.emit('status', [{ status: 'connecting' }]);

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.wsconnecting = false;
        this.wsconnected = true;
        this.reconnectDelay = 1000;

        this.emit('status', [{ status: 'connected' }]);

        // Send sync step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.doc);
        this.send(encoding.toUint8Array(encoder));

        // Send awareness state
        if (this.awareness.getLocalState() !== null) {
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
          encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
          );
          this.send(encoding.toUint8Array(awarenessEncoder));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(new Uint8Array(event.data));
      };

      this.ws.onerror = (error) => {
        // Log locally if needed, but not user-facing debug
      };

      this.ws.onclose = (event) => {
        this.handleDisconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.wsconnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Destroy provider and cleanup
   */
  public destroy(): void {
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.awareness.destroy();
  }

  /**
   * Send message to server
   */
  private send(message: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage = (message: Uint8Array): void => {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);

        if (encoding.length(encoder) > 1) {
          this.send(encoding.toUint8Array(encoder));
        }

        if (!this.synced && syncMessageType === syncProtocol.messageYjsSyncStep2) {
          this.synced = true;
          this.emit('synced', [true]);
          this.emit('sync', [true]);
        }
        break;

      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this
        );
        break;
    }
  };

  /**
   * Handle document update
   */
  private handleDocUpdate = (update: Uint8Array, origin: any): void => {
    if (origin !== this) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.send(encoding.toUint8Array(encoder));
    }
  };

  /**
   * Handle awareness update
   */
  private handleAwarenessUpdate = (
    { added, updated, removed }: any,
    origin: any
  ): void => {
    const changedClients = added.concat(updated).concat(removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    );
    this.send(encoding.toUint8Array(encoder));
  };

  /**
   * Handle disconnect
   */
  private handleDisconnect(): void {
    this.wsconnected = false;
    this.wsconnecting = false;
    this.synced = false;

    this.emit('status', [{ status: 'disconnected' }]);
    this.emit('synced', [false]);
    this.emit('sync', [false]);

    if (this.shouldConnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnect with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  /**
   * Event emitter methods
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  public off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: string, args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(...args));
    }
  }
}
