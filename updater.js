#!/usr/bin/env node

const argv = require('./lib/argv');
const init = require('./lib/init');
const initLb = require('./lib/initLb');
const update = require('./lib/update');
const updateLb = require('./lib/updateLb');

switch (argv.mode) {
case 'balanced':
  updateLb();
  break;
case 'service':
  update();
  break;
case 'init':
  init();
  break;
case 'initBalanced':
  initLb();
  break;
default:
  throw new Error(`Invalid mode ${argv.mode} selected.`);
}
