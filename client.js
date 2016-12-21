const websocket = require('websocket')


var tmproxy = process.argv[2]
  , target  = process.argv[3]

var err_immediately = false
if (tmproxy === undefined) {
  err_immediately = true
  console.error('First parameter is tmproxy websocket')
}
if (target === undefined) {
  err_immediately = true
  console.error('Second parameter is target')
}
if (err_immediately === true) {
  process.exit(1)
}


var client = new websocket.client()

client.on('connectFailed', function (err) {
  console.warn('Connection failed:', err)
  if (err.stack) {
    console.warn('Traceback:', err.stack)
  }
  process.exit(1)
})

client.on('connect', function (connection) {
  connection.on('error', function (err) {
    console.error('Connection error:', err)
    if (err.stack) {
      console.error('Traceback:', err.stack)
    }
    process.exit(1)
  })

  connection.on('close', function () {
    console.warn('Connection closed by remote')
    process.exit(1)
  })

  connection.on('message', function (message) {
    if (message.type === 'utf8') {
      var response = JSON.parse(message.utf8Data)
      if (response.error) {
        console.warn('Error from server:', response.error)
        process.exit(1)
      } else if (response.route_key == null) {
        console.error('Empty route_key', response.route_key)
      } else {
        console.log(response.route_key)
      }
    } else {
      console.warn('Received something other than UTF8 data')
      process.exit(1)
    }
  })

  connection.sendUTF(JSON.stringify({ target: target }))
})

client.connect(tmproxy, 'tmproxy-protocol')
