#!/usr/bin/env node

const argv = require('./lib/argv');
const init = require('./lib/init');
const initLb = require('./lib/initLb');
const update = require('./lib/update');
const updateLb = require('./lib/updateLb');
const updateInpl = require('./lib/updateInplace');

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
case 'inplace':
  updateInpl();
  break;
default:
  throw new Error(`Invalid mode ${argv.mode} selected.`);
}
