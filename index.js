// initialise and define npm packages that we need (express, requests, body-parser) they are inside node_modules
const express = require('express')
const request = require('request')
const bodyParser = require('body-parser')

// set app to express (everytime we open app it uses express framework)
const app = express()

// set environment variables so that we don't have to store our credentials in code (which is not safe)
const token = process.env.FB_VERIFY_TOKEN
const access = process.env.FB_ACCESS_TOKEN
const api_client = process.env.APIAI_CLIENT_ACCESS_TOKEN
const WEATHER_API_KEY = process.env.WEATHER_API_KEY

// initialise API.AI with the api keywords
const apiaiApp = require('apiai')(api_client)

//set ports use (process.env.PORT) for heroku or PORT 5000 for localhost
app.set('port', (process.env.PORT || 5000))

//check for incoming info if is it json
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

//setup url endpoints
app.get('/', function(req, res){
  res.send('Hello Tiro')
})

//create a webhook endpoint that facebook will be listening to
app.get('/webhook/', function(req, res){
  //check if we have the correct credentials to connect to fb
  if (req.query['hub.verify_token'] == token) {
    res.send(req.query['hub.challenge'])
  }
  else {
    res.send('No Entry')
  }
})

// This is how we receive messages at our webhook via Facebook i.e capture messaging events
app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.message) {
          receivedMessage(event);
        } else {
          console.log("Webhook received unknown event: ", event);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know
    // you've successfully received the callback. Otherwise, the request
    // will time out and we will keep trying to resend.
    res.sendStatus(200);
  }
  if (data.result.action === 'weather') {
    // call the weather api function
    weatherApi(data, res)
  }
});

// this is the weatherApi Function == it checks the weather at a particular city
function weatherApi(data, res) {
  let city = data.result.parameters['geo-city']
  let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID='+WEATHER_API_KEY+'&q='+city

  request.get(restUrl, function(err, response, body) {
    if (!err && response.statusCode == 200) {
      let json = JSON.parse(body);
      let msg = json.weather[0].description + ' and the temperature is ' + (json.main.temp-273.15).toFixed(2) + ' °C'
      return res.json({
        speech: msg,
        displayText: msg,
        source: 'weather'
      })
    }
    else {
      return res.status(400).json({
        status: {
          code: 400,
          errorType: 'I failed to look up the city name.'
        }
      })
    }
  })
}


// this function checks is a message sent by user has been received by facebook and logs it and echoes it back
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {
    // if message is text just echo the text we received by calling function (sendTextMessage)
      sendTextMessage(senderID, messageText);
    }
  else {
    console.log("Could not receive text message");
  }
  }

// This is the sendTextMessage funtion and it sends back the text message
// but it calls another function called callSendAPI that connects to the api
function sendTextMessage(recipientId, messageText) {
  //api stuff
  let apiai = apiaiApp.textRequest(messageText, {sessionId: 'prime_cat'})

  apiai.on('response', function(response) {
    let aiText = response.result.fulfillment.speech;
    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        text: aiText
      }
    };
    callSendAPI(messageData);
  })

  // handle error
  apiai.on('error', function(error) {
    console.log(error)
  })

  // end apiai session
  apiai.end()
}

// This is the callSendAPI function that connects to the api and sends the message back to user
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: access },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent generic message with id %s to recipient %s",
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });
}

// add our server endpoints
app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})
