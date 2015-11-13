var Config = require('./config');
var Utilities = require('./util');
var ModelDynamoDB = require('./model').DynamoDB;
dynamoDB = new ModelDynamoDB();

var moment = require('moment');
var bcryptjs = require('bcryptjs');
var _ = require('lodash');
var jwt = require('jsonwebtoken');


// DynamoDB Table Name for this Model
var DynamoDBTable = 'joumae-' + Config.jaws.data_model_stage + '-resources';


// Export
module.exports = new Resource();

function Resource() {}



Resource.prototype.acquireLock = function(data, callback) {

    // Defaults
    var _this = this;

    /**
     * Validate
     */

    if (!data.name) return callback({
        status: 400,
        message: 'Bad Request: name is required'
    }, null);

    // if (data.api_key != Config.x.api_key) return callback({
    //     status: 401,
    //     message: 'Unauthorized: Invalid api_key is provided'
    // }, null);

    dynamoDB.getItem({TableName: DynamoDBTable, Key: {"name": data.name}}, function (error, response) {
      if (error) return callback({
        status: 500,
        raw: error
      });

      console.log("response", response);

      if (!response.Item) return callback({
        status: 404,
        message: 'The resource named ' + data.name + ' does not exist.'
      });

      var resourceBeforeUpdate = response.Item;
      var acquiredBy = data.user_id;

      var updateItemReq = {
        TableName: DynamoDBTable,
        Key: { name: data.name },
        UpdateExpression: "set acquiredBy = :acquiredBy, acquiredAt = :acquiredAt, revision = :newRevision, updatedAt = :updatedAt, expiredAt = :expiredAt",
        ConditionExpression: "revision = :oldRevision AND (attribute_not_exists(expiredAt) OR attribute_type(expiredAt, :typeOfNull) OR expiredAt < :now)",
        ExpressionAttributeValues: {
          ':acquiredBy': acquiredBy || 'me',
          ':acquiredAt': moment().unix(),
          ':oldRevision': resourceBeforeUpdate.revision,
          ':newRevision': (resourceBeforeUpdate.revision || 0) + 1,
          ':updatedAt': moment().unix(),
          ':expiredAt': moment().unix() + (data.ttl || 5),
          ':now': moment().unix(),
          ":typeOfNull": 'NULL'
        },
        ReturnValues: "ALL_NEW"
      };

      console.log(updateItemReq);

      dynamoDB.updateItem(updateItemReq, function(error, resource) {
          if (error && error.code == 'ConditionalCheckFailedException') {
            return callback({
              status: 423,
              message: "Resource \"" + data.name + "\" is already locked.",
              raw: error
            });
          } else if (error) {
            return callback({
              status: 500,
              raw: error
            });
          }

          return callback(null, {
              name: data.name,
  	          resource: resource
          });
      });
    });
};

Resource.prototype.renewLock = function(data, callback) {

    // Defaults
    var _this = this;

    /**
     * Validate
     */

    if (!data.name) return callback({
        status: 400,
        message: 'Bad Request: name is required'
    }, null);

    if (!data.user_id) return callback({
        status: 400,
        message: 'Bad Request: user_id is required'
    }, null);

    dynamoDB.getItem({TableName: DynamoDBTable, Key: {"name": data.name}}, function (error, response) {
        if (error) return callback({
            status: 500,
            raw: error
        });

        console.log("response", response);

        if (!response.Item) return callback({
            status: 404,
            message: 'The resource named ' + data.name + ' does not exist.'
        });

        var resourceBeforeUpdate = response.Item;
        var acquiredBy = data.user_id;
        var now = moment().unix();

        var updateItemReq = {
            TableName: DynamoDBTable,
            Key: { name: data.name },
            UpdateExpression: "set revision = :newRevision, updatedAt = :updatedAt, expiredAt = :expiredAt",
            ConditionExpression: "revision = :oldRevision AND acquiredBy = :acquiredBy AND expiredAt >= :now",
            ExpressionAttributeValues: {
                ':acquiredBy': acquiredBy,
                ':oldRevision': resourceBeforeUpdate.revision,
                ':newRevision': (resourceBeforeUpdate.revision || 0) + 1,
                ':updatedAt': now,
                ':expiredAt': now + (data.ttl || 5),
                ':now': now
            },
            ReturnValues: "ALL_NEW"
        };

        console.log("resource.js: function renewLock", "updateItemReq", updateItemReq);

        dynamoDB.updateItem(updateItemReq, function(error, resource) {
            if (error) return callback({
                status: 500, raw: error, resource: response.Item, processed_at: now
            });

            return callback(null, {
                name: data.name,
                resource: resource
            });
        });
    });
};

