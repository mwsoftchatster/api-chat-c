/* jshint esnext: true */
require('events').EventEmitter.prototype._maxListeners = 0;
var config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/config/config.js');
var email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/lib/email_lib.js');
var functions = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/lib/func_lib.js');
var time = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-chat-c/lib/time_lib.js');
var fs = require("fs");
var express = require("express");
var http = require('http');
var https = require('https');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var Sequelize = require('sequelize');
var mysql = require('mysql');
var bodyParser = require("body-parser");
var cors = require("cors");
var amqp = require('amqplib/callback_api');
var admin = require('firebase-admin');
var serviceAccount = require(config.firebase.service_account);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
});
var db = admin.database();
var ref = db.ref();
var offlineMessagesRef = ref.child('offline_messages');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.chat_c_port, function() {
    email.sendApiChatCErrorEmail();
});

/**
 *  POST remove all 1:1 chat online/offline messages that were retrieved by the user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/deleteRetrievedMessages", function(req, res) {
    console.log("/deleteRetrievedMessages has been called");
    functions.deleteRetrievedMessages(req, res);
});

var io = require("socket.io")(server, { transports: ['websocket'] });


/**
 *   RabbitMQ connection object
 */
var amqpConn = null;


/**
 *  Map containing all currently connected sockets
 */
var currSockets = new Map();


/**
 *  Publishes message on topic
 */
function publishMessageToToipc(message, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'messageForUser.*';
            var key = 'messageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}


/**
 *  Publishes user status online/offline on topic
 */
function publishStatusToToipc(status, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'messageForUser.*';
            var key = 'messageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(status));
        });
    }
}

/**
 *  Publishes delete one time keys used to process one message on topic
 */
function publishDeleteKeysOnE2EC(message) {
    console.log("deleteOneTimePublicKeysByUUIDChat has been called");
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiE2EC.*';
            var key = `apiE2EC.${config.rabbitmq.topics.deleteOneTimePublicKeysByUUIDChat}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}

/**
 *  Publishes offline message to api-chat-q
 */
function publishOfflineMessageOnChatQ(message) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiChatQ.*';
            var key = `apiChatQ.${config.rabbitmq.topics.offlineMessage}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}

/**
 *  Publishes received online message to api-chat-q
 */
function publishReceivedOnlineMessageOnChatQ(message) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiChatQ.*';
            var key = `apiChatQ.${config.rabbitmq.topics.receivedOnlineMessage}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}

/**
 *  Publishes delete received online message to api-chat-q
 */
function publishDeleteReceivedOnlineMessageOnChatQ(message) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiChatQ.*';
            var key = `apiChatQ.${config.rabbitmq.topics.deleteReceivedOnlineMessage}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}


/**
 *  Subscribe api-chat-c to topic to receive messages
 */
