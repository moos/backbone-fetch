var nock = require('nock');
var assert = require('assert');
var baseUrl = 'http://a.com/';

global.FormData = require('form-data');
global.fetch = require('node-fetch');
global._ = require('underscore');
global.Backbone = require('backbone');
require('./backbone-fetch');


// support for fetch abort() -- this polyfill obliterates fetch.Response
let Response = fetch.Response;
require('abortcontroller-polyfill/dist/polyfill-patch-fetch');
fetch.Response = Response;


describe('backbone-fetch', () => {

  let Model = Backbone.Model.extend({
    url: () => baseUrl + 'foo'
  });
  // Backbone.debugAjax = true;

  let model;
  let response = {
    json: {test: 111},
    text: 'test',
    pdf: '%PDF...',
    png: 'PNG...'
  };

  afterEach(function () {
    nock.cleanAll();
  });

  it('returns json with default accept type', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.json);
    return model.fetch().then(res => {
      assert.equal(res.test, 111);
    });
  });

  it('returns json with content-type: application/json', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.json, {'content-type': 'application/json'});
    return model.fetch().then(res => {
      assert.equal(res.test, 111);
    });
  });

  it('rejects if response is not json', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.text, {'content-type': 'application/json'});
    return model.fetch().then((res) => {
      assert(false); // shouldn't get here
    }).catch(err => {
      assert(err instanceof Error);
      assert.equal(err.message, 'invalid json response body at http://a.com/foo reason: Unexpected token e in JSON at position 1');
    });
  });

  it('returns text with content-type text', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.text, {'content-type': 'text/plain'});
    return model.fetch().then(res => {
      assert.equal(res, response.text);
    });
  });

  it('returns arraybuffer with content-type PDF', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.pdf, {'content-type': 'application/pdf'});
    return model.fetch().then(res => {
      assert(res instanceof ArrayBuffer);
      assert.equal(res.byteLength, response.pdf.length);
    });
  });

  it('returns arraybuffer with content-type PNG', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.png, {'content-type': 'image/png'});
    return model.fetch().then(res => {
      assert(res instanceof ArrayBuffer);
      assert.equal(res.byteLength, response.png.length);
    });
  });

  it('returns blob with content-type PNG when using useBlob', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.png, {'content-type': 'image/png'});
    return model.fetch({useBlob: true}).then(async (res) => {
      assert.equal(res.size, response.png.length);
      assert.equal(res.type, 'image/png');

      var text = await (new fetch.Response(res)).text();
      assert.equal(text, response.png)
    });
  });

  it('returns blob with unknown content-type', () => {
    model = new Model();
    nock(baseUrl)
      .get('/foo')
      .reply(200, response.png, {'content-type': 'foo/bar'});
    return model.fetch().then(async (res) => {
      assert.equal(res.size, response.png.length);
      assert.equal(res.type, 'foo/bar');

      var text = await (new fetch.Response(res)).text();
      assert.equal(text, response.png)
    });
  });

  it('POSTs FormData', () => {
    model = new Model({fileName: 'foo.pdf', mimeType: 'application/pdf', file: 'dummy file'});

    var data = new FormData();
    data.append('File-Name', model.get('fileName'));
    data.append('Mime-Type', model.get('mimeType'));
    data.append('File', model.get('file'));

    nock(baseUrl)
      .post('/foo', function (body) {
        assert(this.headers['content-type'][0].startsWith('multipart/form-data;boundary=------'));
        assert(body.startsWith('----------------'));
        assert(body.includes('Content-Disposition: form-data;'));
        assert(body.includes(' name="File-Name"\r\n\r\nfoo.pdf\r\n'));
        assert(body.includes(' name="Mime-Type"\r\n\r\napplication/pdf\r\n'));
        assert(body.includes(' name="File"\r\n\r\ndummy file\r\n'));
        return true
      })
      .reply(200, '', {'content-type': 'text/plain'});

    return model.save(null, {
      data: data
    }).then(res => {
      assert.equal(res, '');
    });
  });

  it('aborts call during on-going XHR call', function () {
    nock(baseUrl)
      .get('/foo')
      .delay(150)    // delay the xhr response
      .reply(200, {});

    var model = new Model({id: 11});
    var promise = model.fetch();

    // abort while 1st call is in progress
    _.delay(() => {
      promise.abort();
    }, 70);

    return promise
      .then(() => {
        assert(false, 'should not be called');
      })
      .catch(err => {
        assert(err instanceof Error);
        assert(err.name, 'AbortError'); // specific to node-fetch
        assert.equal(err.message, 'Aborted'); // specific to node-fetch
      });
  });

});