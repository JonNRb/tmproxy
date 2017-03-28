'use strict'

const EventEmitter = require('events').EventEmitter

const websocket = require('websocket')


class Connection extends EventEmitter {

  constructor (connected_socket) {

    super()

    this.socket = connected_socket
    this._l = false

    this.socket.on('close', () => this.emit('close'))
    this.socket.on('error', err => this.emit('error', err))

  }

  add (target) {

    if (this._l) {
      return Promise.reject('already adding target')
    }

    return new Promise((resolve, reject) => {

      this.socket.once('message', message => {

        this._l = false

        if (message.type === 'utf8') {
          var response = JSON.parse(message.utf8Data)
          if (response.error) {
            reject(response.error)
          } else if (response.route_key == null) {
            reject('empty route key')
          } else {
            resolve(response.route_key)
          }
        } else {
          reject('received something other than UTF8 data')
        }

      })

      this.socket.sendUTF(JSON.stringify({ target: target }))

    })

  }

}


class Client {

  constructor () {
    this.socket = new websocket.client()
    this.connection = null
  }


  connect (server) {

    if (this.connection !== null) {
      return Promise.reject('existing connection')
    }

    return new Promise((resolve, reject) => {

      this.socket.on('connectFailed', reject)

      this.socket.on('connect', connection => {
        this.connection = new Connection(connection)
        this.connection.on('close', () => { this.connection = null })
        resolve(this.connection)
      })

      this.socket.connect(server, 'tmproxy-protocol')

    })

  }

}


module.exports.Client = Client
