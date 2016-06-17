/**
 * Created by simon, entrecode GmbH, Stuttgart(Germany) on 15.06.16.
 */
'use strict';

const traverson = require('traverson');

const url = 'https://rancher.entrecode.de/v1/projects/'; // projects is rancher api speech for environment

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

  upgradeStack: (stack, body) => Promise.resolve()
  .then(() => {
    if (!stack.actions.upgrade) {
      return Promise.reject(new Error(`Cannot upgrade stack ${stack.name} is in '${stack.state}' state. Abort.`));
    }

    const t = stack.__traversal.continue().newRequest()
    .follow('$.actions.upgrade')
    .withRequestOptions({
      headers,
    });

    return new Promise((resolve, reject) => {
      t.post(body, (err, res, traversal) => {
        if (err) {
          return reject(err);
        }
        res.__traversal = traversal;
        return resolve(res);
      });
    });
  }),
};

module.exports = api;
