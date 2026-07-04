function createInMemoryPubSubEventBus() {
  const subscribersByTopic = new Map();
  const publishedEvents = [];
  const deliveries = [];

  function subscribe(topic, subscriberName, handler) {
    if (!topic || !subscriberName || typeof handler !== "function") {
      throw new Error("topic, subscriberName and handler are required");
    }

    const subscribers = subscribersByTopic.get(topic) ?? [];
    subscribers.push({ name: subscriberName, handler });
    subscribersByTopic.set(topic, subscribers);

    return () => {
      const current = subscribersByTopic.get(topic) ?? [];
      subscribersByTopic.set(topic, current.filter((subscriber) => subscriber.name !== subscriberName));
    };
  }

  async function publish(event) {
    if (!event || !event.topic || !event.eventId || !event.type) {
      throw new Error("event with topic, eventId and type is required");
    }

    const subscribers = subscribersByTopic.get(event.topic) ?? [];
    const envelope = Object.freeze({ ...event });
    publishedEvents.push(envelope);

    const results = [];
    for (const subscriber of subscribers) {
      try {
        const result = await subscriber.handler(envelope);
        const delivery = { subscriber: subscriber.name, status: "delivered", result };
        deliveries.push({ eventId: event.eventId, topic: event.topic, ...delivery });
        results.push(delivery);
      } catch (error) {
        const delivery = { subscriber: subscriber.name, status: "failed", error: error.message };
        deliveries.push({ eventId: event.eventId, topic: event.topic, ...delivery });
        results.push(delivery);
      }
    }

    return {
      eventId: event.eventId,
      topic: event.topic,
      subscriberCount: subscribers.length,
      deliveries: results
    };
  }

  function getMetrics() {
    return {
      published: publishedEvents.length,
      deliveries: deliveries.length,
      topics: [...subscribersByTopic.entries()].map(([topic, subscribers]) => ({
        topic,
        subscribers: subscribers.map((subscriber) => subscriber.name)
      }))
    };
  }

  return {
    subscribe,
    publish,
    getMetrics,
    getPublishedEvents: () => [...publishedEvents],
    getDeliveries: () => [...deliveries]
  };
}

module.exports = { createInMemoryPubSubEventBus };
