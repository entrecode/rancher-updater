/**
 * Created by simon, entrecode GmbH, Stuttgart(Germany) on 15.06.16.
 */
'use strict';

const traverson = require('traverson');
const argv = require('./argv');

const url = `${argv.url}/v1/projects/`; // projects is rancher api speech for environment

const headers = {
  'Cache-Control': 'no-cache',
};

let environment;

const api = {
  init: (accessKey, secretKey) => {
    headers.Authorization = `Basic ${new Buffer(`${accessKey}:${secretKey}`).toString('base64')}`;
  },

  getEnvironment: (id) => Promise.resolve()
  .then(() => {
    if (environment && environment.id === id) {
      return Promise.resolve(environment);
    }

    const t = traverson.from(url + id)
    .json()
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res, traversal) => {
        if (err) {
          return reject(err);
        }
        res.__traversal = traversal;
        environment = res;
        return resolve(res);
      });
    });
  }),
  
  getStacks: (envID) => Promise.resolve()
  .then(() => api.getEnvironment(envID))
  .then((environment) => {
    const t = environment.__traversal.continue().newRequest()
    .follow('$.links.environments')
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

  getStack: (envID, stackName) => Promise.resolve()
  .then(() => api.getEnvironment(envID))
  .then((environment) => {
    const t = environment.__traversal.continue().newRequest()
    .follow('$.links.environments') // 'environments' is rancher api speech for stack
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

        traversal.continue()
        .follow('$.data.0.links.self')
        .withRequestOptions({
          headers,
        })
        .getResource((err, res, traversal) => {
          if (err) {
            return reject(err);
          }
          res.__traversal = traversal;
          return resolve(res);
        });
      });
    });
  }),

  getServices: (stack) => Promise.resolve()
  .then(() => {
    const t = stack.__traversal.continue().newRequest()
    .follow('$.links.services')
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.getResource((err, res, traversal) => {
        if (err) {
          return reject(err);
        }

        if (res.data.lengt < 1) {
          return reject(new Error(`Stack ${stack.name} does not contain any services. Abort.`));
        }

        res.__traversal = traversal;
        return resolve(res);
      });
    });
  }),

  removeService: (service) => Promise.resolve()
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

        res.__traversal = traversal;
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
            body: res.body
          }));
        }

        const out = JSON.parse(res.body);
        out.__traversal = traversal;
        return resolve(out);
      });
    });
  }),
};

module.exports = api;
