'use strict';

var Promise = require('bluebird'),
    Resource = require('./resource'),
    Authenticator = require('./auth');

Promise.promisifyAll(Resource);
Promise.promisifyAll(Authenticator);

var resources = {};

resources.create = authenticated(Resource.createAsync.bind(Resource));
resources.destroy = authenticated(Resource.destroyAsync.bind(Resource));
resources.acquireLock = authenticated(Resource.acquireLockAsync.bind(Resource));
resources.releaseLock = authenticated(Resource.releaseLockAsync.bind(Resource));
resources.renewLock = authenticated(Resource.renewLockAsync.bind(Resource));

function authenticated(action) {
  return function(event, context, cb) {
    console.log("app.js:function authenticated", "event", event);
    if (event.name) {
      event.body.name = event.name;
    }
    return withErrorHandling(Authenticator.authenticateAsync(event.body).then(action)).asCallback(cb);
  };
};

function unauthenticated(action) {
  return function(event, context, cb) {
    console.log("app.js:function unauthenticated", "event", event);
    return withErrorHandling(action(event.body)).asCallback(cb);
  };
};

var withErrorHandling = function(promise) {
  return promise.catch(function(e) {
    console.log("logged error", e, e.stack);
    throw new Error(JSON.stringify(e));
  });
};

module.exports = resources;
