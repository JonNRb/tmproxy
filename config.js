'use strict'

const fs = require('fs')

const YAML = require('yamljs')


function can_read_sync (path) {
  try {
    fs.accessSync(path, fs.constants.R_OK)
    return true
  } catch (err) {
    return false
  }
}

function get_config_path () {

  if (process.argv.length === 3 && can_read_sync(process.argv[2])) {
    return process.argv[2]
  } else if (process.env.TMPROXY_CONFIG &&
             can_read_sync(process.env.TMPROXY_CONFIG)) {
    return process.env.TMPROXY_CONFIG
  }

}

let config_path = get_config_path()
  , config_yaml = null

if (config_path !== undefined) {
  try {
    config_yaml = YAML.load(config_path)
    console.log('configuration loaded from', config_path)
  } catch (err) {
    console.warn(err)
  }
}


module.exports = (config_yaml && config_yaml.tmproxy) || {}
