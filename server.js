const EventEmitter = require('events')
    , http         = require('http')
    , url          = require('url')

const create_http_proxy = require('http-proxy').createProxyServer
    , randbytes         = require('randbytes')
    , websocket         = require('websocket')


function RandomGenerator (size) {
  this.size    = size
  this.urandom = randbytes.urandom.getInstance()
}


RandomGenerator.prototype.get = function() {
  return new Promise((success, failure) => {
    this.urandom.getRandomBytes(this.size, function (buffer, err) {
      if (err == null) success(buffer)
      else             failure(err)
    })
  })
}


function Route (route_key_promise, success, failure) {

  EventEmitter.call(this)

  if (success !== undefined) this.once('initialized', success)
  if (failure !== undefined) this.once('failure',     failure)

  // Route assumes its creation connotates a reference.
  this.refcount = 1

  this.initialized = false
  this.route_key = null

  route_key_promise
    .then((buffer) => this._do_initialize(buffer))
    .catch((err)   => this.emit('failure', err))

}


for (var p in EventEmitter.prototype) {
  Route.prototype[p] = EventEmitter.prototype[p]
}


Route.prototype._do_initialize = function (buffer) {

  if (this.refcount <= 0) {
    this.emit('failure', 'destroyed before init completed')
    return
  }

  this.initialized = true
  this.route_key = buffer.toString('hex')
  this.emit('initialized', this.route_key)

}


Route.prototype.decrease = function () {
  this.refcount--
  if (this.refcount <= 0) {
    this.emit('destroy', this)
  }
}


function RouteManager (size) {

  this.random_generator = new RandomGenerator(size)
  this.routes = {}
  this.route_keys = {}

}


RouteManager.prototype.add = function (target) {

  var route = this.routes[target]

  if (route === undefined) {

    this.routes[target] = new Route(
      this.random_generator.get(),
      (route_key) => { this.route_keys[route_key] = target },
      (err)       => { delete this.routes[target] }
    )

    route = this.routes[target]

    route.once('destroy', (route) => {
      delete this.route_keys[route.route_key]
      delete this.routes[target]

      console.log('destroyed route', route)
    })

  } else if (route.initialized === true) {

    // Short-circuit if the route already exists and is initialized.
    route.refcount++;
    return Promise.resolve(route);

  }


  return new Promise(
    (success, failure) => {

      if (route.route_key != null) success(route)

      var d = false
      route.once('initialized', (route_key) => {
        if (!d) success(route_key)
        else    d = true
      })
      route.once('failure', (err) => {
        if (!d) failure(err)
        else    d = true
      })

    }
  )

}


RouteManager.prototype.remove = function (target) {

  var route = this.routes[target]
  if (route !== undefined) {
    this.routes[target].decrease()
  }

}


function Server (proxy_port, control_port) {

  const size = 1024

  this.proxy = create_http_proxy({})
  this.routes = new RouteManager(size)
  this.url_filter = /([a-z0-9]{2048})([\/]?.*)/i

  var b = (f) => f.bind(this)

  this.proxy_server   = http.createServer(b(this.proxy_request))
  this.control_server = http.createServer(
    (request, response) => {
      console.warn(new Date, '[control] Bad request from', request.origin)
      response.writeHead(404)
      response.end()
    })
  this.control_socket = new websocket.server({ httpServer: this.control_server})
  this.control_socket.on('request', b(this.control_request))

  this.proxy_server.listen(proxy_port)
  this.control_server.listen(control_port)

}


Server.prototype.proxy_request = function (request, response) {

  var e = this.url_filter.exec(request.url)

  function bad_request () {
    console.log(new Date, '[proxy]   Bad request from', request.origin,
                                                  'to', request.url)
    setTimeout(() => response.writeHead(404, {'Content-Length': '0'}), 200)
  }

  if (e == null) {
    return bad_request()
  }

  var target = this.routes.route_keys[e[1]]

  if (target === undefined) {
    return bad_request()
  }

  console.log(new Date, '[proxy]   Request to', target)

  request.url = e[2]
  this.proxy.web(request, response, { target: target }, function (err) {
    console.warn(new Date, '[proxy]   Proxy error to', target, err)
    if (err.stack !== undefined) {
      console.warn('Traceback:', err.stack)
    }
  })

}


Server.prototype.control_request = function (request) {

  var connection = request.accept('tmproxy-protocol', request.origin);

  var connection_state = { refs:  []
                         , alive: true
                         }


  connection.on('message', (message) => {
    if (message.type === 'utf8') {

      console.log(new Date, '[control] Message from', request.origin)

      try {
        var payload = JSON.parse(message.utf8Data)
      } catch (err) {
        console.warn(new Date, '[control] Bad message from', request.origin,
                                                        ':', message.utf8Data)
        if (err.stack) {
          console.warn('Traceback:', err.stack)
        }

        return
      }

      console.log(new Date, '[control] Adding route to', payload.target)

      this.routes.add(payload.target)
        .then((route_key) => {
          console.log(new Date, '[control] ', route_key, '-->', payload.target)
          connection.sendUTF(JSON.stringify({ route_key: route_key
                                            , error:     null
                                            }))
          connection_state.refs.push(payload.target)
        })
        .catch((err) => {
          connection.sendUTF(JSON.stringify({ route_key: null
                                            , error:     err
                                            }))
          console.error('[control] Error adding route to', payload.target)
          if (err.stack) {
            console.error('Traceback:', err.stack)
          }
        })

    }
  })

  connection.on('close', (reason_code, description) => {
    connection_state.alive = false
    while (connection_state.refs.length !== 0) {
      var ref = connection_state.refs.pop()
      this.routes.remove(ref)
    }
  })

}


var s = new Server(2000, 2001)
