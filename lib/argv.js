'use strict';
const packageJson = require('../package.json');

module.exports = require('yargs')
.usage('Usage: $0 [options]')
.help('h')
.alias('h', 'help')

.describe('b', 'The name of the load balancer service. Default: lb')
.alias('b', 'balancer-name')
.nargs('b', 1)
.default('b', 'lb')

.describe('e', 'The id of environment which should be updated. Defaults to cachena.')
.alias('e', 'environment')
.nargs('e', 1)
.default('e', '1a45')

.describe('s', 'The service name which should be updated. Must be in the format \'service-name\'-\'version\'')
.alias('s', 'service-name')
.nargs('s', 1)
.demand('s')

.describe('v', 'The version tag to which you want to update.  Must be in the format \'service-name\'-\'version\'')
.alias('v', 'version')
.nargs('v', 1)
.demand('v')

.describe('p', 'The service port.')
.alias('p', 'port')
.nargs('p', 1)
.demand('p')

.describe('n', 'Build number to add to service name. Allows redeploy of same version.')
.alias('n', 'build-number')
.nargs('n', 1)

.describe('docker-service', 'Path to docker-compose template for the service.')
.nargs('docker-service', 1)
.default('docker-service', './service.docker.tpl.yml')
.describe('rancher-service', 'Path to rancher-compose template for the service.')
.nargs('rancher-service', 1)
.default('rancher-service', './service.rancher.tpl.yml')

.describe('docker-balancer', 'Path to docker-compose template for the load balancer.')
.nargs('docker-balancer', 1)
.default('docker-balancer', './balancer.docker.tpl.yml')
.describe('rancher-balancer', 'Path to rancher-compose template for the load balancer.')
.nargs('rancher-balancer', 1)
.default('rancher-balancer', './balancer.rancher.tpl.yml')

.describe('access-key', 'The API access key. Environment variable: RANCHER_ACCESS_KEY')
.nargs('access-key', 1)

.describe('secret-key', 'The API secret key. Environment variable: RANCHER_SECRET_KEY')
.nargs('secret-key', 1)

.epilog(`Created with love <3 by entrecode. Version: ${packageJson.version}`)
  .argv;
