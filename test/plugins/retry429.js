// Copyright © 2017 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global describe it before after */
'use strict';

const assert = require('assert');
const Client = require('../../plugins/retry.js');
const fs = require('fs');
const nock = require('../nock.js');

const ME = process.env.cloudant_username || 'nodejs';
const PASSWORD = process.env.cloudant_password || 'sjedon';
const SERVER = 'https://' + ME + '.cloudant.com';

describe('Retry429 Plugin', function() {
  before(function(done) {
    var mocks = nock(SERVER)
        .put('/foo')
        .reply(201, {ok: true});

    var cloudantClient = new Client({ https: true });

    var req = {
      url: SERVER + '/foo',
      auth: { username: ME, password: PASSWORD },
      method: 'PUT'
    };
    cloudantClient(req, function(err, resp) {
      assert.equal(err, null);
      assert.equal(resp.statusCode, 201);
      mocks.done();
      done();
    });
  });

  after(function(done) {
    var mocks = nock(SERVER)
        .delete('/foo')
        .reply(200, {ok: true});

    var cloudantClient = new Client({ https: true });

    var req = {
      url: SERVER + '/foo',
      auth: { username: ME, password: PASSWORD },
      method: 'DELETE'
    };
    cloudantClient(req, function(err, resp) {
      assert.equal(err, null);
      assert.equal(resp.statusCode, 200);
      mocks.done();
      done();
    });
  });

  describe('with callback only', function() {
    it('performs request and returns response', function(done) {
      // NOTE: Use NOCK_OFF=true to test using a real CouchDB instance.
      var mocks = nock(SERVER)
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({ https: true, plugin: 'retry' });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 200);
        assert.ok(data.indexOf('"doc_count":0') > -1);
        mocks.done();
        done();
      });
    });

    it('performs request and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({ https: true });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err.code, 'ECONNRESET');
        assert.equal(err.message, 'socket hang up');
        mocks.done();
        done();
      });
    });

    it('successfully retries request on 429 response and returns 200 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 200);
        assert.ok(data.indexOf('"doc_count":0') > -1);

        // validate retry delay
        var now = (new Date()).getTime();
        assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

        mocks.done();
        done();
      });
    });

    it('fails to retry request on 429 response and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err.code, 'ECONNRESET');
        assert.equal(err.message, 'socket hang up');

        // validate retry delay
        var now = (new Date()).getTime();
        assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

        mocks.done();
        done();
      });
    });

    it('fails to retry request on 429 response and returns 429 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(5)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 429);
        assert.ok(data.indexOf('"error":"too_many_requests"') > -1);

        // validate retry delay
        var now = (new Date()).getTime();
        assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

        mocks.done();
        done();
      });
    });
  });

  describe('with listener only', function() {
    it('performs request and returns response', function(done) {
      // NOTE: Use NOCK_OFF=true to test using a real CouchDB instance.
      var mocks = nock(SERVER)
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({ https: true, plugin: 'retry' });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var dataFile = fs.createWriteStream('data.json');

      cloudantClient(req)
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 200);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"doc_count":0') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);
        })
        .pipe(dataFile)
        .on('finish', function() {
          // validate file contents
          var obj = JSON.parse(fs.readFileSync('data.json', 'utf8'));
          assert.equal(obj.doc_count, 0);
          fs.unlinkSync('data.json');

          mocks.done();
          done();
        });
    });

    it('performs request and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({ https: true });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var errorCount = 0;

      cloudantClient(req)
        .on('error', function(err) {
          errorCount++;
          assert.equal(err.code, 'ECONNRESET');
          assert.equal(err.message, 'socket hang up');
        })
        .on('response', function(resp) {
          assert.fail('Unexpected response from server');
        })
        .on('data', function(data) {
          assert.fail('Unexpected data from server');
        })
        .on('end', function() {
          assert.equal(errorCount, 1);
          mocks.done();
          done();
        });
    });

    it('successfully retries request on 429 response and returns 200 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var dataFile = fs.createWriteStream('data.json');

      var startTs = (new Date()).getTime();
      cloudantClient(req)
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 200);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"doc_count":0') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));
        })
        .pipe(dataFile)
        .on('finish', function() {
          // validate file contents
          var obj = JSON.parse(fs.readFileSync('data.json', 'utf8'));
          assert.equal(obj.doc_count, 0);
          fs.unlinkSync('data.json');

          mocks.done();
          done();
        });
    });

    it('fails to retry request on 429 response and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var errorCount = 0;

      var startTs = (new Date()).getTime();
      cloudantClient(req)
        .on('error', function(err) {
          errorCount++;
          assert.equal(err.code, 'ECONNRESET');
          assert.equal(err.message, 'socket hang up');
        })
        .on('response', function(resp) {
          assert.fail('Unexpected response from server');
        })
        .on('data', function(data) {
          assert.fail('Unexpected data from server');
        })
        .on('end', function() {
          assert.equal(errorCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

          mocks.done();
          done();
        });
    });

    it('fails to retry request on 429 response and returns 429 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(5)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var startTs = (new Date()).getTime();
      cloudantClient(req)
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 429);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"error":"too_many_requests"') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

          mocks.done();
          done();
        });
    });
  });

  describe('with callback and listener', function() {
    it('performs request and returns response', function(done) {
      // NOTE: Use NOCK_OFF=true to test using a real CouchDB instance.
      var mocks = nock(SERVER)
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({ https: true, plugin: 'retry' });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var dataFile = fs.createWriteStream('data.json');

      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 200);
        assert.ok(data.indexOf('"doc_count":0') > -1);
      })
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 200);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"doc_count":0') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);
        })
        .pipe(dataFile)
        .on('finish', function() {
          // validate file contents
          var obj = JSON.parse(fs.readFileSync('data.json', 'utf8'));
          assert.equal(obj.doc_count, 0);
          fs.unlinkSync('data.json');

          mocks.done();
          done();
        });
    });

    it('performs request and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({ https: true });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var errorCount = 0;

      cloudantClient(req, function(err, resp, data) {
        assert.equal(err.code, 'ECONNRESET');
        assert.equal(err.message, 'socket hang up');
      })
        .on('error', function(err) {
          errorCount++;
          assert.equal(err.code, 'ECONNRESET');
          assert.equal(err.message, 'socket hang up');
        })
        .on('response', function(resp) {
          assert.fail('Unexpected response from server');
        })
        .on('data', function(data) {
          assert.fail('Unexpected data from server');
        })
        .on('end', function() {
          assert.equal(errorCount, 1);
          mocks.done();
          done();
        });
    });

    it('successfully retries request on 429 response and returns 200 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .reply(200, {doc_count: 0});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var dataFile = fs.createWriteStream('data.json');

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 200);
        assert.ok(data.indexOf('"doc_count":0') > -1);
      })
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 200);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"doc_count":0') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));
        })
        .pipe(dataFile)
        .on('finish', function() {
          // validate file contents
          var obj = JSON.parse(fs.readFileSync('data.json', 'utf8'));
          assert.equal(obj.doc_count, 0);
          fs.unlinkSync('data.json');

          mocks.done();
          done();
        });
    });

    it('fails to retry request on 429 response and returns error', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(4)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'})
          .get('/foo')
          .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var errorCount = 0;

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err.code, 'ECONNRESET');
        assert.equal(err.message, 'socket hang up');
      })
        .on('error', function(err) {
          errorCount++;
          assert.equal(err.code, 'ECONNRESET');
          assert.equal(err.message, 'socket hang up');
        })
        .on('response', function(resp) {
          assert.fail('Unexpected response from server');
        })
        .on('data', function(data) {
          assert.fail('Unexpected data from server');
        })
        .on('end', function() {
          assert.equal(errorCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

          mocks.done();
          done();
        });
    });

    it('fails to retry request on 429 response and returns 429 response', function(done) {
      if (process.env.NOCK_OFF) {
        this.skip();
      }

      var mocks = nock(SERVER)
          .get('/foo').times(5)
          .reply(429, {error: 'too_many_requests', reason: 'Too Many Requests'});

      var cloudantClient = new Client({
        https: true,
        retryAttempts: 5,
        plugin: 'retry'
      });
      var req = {
        url: SERVER + '/foo',
        auth: { username: ME, password: PASSWORD },
        method: 'GET'
      };

      var dataCount = 0;
      var responseCount = 0;

      var startTs = (new Date()).getTime();
      cloudantClient(req, function(err, resp, data) {
        assert.equal(err, null);
        assert.equal(resp.statusCode, 429);
        assert.ok(data.indexOf('"error":"too_many_requests"') > -1);
      })
        .on('error', function(err) {
          assert.fail(`Unexpected error: ${err}`);
        })
        .on('response', function(resp) {
          responseCount++;
          assert.equal(resp.statusCode, 429);
        })
        .on('data', function(data) {
          dataCount++;
          assert.ok(data.toString('utf8').indexOf('"error":"too_many_requests"') > -1);
        })
        .on('end', function() {
          assert.equal(responseCount, 1);
          assert.equal(dataCount, 1);

          // validate retry delay
          var now = (new Date()).getTime();
          assert.ok(now - startTs > (500 + 1000 + 2000 + 4000));

          mocks.done();
          done();
        });
    });
  });
});
