#!/usr/bin/env node

'use strict'

const Client = require('../client').Client


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


let client = new Client()
client.connect(tmproxy)
  .then(connection => {
    return connection.add(target)
  })
  .then(route_key => {
    console.log(route_key)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
