import { EventEmitter } from 'events';
import crypto from 'crypto';
import { createRedisConnection, getRedisClient } from '../config/redis.js';

const instanceId = crypto.randomUUID();
const CHANNEL_NAME = 'videofactory:events';

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.publisher = null;
    this.subscriber = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      // Publisher uses the general Redis client
      this.publisher = getRedisClient();

      // Subscriber requires a dedicated connection
      this.subscriber = createRedisConnection();
      await this.subscriber.connect();

      await this.subscriber.subscribe(CHANNEL_NAME);
      
      this.subscriber.on('message', (channel, message) => {
        if (channel === CHANNEL_NAME) {
          try {
            const { event, data, origin } = JSON.parse(message);
            // Emit the event locally for any subscribers in this process
            this.emit(event, data, { origin });
          } catch (err) {
            console.error('[EventBus] Error parsing pub/sub message:', err.message);
          }
        }
      });

      this.initialized = true;
      console.log(`[EventBus] Initialized on instance ${instanceId}`);
    } catch (err) {
      console.error('[EventBus] Failed to initialize:', err.message);
    }
  }

  /**
   * Publish an event to the cluster
   * @param {string} event Event name
   * @param {any} data Payload data
   */
  async publish(event, data = {}) {
    if (!this.initialized) {
      // Fallback: emit locally if Redis is not initialized yet
      this.emit(event, data, { origin: instanceId, localOnly: true });
      return;
    }

    try {
      const payload = JSON.stringify({
        event,
        data,
        origin: instanceId
      });
      await this.publisher.publish(CHANNEL_NAME, payload);
    } catch (err) {
      console.error(`[EventBus] Publish failed for event "${event}":`, err.message);
      // Fallback local emit if Redis publish fails
      this.emit(event, data, { origin: instanceId, error: err.message });
    }
  }
}

const eventBus = new EventBus();
export default eventBus;
