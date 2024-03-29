/*
  Copyright (C) 2017 - 2020 MWSOFT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint esnext: true */
var fs = require('fs');
var path = require('path');
var config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/config/config.js');
var email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/lib/email_lib.js');


/**
 *  Setup the pool of connections to the db so that every connection can be reused upon it's release
 *
 */
var mysql = require('mysql');
var Sequelize = require('sequelize');
const sequelize = new Sequelize(config.db.name, config.db.user_name, config.db.password, {
    host: config.db.host,
    dialect: config.db.dialect,
    port: config.db.port,
    operatorsAliases: config.db.operatorsAliases,
    pool: {
      max: config.db.pool.max,
      min: config.db.pool.min,
      acquire: config.db.pool.acquire,
      idle: config.db.pool.idle
    }
});


/**
 *  Deletes retrieved messages and checks if there are new messages availble
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.deleteRetrievedMessages = function (req, res){
    var newOnlineReceivedMessages = [];
    sequelize.query('CALL ProcessReceivedOnlineMessages(?,?)',
    { replacements: [ req.query.dstId, req.query.uuids.toString() ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            for (var i = 0; i < result.length; i++) {
                var receivedOnlineMessage = {
                    returnType: "success",
                    msgType: "chatMsg",
                    contentType: result[i].content_type,
                    senderId: result[i].sender_id,
                    chatname: result[i].chat_name,
                    messageText: result[i].message,
                    uuid: result[i].message_uuid,
                    contactPublicKeyUUID: result[i].contact_public_key_uuid,
                    messageCreated: result[i].item_created
                };
                newOnlineReceivedMessages.push(receivedOnlineMessage);
            }
            res.json(newOnlineReceivedMessages);
    }).error(function(err){
        email.sendNotificationsErrorEmail(err);
        sendNotificationsErrorMessage(newOnlineReceivedMessages, res);
    });
  };