function subscribeToChatC(topic, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = '';
            var toipcName = ``;
            if (userId === null){
                exchange = 'apiChatC.*';
                toipcName = `apiChatC.${topic}`;
            } else {
                exchange = 'messageForUser.*';
                toipcName = 'messageForUser.' + userId;
            }
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.assertQueue(toipcName, { exclusive: false, auto_delete: true }, function(err, q) {
                ch.bindQueue(q.queue, exchange, toipcName);
                ch.consume(q.queue, function(msg) {
                    // check if status ok or error
                    var message = JSON.parse(msg.content.toString());
                    if (toipcName === `apiChatC.${config.rabbitmq.topics.deleteOneTimePublicKeysByUUIDC}`){
                        if (message.status === config.rabbitmq.statuses.error) {
                            // fetch used data from api-chat-c db and publish it again
                            // if error persists after specified number of retries, notify and stop for a specified period
                            // after specified period expires try again
                        } 
                    } else if (toipcName === `apiChatC.${config.rabbitmq.topics.offlineMessageC}`){
                        if (message.status === config.rabbitmq.statuses.error) {
                            // fetch used data from api-chat-c db and publish it again
                            // if error persists after specified number of retries, notify and stop for a specified period
                            // after specified period expires try again
                        } 
                    } else if (toipcName === `apiChatC.${config.rabbitmq.topics.receivedOnlineMessageC}`){
                        if (message.status === config.rabbitmq.statuses.error) {
                            // fetch used data from api-chat-c db and publish it again
                            // if error persists after specified number of retries, notify and stop for a specified period
                            // after specified period expires try again
                        } 
                    } else if (toipcName === `apiChatC.${config.rabbitmq.topics.deleteReceivedOnlineMessageC}`){
                        if (message.status === config.rabbitmq.statuses.error) {
                            // fetch used data from api-chat-c db and publish it again
                            // if error persists after specified number of retries, notify and stop for a specified period
                            // after specified period expires try again
                        } 
                    } else {
                        if (message.event === 'message') {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
                        } else if (message.event === "contactOnline") {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message.value);
                            }
                        } else if (message.event === "unbind") {
                            ch.unbindQueue(q.queue, exchange, toipcName);
                            ch.close();
                        } else if (message.event === "unsendMessage") {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
                        } else if (message.event === "spyChat") {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
                        } else if (message.event === "connectionToSpyChat") {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
    
                            if(message.action === "disconnect" || message.action === "spyIsOffline"){
                                if (currSockets.has(message.senderId)) {
                                    currSockets.get(message.senderId).emit(message.event, message);
                                }
                            }
                        }
                    } 
                }, { noAck: true });
            });
        });
    }
}


/**
 *  Connect to RabbitMQ
 */
function connectToRabbitMQ() {
    amqp.connect(config.rabbitmq.url, function(err, conn) {
        if (err) {
            email.sendApiChatCErrorEmail(err);
            console.error("[AMQP]", err.message);
            return setTimeout(connectToRabbitMQ, 1000);
        }
        conn.on("error", function(err) {
            email.sendApiChatCErrorEmail(err);
            if (err.message !== "Connection closing") {
                console.error("[AMQP] conn error", err.message);
            }
        });
        conn.on("close", function() {
            console.error("[AMQP] reconnecting");
            return setTimeout(connectToRabbitMQ, 1000);
        });
        console.log("[AMQP] connected");
        amqpConn = conn;
        subscribeToChatC(config.rabbitmq.topics.deleteOneTimePublicKeysByUUIDC, null);
        subscribeToChatC(config.rabbitmq.topics.offlineMessageC, null);
        subscribeToChatC(config.rabbitmq.topics.receivedOnlineMessageC, null);
        subscribeToChatC(config.rabbitmq.topics.deleteReceivedOnlineMessageC, null);
    });
}

connectToRabbitMQ();


/**
 *  MySQL Sequelize object
 */
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
 *  Sends message delivery status response to the user
 */
function respondWithMessageDeliveryStatus(uuid, status, socket) {
    var msgDeliveryStatus = {
        uuid: uuid,
        status: status
    };
    socket.emit('messageDeliveryStatus', msgDeliveryStatus);
}


/**
 *  SOCKET.IO listeners
 */
