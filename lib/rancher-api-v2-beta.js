const traverson = require('traverson');
const argv = require('./argv');
const yaml = require('js-yaml');

const url = `${argv.url}/v2-beta/projects/`; // projects is rancher api speech for environment

const headers = {
  'Cache-Control': 'no-cache',
  Authorization: `Basic ${new Buffer(`${argv.accessKey}:${argv.secretKey}`).toString('base64')}`,
};

let cachedEnvironment;

const api = {
  getEnvironment: () => Promise.resolve()
  .then(() => {
    if (cachedEnvironment && cachedEnvironment.id === argv.environment) {
      return Promise.resolve(cachedEnvironment);
    }

    const t = traverson.from(url + argv.environment)
    .json()
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res, traversal) => {
        if (err) {
          return reject(err);
        }
        res.ectraversal = traversal;
        cachedEnvironment = res;
        return resolve(res);
      });
    });
  }),

  getStacks: () => Promise.resolve()
  .then(() => api.getEnvironment())
  .then((environment) => {
    const t = environment.ectraversal.continue().newRequest()
    .follow('$.links.stacks')
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res.data);
      });
    });
  }),

  getStack: stackName => Promise.resolve()
  .then(() => api.getEnvironment())
  .then((environment) => {
    const t = environment.ectraversal.continue().newRequest()
    .follow('$.links.stacks')
    .withRequestOptions({
      headers,
      qs: {
        name: stackName,
      },
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res, traversal) => {
        if (err) {
          return reject(err);
        }
        if (res.data.length !== 1) {
          return reject(new Error(`Cannot find stack ${stackName}.`));
        }

        return traversal.continue()
        .follow('$.data.0.links.self')
        .withRequestOptions({
          headers,
        })
        .getResource((err2, res2, traversal2) => {
          if (err2) {
            return reject(err2);
          }
          res2.ectraversal = traversal2;
          return resolve(res2);
        });
      });
    });
  }),

  getServices: stack => Promise.resolve()
  .then(() => {
    const t = stack.ectraversal.continue().newRequest()
    .follow('$.links.services')
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res, traversal) => {
        if (err) {
          return reject(err);
        }

        if (res.data.length < 1) {
          return reject(new Error(`Stack ${stack.name} does not contain any services. Abort.`));
        }

        res.ectraversal = traversal;
        return resolve(res);
      });
    });
  }),

  removeService: service => Promise.resolve()
  .then(() => {
    const t = traverson
    .from(service.actions.remove)
    .json()
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.post({}, (err, res, traversal) => {
        if (err) {
          return reject(err);
        }

        res.ectraversal = traversal;
        return resolve(res);
      });
    });
  }),

  exportConfig: (stack, ids) => Promise.resolve()
  .then(() => {
    const t = traverson
    .from(stack.actions.exportconfig)
    .json()
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.post({ serviceIds: ids }, (err, res, traversal) => {
        if (err) {
          return reject(err);
        }
        if (res.stausCode >= 400) {
          return reject(new Error('Export of config did return >= 400 status Code', {
            status: res.statusCode,
            body: res.body,
          }));
        }

        const out = JSON.parse(res.body);
        out.dockerComposeConfig = yaml.safeDump(yaml.safeLoad(out.dockerComposeConfig).services);
        out.rancherComposeConfig = yaml.safeDump(yaml.safeLoad(out.rancherComposeConfig).services);

        out.ectraversal = traversal;
        return resolve(out);
      });
    });
  }),
};

module.exports = api;
