'use strict';

require('letsencrypt-express').create({
  server: 'staging'
, email: 'jonbetti@gmail.com'
, agreeTos: true
, approveDomains: [ 'frost.jonnrb.com' ]
, app: require('express')().use('/', function (req, res) {
    res.end('Hello, World!');
  })
}).listen(null, 443);