io.sockets.on("connection", function(socket) {
    console.log("socket id => " + socket.id + " has connected");

    /**
     *  on.connectionToSpyChat handles connection to spy chat
     */
    socket.on("connectionToSpyChat", function(senderId, senderName, contactId, action) {
        console.log("on.connectionToSpyChat");
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // if result is not null that means the contact is connected to this chat room
                // so, just emit the message to contact but not to the user self
                if(result.length > 0){
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: action,
                        event: "connectionToSpyChat"
                    };

                    publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                }else{
                    // emit spyChat event notifying that other spy is not connected
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: "spyIsOffline",
                        event: "connectionToSpyChat"
                    };
                    publishMessageToToipc(JSON.stringify(msg), senderId.toString());
                }
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);
        });
    });

    /**
     *  on.spyChat handles spy messages
     */
    socket.on("spyChat", function(message, senderId, senderName, contactId, chatName, msgType, uuid, contactPublicKeyUUID, userPublicKeyUUID) {
        console.log("on.spyChat");
        var myutc = time.getCurrentUTC();
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // if result is not null that means the contact is connected to this chat room
                // so, just emit the message to contact but not to the user self
                if(result.length > 0){
                    var msg = {
                        msgType: msgType,
                        senderId: senderId.toString(),
                        senderName: senderName,
                        chatname: socket.chatname,
                        messageText: message,
                        receiverId: contactId.toString(),
                        uuid: uuid,
                        contactPublicKeyUUID: contactPublicKeyUUID,
                        messageCreated: myutc,
                        event: "spyChat"
                    };

                    publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                }else{
                    // emit spyChat event notifying that other spy has left
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: "spyIsOffline",
                        event: "connectionToSpyChat"
                    };
                    publishMessageToToipc(JSON.stringify(msg), senderId.toString());
                }
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);
        });
    });


    /**
     *  on.chat handles messages
     */
    socket.on("chat", function(message, senderId, senderName, contactId, chatName, msgType, uuid, contactPublicKeyUUID, userPublicKeyUUID) {
        console.log("on.chat");
        console.log("message:");
        console.log(message);
        var myutc = time.getCurrentUTC();
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                    // if result is not null that means the contact is connected to this chat room
                    // so, just emit the message to contact but not to the user self
                    if(result.length > 0){
                        var msg = {
                            msgType: msgType,
                            senderId: senderId.toString(),
                            senderName: senderName,
                            chatname: socket.chatname,
                            messageText: message,
                            receiverId: contactId.toString(),
                            uuid: uuid,
                            contactPublicKeyUUID: contactPublicKeyUUID,
                            messageCreated: myutc,
                            event: "message"
                        };
                        // save this message temporary until receiver sends aknowldgement then delete
                        sequelize.query('CALL InsertNewReceivedOnlineMessage(?,?,?,?,?,?,?,?,?,?)',
                        { replacements: [ "chatMsg", msgType, senderId.toString(), contactId.toString(), socket.chatname, message, uuid, contactPublicKeyUUID, "message", myutc ],
                            type: sequelize.QueryTypes.RAW }).then(result => {
                                publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                                respondWithMessageDeliveryStatus(uuid, "success", socket);
                                var messageToPublish = {
                                    msgType: "chatMsg",
                                    contentType: msgType,
                                    senderId: senderId.toString(),
                                    chatname: socket.chatname,
                                    messageText: message,
                                    receiverId: contactId.toString(),
                                    uuid: uuid,
                                    contactPublicKeyUUID: contactPublicKeyUUID,
                                    messageCreated: myutc
                                };
                                publishReceivedOnlineMessageOnChatQ(JSON.stringify(messageToPublish));

                                // Publish message to api-e2e-c to delete one time keys used to process this message
                                var oneTimeKeysToDelete = {
                                    contactPublicKeyUUID: contactPublicKeyUUID, 
                                    userPublicKeyUUID: userPublicKeyUUID
                                };
                                publishDeleteKeysOnE2EC(JSON.stringify(oneTimeKeysToDelete));
                        }).error(function(err){
                            email.sendApiChatCErrorEmail(err);
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        });
                    }else{
                        // if result is null that means contact is not connected to this chat room
                        // save the message so that contct can retrieve it later when notification is received
                        sequelize.query('CALL InsertNewOfflineMessage(?,?,?,?,?,?,?,?,?,?)',
                        { replacements: [ "chatMsg", msgType, senderId.toString(), senderName, contactId.toString(), socket.chatname, message, uuid, contactPublicKeyUUID, myutc ],
                            type: sequelize.QueryTypes.RAW }).then(result => {
                                var firebaseOfflineMessage = {
                                    receiver_id: contactId.toString()
                                };
                                offlineMessagesRef.child(uuid).set(firebaseOfflineMessage);
                                respondWithMessageDeliveryStatus(uuid, "success", socket);

                                // Publish message to api-e2e-c to delete one time keys used to process this message
                                var keysToDelete = {
                                    contactPublicKeyUUID: contactPublicKeyUUID, 
                                    userPublicKeyUUID: userPublicKeyUUID
                                };
                                publishDeleteKeysOnE2EC(JSON.stringify(keysToDelete));

                                var offlineMessage = {
                                    msgType: "chatMsg",
                                    contentType: msgType,
                                    senderId: senderId.toString(),
                                    senderName: senderName,
                                    chatname: socket.chatname,
                                    messageText: message,
                                    receiverId: contactId.toString(),
                                    uuid: uuid,
                                    contactPublicKeyUUID: contactPublicKeyUUID,
                                    messageCreated: myutc
                                };
                                publishOfflineMessageOnChatQ(JSON.stringify(offlineMessage));
                        }).error(function(err){
                            email.sendApiChatCErrorEmail(err);
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        });
                    }
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });

    /**
     *  on.openchat sets up 1:1 chat room connection
     */
    socket.on("openchat", function(userId, contactId, chatname) {
        console.log("on.openchat");
        // id of the user who is going to be sending messages to the contact with id of contactId
        socket.userId = userId.toString();
        // id of the contact who is going to be receiving messages from user with id of userId
        socket.contactId = contactId.toString();
        if (currSockets.has(socket.userId)) {
            currSockets.delete(socket.userId);
            currSockets.set(socket.userId, socket);
        } else {
            currSockets.set(socket.userId, socket);
        }
        subscribeToChatC(null, socket.userId);
        // check if contact is connected to chatname/reverse chatname
        // and just join this user to it
        var firstpartchatname = chatname.split("@")[0];
        var secondpartchatname = chatname.split("@")[1];
        var reversechatname = secondpartchatname.concat("@").concat(firstpartchatname);
        socket.username = firstpartchatname;
        sequelize.query('CALL CheckIfUserConnectedToChat(?,?)',
        { replacements: [ chatname, reversechatname ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result.length > 0){
                    // if result is not null that means the contact is connected to this chat room
                    // emit contact is online event and join the user to this chat room as well
                    socket.chatname = result[0].chat_name;
                    socket.join(socket.chatname);
                    // let the user know that the contact is online
                    var status = {
                        value: "Online",
                        event: "contactOnline",
                        senderId: socket.userId,
                        receiverId: socket.contactId,
                        chatname: socket.chatname
                    };
                    publishStatusToToipc(JSON.stringify(status), socket.contactId);
                    socket.emit("contactOnline", "Online");
                }else{
                    // if result is null that means contact is not connected to this chat room
                    // connect the user to this chat room and save record to db so that contact knows that this user is online
                    socket.chatname = chatname;
                    socket.join(socket.chatname);  
                }
                sequelize.query('CALL InsertNewOnlineUser(?,?,?)',
                { replacements: [ socket.chatname, userId.toString(), time.getCurrentUTC() ],
                    type: sequelize.QueryTypes.RAW }).then(result => {
                }).error(function(err){
                    email.sendApiChatCErrorEmail(err);
                });
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);          
        });
    });


    /**
     *  on.unsendMessage handles un-sending of messages
     */
    socket.on("unsendMessage", function(senderId, senderName, contactId, chatName, uuid) {
        console.log("on.unsendMessage");
        var myutc = time.getCurrentUTC();
        var postData = JSON.stringify(
            {
                senderId: senderId.toString(),
                contactId: contactId.toString()
            }
        );

        var options = {
            hostname: '192.168.178.24',
            port: 3200,
            path: '/checkIfUserIsAllowedToUnsend',
            method: 'POST',
            headers: {
                 'Content-Type': 'application/json',
                 'Content-Length': postData.length
            }
        };

        var req = http.request(options, (res) => {
            res.on('data', (data) => {
              console.log(data.toString('utf8'));
              if(data.toString('utf8') === '1'){
                sequelize.query('CALL CheckIfChatUserOnline(?,?)',
                { replacements: [ chatName, contactId.toString() ],
                    type: sequelize.QueryTypes.RAW }).then(result => {
                            // if result is not null that means the contact is connected to this chat room
                            // so, just emit the message to contact but not to this user
                            if(result.length > 0){
                                var msg = {
                                    msgType: "unsendMessage",
                                    senderId: senderId.toString(),
                                    receiverId: contactId.toString(),
                                    chatname: socket.chatname,
                                    messageText: "unsendMessage",
                                    uuid: uuid,
                                    event: "unsendMessage"
                                };
                                publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                            }else{
                                // if result is null that means contact is not connected to this chat room
                                // save the message so that contact can retrieve it later 
                                sequelize.query('CALL InsertNewOfflineMessage(?,?,?,?,?,?,?,?,?,?)',
                                { replacements: [ "unsendMessage", "unsendMessage", senderId.toString(), senderName, contactId.toString(), socket.chatname, "unsendMessage", uuid, "unsendMessage", myutc ],
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                        var firebaseOfflineMessage = {
                                            receiver_id: "" + contactId.toString()
                                        };
                                        offlineMessagesRef.child(uuid).set(firebaseOfflineMessage);

                                        var messgae = {
                                            msgType: "unsendMessage",
                                            contentType: "unsendMessage",
                                            senderId: senderId.toString(),
                                            senderName: senderName,
                                            chatname: socket.chatname,
                                            messageText: "unsendMessage",
                                            receiverId: contactId.toString(),
                                            uuid: uuid,
                                            contactPublicKeyUUID: "unsendMessage",
                                            messageCreated: myutc
                                        };
                                        publishOfflineMessageOnChatQ(JSON.stringify(messgae));
                                }).error(function(err){
                                    email.sendApiChatCErrorEmail(err);
                                });
                            }
                    }).error(function(err){
                        email.sendApiChatCErrorEmail(err);
                    });
                }else{
                    // if result is null that means the sender is not allowed to unsend in this chat room
                    var msg = {
                        msgType: "unsendMessage",
                        senderId: senderId,
                        chatname: socket.chatname,
                        messageText: "notAllowedToUnsend",
                        uuid: uuid
                    };
                    socket.emit('unsendMessage', msg); 
                }
            });
          });
        
          req.on('error', (err) => {
            console.error(err);
            email.sendApiChatCErrorEmail(err);
          });
          
          req.write(postData);
          req.end();
    });


    /**
     * on.messageReceived handles message received confirmation by the client
     */
    socket.on("messageReceived", function(uuid) {
        console.log("on.messageReceived");
        var messageReceivedResponseError = {
            status: "error",
            uuid: uuid
        };
        var messageReceivedResponseSuccess = {
            status: "success",
            uuid: uuid
        };
        // the message receiver has acknowledged the reception of the message and it can now be deleted
        sequelize.query('CALL DeleteReceivedOnlineMessage(?)',
        { replacements: [ uuid ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.emit('messageReceived', messageReceivedResponseSuccess);
                var message = {
                    uuid: uuid
                };
                publishDeleteReceivedOnlineMessageOnChatQ(JSON.stringify(message));
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);
            socket.emit('messageReceived', messageReceivedResponseError);
        });
    });


    /**
     *  on.disconnect handles leaving 1:1 chat room
     */
    socket.on("disconnect", function() {
        console.log("on.disconnect");
        // unbind your own queue as you are leaving and you won't be consuming messages anymore
        var unbindMyQueue = {
            value: "Unbind My Queue",
            event: "unbind",
            senderId: socket.userId,
            receiverId: socket.userId
        };
        publishStatusToToipc(JSON.stringify(unbindMyQueue), socket.userId);
        // delete your record from db so that your contact knows you left
        sequelize.query('CALL DeleteOnlineUser(?,?)',
        { replacements: [ socket.chatname, socket.userId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // let other user know that you left the room
                var status = {
                    value: "Offline",
                    event: "contactOnline",
                    senderId: socket.userId,
                    receiverId: socket.contactId,
                    chatname: socket.chatname
                };
                publishStatusToToipc(JSON.stringify(status), socket.contactId);
                if (currSockets.has(socket.userId)) {
                    currSockets.delete(socket.userId);
                }
        }).error(function(err){
            email.sendApiChatCErrorEmail(err);
        });
        // leave the specific chat that user has joined
        socket.leave(socket.chatname);
    });
});