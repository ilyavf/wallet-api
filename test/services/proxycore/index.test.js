'use strict'

const assert = require('assert')
const app = require('../../../src/app')

describe('proxycore service', function () {
  it('registered the /proxycore service', () => {
    assert.ok(app.service('proxycore'))
  })
})
