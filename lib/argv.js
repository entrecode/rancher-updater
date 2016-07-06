'use strict';
const packageJson = require('../package.json');

module.exports = require('yargs')
.usage('Usage: $0 [options]')
.help('h')
.alias('h', 'help')

.describe('balancer', 'The name of the load balancer service. Default: lb')
.nargs('balancer', 1)
.default('balancer', 'lb')

.describe('environment', 'The id of environment which should be updated. Defaults to cachena.')
.nargs('environment', 1)
.default('environment', '1a45')

.describe('service', 'The service name which should be updated.')
.alias('service', 's')
.nargs('service', 1)
.demand('service')

.describe('version', 'The version tag to which you want to update.')
.alias('version', 'v')
.nargs('version', 1)
.demand('version')

.describe('port', 'The service port.')
.alias('port', 'p')
.nargs('port', 1)
.demand('port')

.describe('build', 'Build number to add to service name. Allows redeploy of same version.')
.nargs('build', 1)

.describe('env', 'Additional environment variables for the docker-compose template.')
.alias('env', 'e')
.nargs('env', 1)

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

//.describe('i', 'Init mode. Create the service instead of updating it.')
//.alias('i', 'init')
