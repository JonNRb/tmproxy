const EventEmitter = require('events')
    , http         = require('http')
    , url          = require('url')

const create_http_proxy = require('http-proxy').createProxyServer
    , randbytes         = require('randbytes')
    , websocket         = require('websocket')

const config = require('./config')


class RandomGenerator {

  constructor (size) {
    this.size    = size
    this.urandom = randbytes.urandom.getInstance()
  }


  get () {
    return new Promise((success, failure) => {
      this.urandom.getRandomBytes(this.size, function (buffer, err) {
        if (err == null) success(buffer)
        else             failure(err)
      })
    })
  }

}


class Route extends EventEmitter {

  constructor (route_key_promise, success, failure) {

    super()

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


  _do_initialize (buffer) {

    if (this.refcount <= 0) {
      this.emit('failure', 'destroyed before init completed')
      return
    }

    this.initialized = true
    this.route_key = buffer.toString('hex')
    this.emit('initialized', this.route_key)

  }


  decrease () {
    this.refcount--
    if (this.refcount <= 0) {
      this.emit('destroy', this)
    }
  }

}


class RouteManager {

  constructor (size) {

    this.random_generator = new RandomGenerator(size)
    this.routes = {}
    this.route_keys = {}

  }


  add (target) {

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


  remove (target) {

    var route = this.routes[target]
    if (route !== undefined) {
      this.routes[target].decrease()
    }

  }

}


class Server {

  constructor (proxy_port, control_port, size) {

    size = size || 256

    this.proxy = create_http_proxy({})
    this.routes = new RouteManager(size)
    this.url_filter = new RegExp(
      `([a-z0-9]{${(size*2).toString()}})([\/]?.*)`, 'i')

    var b = (f) => f.bind(this)

    this.proxy_server   = http.createServer(b(this.proxy_request))
    this.control_server = http.createServer(
      (request, response) => {
        console.warn('[control] Bad request from', request.origin)
        response.writeHead(404)
        response.end()
      })
    this.control_socket = new websocket.server(
                            { httpServer: this.control_server }
                          )
    this.control_socket.on('request', b(this.control_request))

    this.proxy_server.listen(proxy_port, function () {
      console.log('[proxy]   listening on', this.address())
    })
    this.control_server.listen(control_port, function () {
      console.log('[control] listening on', this.address())
    })

  }


  proxy_request (request, response) {

    var e = this.url_filter.exec(request.url)

    function bad_request () {
      console.log('[proxy]   Bad request from', request.origin,
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

    console.log('[proxy]   Request to', target)

    request.url = e[2]
    this.proxy.web(request, response, { target: target }, function (err) {
      console.warn('[proxy]   Proxy error to', target, err)
      if (err.stack !== undefined) {
        console.warn('Traceback:', err.stack)
      }
    })

  }


  control_request (request) {

    var connection = request.accept('tmproxy-protocol', request.origin);

    var connection_state = { refs:  []
                           , alive: true
                           }


    connection.on('message', (message) => {
      if (message.type === 'utf8') {

        console.log('[control] Message from', request.origin)

        try {
          var payload = JSON.parse(message.utf8Data)
        } catch (err) {
          console.warn('[control] Bad message from', request.origin,
                                                ':', message.utf8Data)
          if (err.stack) {
            console.warn('Traceback:', err.stack)
          }

          return
        }

        console.log('[control] Adding route to', payload.target)

        this.routes.add(payload.target)
          .then((route_key) => {
            console.log('[control] ', route_key, '-->', payload.target)
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

}


function bind_date_to_logs () {
  function date_bind (old_log) {
    function new_log () {
      var a = Array.prototype.slice.call(arguments, 0)
      return old_log.apply(this, [new Date().toString()].concat(a))
    }
    return new_log
  }

  console.log = date_bind(console.log)
  console.warn = date_bind(console.warn)
  console.error = date_bind(console.error)
}


if (config.date_log_messages === true) {
  bind_date_to_logs()
}


if (config.drop_credentials != null) {
  console.log('Dropping credentials',
              config.drop_credentials.user, config.drop_credentials.group)
  process.setuid(config.drop_credentials.user)
  process.setgid(config.drop_credentials.group)
}


var s = new Server(config.proxy_port, config.control_port)
