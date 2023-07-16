const mongoose = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');

// Redis URL
const redisUrl = 'redis://127.0.0.1:6379';

// Create Redis client
const client = redis.createClient(redisUrl);

// Promisify Redis client method
client.hget = promisify(client.hget);

// Store the original exec method of mongoose.Query.prototype
const exec = mongoose.Query.prototype.exec;

/**
 * Enable caching for the query
 * @param {Object} options - Cache options
 * @param {string} options.key - Cache key
 * @returns {mongoose.Query} - The query object
 */
mongoose.Query.prototype.cache = function (options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
};

/**
 * Override the exec method of mongoose.Query.prototype
 * @returns {Promise} - The query result
 */
mongoose.Query.prototype.exec = async function () {
  // If caching is disabled, execute the original exec method
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  // Generate the cache key
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name,
    })
  );

  // Check if the cache value exists in Redis
  const cacheValue = await client.hget(this.hashKey, key);

  // If the cache value exists, parse and return it
  if (cacheValue) {
    const doc = JSON.parse(cacheValue);

    return Array.isArray(doc)
      ? doc.map((d) => new this.model(d))
      : new this.model(doc);
  }

  // If the cache value does not exist, execute the original exec method
  const result = await exec.apply(this, arguments);

  // Store the query result in Redis
  client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);

  return result;
};

module.exports = {
  /**
   * Clear the cache for a given hash key
   * @param {string} hashKey - The hash key
   */
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  },
};
