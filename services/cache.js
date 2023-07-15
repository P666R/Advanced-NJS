const mongoose = require('mongoose');
const redis = require('redis');
const { promisify } = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.get = promisify(client.get);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.exec = async function () {
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name,
    })
  );

  // see if we have a value for key in redis

  const cacheValue = await client.get(key);

  // if yes return it
  if (cacheValue) {
    console.log(cacheValue);

    return JSON.parse(cacheValue);
  }

  // otherwise run the query and store the result in redis

  const result = await exec.apply(this, arguments);
  client.set(key, JSON.stringify(result));
  return result;
};