Resource.prototype.releaseLock = function(data, callback) {

    // Defaults
    var _this = this;

    /**
     * Validate
     */

    if (!data.name) return callback({
        status: 400,
        message: 'Bad Request: name is required'
    }, null);

    if (!data.user_id) return callback({
        status: 400,
        message: 'Bad Request: user_id is required'
    }, null);

    dynamoDB.getItem({TableName: DynamoDBTable, Key: {"name": data.name}}, function (error, response) {
        if (error) return callback({
            status: 500,
            raw: error
        });

        console.log("response", response);

        if (!response.Item) return callback({
            status: 404,
            message: 'The resource named ' + data.name + ' does not exist.'
        });

        var resourceBeforeUpdate = response.Item;
        var acquiredBy = data.user_id;

        var updateItemReq = {
            TableName: DynamoDBTable,
            Key: { name: data.name },
            UpdateExpression: "set acquiredBy = :null, acquiredAt = :null, revision = :newRevision, updatedAt = :updatedAt, expiredAt = :null",
            ConditionExpression: "revision = :oldRevision AND acquiredBy = :acquiredBy",
            ExpressionAttributeValues: {
                ':acquiredBy': acquiredBy,
                ':oldRevision': resourceBeforeUpdate.revision,
                ':newRevision': (resourceBeforeUpdate.revision || 0) + 1,
                ':updatedAt': moment().unix(),
                ':null': null
            },
            ReturnValues: "ALL_NEW"
        };

        console.log(updateItemReq);

        dynamoDB.updateItem(updateItemReq, function(error, resource) {
            if (error) return callback({
                status: 500, raw: error
            });

            return callback(null, {
                name: data.name,
                resource: resource
            });
        });
    });
};

Resource.prototype.create = function(params, callback) {
    console.log({params: params});

    if (!params.name) return callback({
        status: 400,
        message: 'Bad Request: name is required'
    }, null);

    dynamoDB.getItem({TableName: DynamoDBTable, Key: {"name": params.name}}, function (error, response) {
      if (error) return callback({
        status: 500,
        raw: error
      });

      console.log({response: response});

      if (response.Item) return callback({
        status: 400,
        message: 'The resource named ' + params.name + ' already exists.'
      });

      resource = { name: params.name};
      resource._id = Utilities.generateID('resource');
      resource.createdAt = moment().unix();
      resource.updatedAt = moment().unix();
      resource.acquiredBy = null;
      resource.acquiredAt = null;
      resource.revision = 0;
      resource.heartbeatMadeAt = null;

      console.log({resourceToPut: resource});

      dynamoDB.putItem({TableName: DynamoDBTable, Item: resource}, function (error, response) {
          if (error || !response) return callback({
              status: 500,
              raw: error
          }, null);

          return callback(null, resource);
      });
    });

};

Resource.prototype.destroy = function(data, callback) {
  if (!data.id) return callback({
      status: 400,
      message: 'Bad Request: id is required'
  }, null);


  var params = {
    TableName: dynamodb_table,
    ReturnValues: 'ALL_NEW',
    Key: {
      '_id': data.id
    }
  };

  ModelDynamoDB.deleteItem(params, function(error, response) {
    if (error || !response) return callback({
      status: 500,
      raw: error
    }, null);

    return callback(null, response);
  });
};
