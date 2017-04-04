# ec.rancher-updater

This provides `rancher-updater` which is a commandline tool to do blue-green style deployments in [Rancher](http://rancher.com/rancher/).

> Since version 0.4.0 rancher-updater will use the rancher api v2-beta and compose version 2 syntax.
>
> Note that the temlates should be only services without the wrapping `services:` key in yaml. If this does not suit your use case PRs are welcome. :)

## Installation

Make sure you have installed `rancher-compose` from Rancher. Then all you have to do is:

```sh
npm install -g rancher-updater
```

## Usage

Rancher updater requires serveral assumptions for your Rancher setup. These are important to understand befor using Rancher updater. Also you need to be familiar with `docker-compose` and `rancher-compose` file format, since it will be used in addition to [handlebars](http://handlebarsjs.com/).

#### Commandline tool

```sh
# show help
rancher-updater -h

# update webapp to version 5.0.3 build 4
rancher-updater --url https://myrancher.example.com -s webapp -v 5.0.3 --build 4

# update worker to version 0.12.0-dev
rancher-updater --url https://myrancher.example.com -s worker -v 0.12.0-dev -m service

# create app with version 0.0.1
export RANCHER_URL=https://myrancher.example.com
rancher-updater -s app -v 0.0.1 -m initBalanced
```

#### Environments and Stacks

Rancher updater supports multiple environments and stacks.

For any environment you will need to get an access key (`--access-key`) and secret key (`--secret-key`) tied to a specific environment (`--environment`.

Stack names are tightly coupled to service names. Imagine you want to deploy a service `ec-api`.

* Stack name should be `ec-api`
* service name should be `ec-api-$major-$minor-$patch[-build-$build]`.
    * for version `0.11.5-dev` it would be `ec-api-0-11-5-dev`
    * for `5.1.0 build 5` `ec-api-5-1-0-build-5`.
* Docker image name and tag should be `ec-api:$major.$minor.$patch`
    * for version `0.11.5-dev`it would be `ec-api:0.11.5-dev`
    * for `5.1.0 build 5` it would be `ec-api:5.1.0`

The build number (`--build`) only applies to the service name (`--service`) and is not considered part of the docker image tag. Dots in the version (`--version`) are replaced by hyphens.

#### Modes

There are three main update modes, `service`, `balanced` and `inplace`.

* `balanced`

	This mode updates stacks with a load balancer in front of the main service. You can use this when ever you having an API. When updating a balanced stack the following steps are executed in order:
	
	* Check initial stack health
	* Check availability of new servie name
	* Check for old service
	* Print old config
	* Load and render templates
	* Create new service
	* Check health
	* Switch load balancer to new service
	* Check health (if this failes the balancer is switched back)
	* Delete old service

* `service`

	This is an service only mode without a load balancer. Use this when your service does not provide an API. Think of a worker service. When updating a service only stack the following steps are executed in order:
	
	* Check initial stack health
	* Check availability of new service name
	* Check for old service
	* Print old config
	* Load and render templates
	* Create new service
	* Check health
	* Delete old service

Each mode has its accompaning init mode, `init` and `initBalanced`. The init modes can be used to create the stack according to your configuration.

* `inplace`

	This will update the service in 'Rancher'-Style update-commit-rollback manner. Use this mode if your service does not relies on balancer and is linked with other services directly. When updating a service inplace following steps are executed in order:

	* Check initial stack health
	* Check service to be updated
	* Print old config
	* Load and render templates
	* Update Service
	* Check service ggot  healthy
	* Await for health for defined time period
	* Commit Service Update
	* ON ERROR: Rollback Service Update

#### Templates

There are four templates which are used:

* balancer.docker.tpl.yml
* balancer.rancher.tpl.yml
* service.docker.tpl.yml
* service.rancher.tpl.yml

One for each docker-compose and rancher-compose file for the service and load balancer. Which one is which should be obvious.


This is a simple example of a service only template:

**service.docker.tpl.yml**

```yaml
{{serviceName}}:
  environment:
    NODE_ENV: production
  labels:
    io.rancher.scheduler.affinity:container_label_soft_ne: io.rancher.stack_service.name=$${stack_name}/$${service_name}
    io.rancher.container.pull_image: always
  tty: true
  image: registry.example.com/{{service}}:{{version}}
  stdin_open: true
```

**service.rancher.tpl.yml**

```yaml
{{serviceName}}:
  scale: 2
```

A more advanced example with load balancer is in `./examples`.

When the templates are rendered rancher updater uses strict mode, so if your specify a variable which is not available in the command line parameters it will fail. See commandline tool description for additional info.

## TODOs

* build number and additional stack name: clean invalid characters.
