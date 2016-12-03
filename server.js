var http = require('http')
  , url  = require('url')

var createHttpProxy = require('http-proxy').createProxyServer
  , randbytes       = require('randbytes')


function RandomGenerator (size) {
  this.size    = size
  this.urandom = randbytes.urandom.getInstance()
}

RandomGenerator.prototype.get = function() {
  return new Promise((success, failure) => {
    this.urandom.getRandomBytes(this.size, function (buffer, err) {
      if (err == null)
        success(buffer)
      else
        failure(err)
    })
  })
}


function Server(proxy_port, control_port) {
  this.proxy = createHttpProxy({})
  this.random_generator = new RandomGenerator(1024)
  this.url_filter = /([a-z0-9]{2048})([\/]?.*)/i

  var b = (f) => f.bind(this)
  this.proxy_socket = http.createServer(b(this.proxy_request))
  this.control_socket = http.createServer(b(this.control_request))
  
  this.proxy_socket.listen(proxy_port)
  this.control_socket.listen(control_port)
}

var static_routes = {
  'eed10d1c6ff70087e85a90c76b509ec29edd10c2e281fbb86524bd528606f941070a7cf134ff7062c3c03164405f9634339bd3cce43a93e9a44983dc9c69ae21bf5261c23bdda7249717beac659c5e7f6f43e8d4e03691264bf311f604a70aef77b5b6d065396a78d90d9f2e1dff7ea87a341a35fd7ecc1088c1de1a043a814fbe90419ab6e073c385eac4616e5620228e6f226857f5c60334f45c3429bc2fd78811da23595d0d3e7c70bce5bcfd3f19ce09f8188b2cff012966c9cd839da2e86c2e2f0c9bce867b1c2f7195cd25d4f42419c328ef16dedea2914356e8aa70c0681c8da92b8c40fedf42ab790b1ad643daa7f42ecdae575b07b7889ee6d3df7f7aff2cc39fcb39165b049e18e0f559ae7c6b5a2a38395abfabf1ae96573b785793c3252189a6a038f5c3fe27e51f0031912a48ee8419916c9bb536749f4a55b00a556834d5f487e5608607701d7eb856a983ab2a815036fa3779cd5fc0cae6c2117f2b73942b9f5403c0bd800a62641559cdb87ad6d166cacd7a19ece2d1573ef1e77a110fb052fb50ed7c5599d025edebfd54c2064481a5e9315d4cbd76b0f1c7b50a947ff60876a1e23428893814836c592050e3c5c8835404c5eda44bc9a18e69b2334e92b57019bc9c0ddc2fb87338eb4b8f66f59c25af4f7ddfe078f43d094e159a7afeb3ef24f9fe673f577da792ab4f274003fdb0a2f9f595756effd00129a2f205e648dfa2bd319df63f0d1edfdce1e1c49cade81d9a7dd3d0da8c32341bf17034713404337aa3b5ff3f988ed5f0b12b9cf2f70e2217c0b39a74f06c01f2899aed9e014a8d459819ec6f98090e67a536fb47da17c15f4c289df666f5ca36f0c68bc4cc16a44f0bae473500e60f89b81f675bbc74b6323a03e236adf262bf23f0d6248f844d3ad0b190d4618d329861029880a72b00fe055c0e4af8b538f62a3e00e631f214aac288d73ada6851a4f61da5b7c77843a35ad7f3f68d3ed97157fdd813f57c5d3e0c6fdc794d33ef0fff74fb5060e7a198a7744c13fb7f877c67e230615ef96ddff0da396082564fbc489bfb4ba901cf256a24cacce138c8d3c1247dee9eaabbc6247bb94e943102ef3350d53cef52599ea1c8f780fd0ead4dc58edf1dd5e8b1cde425d98ff84980f697a4150732967bc7d0af10ec7b17e8e2befa955c023f7a3697b1f262f7584a6bfc041fcd875c64ea825926107e1d8bc4dd98709af909bb9994486cfee099eb461f088bfd4f58bfc557d6a43b029da7dc3c72c3e5297ff1cac5aace967930cf24c4c7b99d1ae2383796b6ff32fbf609b5e60e34410d4132a02a936bf58e9bbf77bcf9d64854ca1684d15872bab2b1697246b9dbdba7b2ca430babacc79aca7ba51e935b9e2c4ca856e32e4e853056057b0888cb85ad4b66b7cf3cc312cabcfaa4cff891f8942aa7362a00e9b3c49e': 'http://tmachine.jonnrb.com/'
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

  var target = static_routes[e[1]]

  if (target === undefined) {
    return bad_request()
  }

  console.log('proxy', target, e[2])

  request.url = e[2]
  this.proxy.web(request, response, { target: target }, function (err) {
    console.error(target, e[2], err)
  })

}

Server.prototype.control_request = function (request, response) {
  console.log('control', request.url)
}



//s.random_generator.get().then((b) => console.log(b.toString('hex')))

var s = new Server(2000, 2001)
