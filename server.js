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

    route.once('destroy', function (route) {
      delete this.route_keys[route.route_key]
      delete this.routes[target]
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


function Server (proxy_port, control_port) {

  const size = 1024

  this.proxy = create_http_proxy({})
  this.routes = new RouteManager(size)
  this.url_filter = /([a-z0-9]{2048})([\/]?.*)/i

  var b = (f) => f.bind(this)

  this.proxy_server   = http.createServer(b(this.proxy_request))
  this.control_server = http.createServer(
    (request, response) => { response.writeHead(404); response.end() }
  )
  this.control_socket = new websocket.server({ httpServer: this.control_server})
  this.control_socket.on('request', b(this.control_request))

  this.proxy_server.listen(proxy_port)
  this.control_server.listen(control_port)


  this.routes.add('http://10.77.77.3:8000/')
    .then(function (route_key) {
      console.log('route added for tstream at', route_key)
    })
    .catch(function (err) {
      console.error('error adding route for tstream', err)
    })

  this.routes.add('http://10.77.77.74/')
    .then(function (route_key) {
      console.log('route added for remote at', route_key)
    })
    .catch(function (err) {
      console.error('error adding route for remote', err)
    })

}


Server.prototype.proxy_request = function (request, response) {

  var e = this.url_filter.exec(request.url)

  function bad_request () {
    console.log('bad request', request.url)
    setTimeout(() => response.writeHead({'Content-Length': '0'}, 404), 200)
  }

  if (e == null) {
    return bad_request()
  }

  var target = this.routes.route_keys[e[1]]

  if (target === undefined) {
    return bad_request()
  }

  console.log('proxy', target, e[2])

  request.url = e[2]
  this.proxy.web(request, response, { target: target }, function (err) {
    console.error(target, e[2], err)
  })

}


Server.prototype.control_request = function (request) {

}



//s.random_generator.get().then((b) => console.log(b.toString('hex')))

var s = new Server(2000, 2001)
