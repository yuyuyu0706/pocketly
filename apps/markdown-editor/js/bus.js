(function (global) {
  'use strict';

  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();

  /**
   * Subscribe to an event on the global bus.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void} Function to unsubscribe the handler.
   */
  function on(event, handler) {
    if (typeof event !== 'string' || !event) {
      return () => {};
    }
    if (typeof handler !== 'function') {
      return () => {};
    }
    let handlers = listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      listeners.set(event, handlers);
    }
    handlers.add(handler);
    return function unsubscribe() {
      off(event, handler);
    };
  }

  /**
   * Remove a handler from the event bus.
   * @param {string} event
   * @param {Function} handler
   * @returns {void}
   */
  function off(event, handler) {
    if (typeof event !== 'string' || !event) {
      return;
    }
    const handlers = listeners.get(event);
    if (!handlers) {
      return;
    }
    handlers.delete(handler);
    if (handlers.size === 0) {
      listeners.delete(event);
    }
  }

  /**
   * Emit an event with an optional payload.
   * @param {string} event
   * @param {any} payload
   * @returns {void}
   */
  function emit(event, payload) {
    if (typeof event !== 'string' || !event) {
      return;
    }
    const handlers = listeners.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error('[Bus] handler error for event', event, error);
      }
    });
  }

  const Bus = { on, off, emit };
  global.Bus = Bus;
})(window);
