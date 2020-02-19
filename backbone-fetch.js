/**
 * This is a fetch() --> Backbone.ajax interface.
 *
 * Inspired by https://gist.github.com/akre54/9891fc85ff46afd85814
 */

;(function() {

  // if (Backbone && Backbone.$ && Backbone.$.ajax) return;

  // From underscore.js:
  // Establish the root object, `window` (`self`) in the browser, `global`
  // on the server, or `this` in some virtual machines. We use `self`
  // instead of `window` for `WebWorker` support.
  var root = typeof self == 'object' && self.self === self && self ||
    typeof global == 'object' && global.global === global && global ||
    this ||
    {};


  var _ = Backbone._ || root._;
  var HTTP_NO_CONTENT = 204;

  function debug() {
    if (!Backbone.debugAjax) return;
    console.log.apply(console, ['backbone-fetch::'].concat(Array.prototype.slice.call(arguments)));
  }

  /**
   * isType<type> functions -- determine if given type is a particular mime type
   *
   * @property responseType {string} - if given, the requester's dataType CAN also match
   * @property requiredProp {string} - if given, requester's options[requireProp] MUST also be truthy
   *
   * Note: properties are used by the canReadyBody function
   *
   * @param type {string} mime type to check
   * @return {boolean} true if it is
   */
  var isTypeJson = function(type) {
    return /^application\/json/i.test(type);
  };
  // @https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/responseType
  // isTypeJson.responseType = 'json';  // Backbone sets default dataType to this -- so ignore.

  var isTypeText = function(type) {
    // e.g. Content-Type: application/pdf; encoding=base64;charset=UTF-8
    return /^text\//i.test(type) || /;\s*encoding=base64/i.test(type);
  };
  isTypeText.responseType = 'text';

  var isTypeBinary = function(type) {
    // e.g. Content-Type: application/pdf;charset=UTF-8  (without base64!)
    // So isTypeText should be checked first.
    return /^(application\/(pdf|octet-stream|ogg)|image|audio|video)/i.test(type);
  };
  isTypeBinary.responseType = 'arraybuffer';

  var isTypeFormData = function(type) {
    return /^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(type);
  };

  // for blob, type is immaterial; to get a blob, specify useBlob in options
  var isTypeBlob = function(type) {
    return true;
  };
  // must be specified to get a blob (hence this should come before binary type)
  isTypeBlob.requiredProp = 'useBlob';


  /**
   * Can the response be read for a particular type?
   *
   * @param response {Response} fetch() Response object
   * @param predicate {Function} determines if arg is of particular (mime) type
   * @return {boolean} true if it can
   */
  var canReadBody = function(response, predicate) {
    // prevent "body used already for:" error
    if (response.bodyUsed) return false;
    if (!predicate) return true; // nothing to check!

    // check both response and request headers to determine type
    var contentType = response.headers.get('content-type');  // headers are normalized to lowercase
    var accept = response.xhr.headers.Accept;  // request header

    // also check responseType from requester
    var responseType = predicate.responseType &&
      response.xhr.options.dataType === predicate.responseType;

    // if requiredProp is defined on the predicate, it MUST match
    // the requested dataType
    var requiredProp = !predicate.requiredProp ||
      !!response.xhr.options[predicate.requiredProp];

    return requiredProp && (predicate(contentType) ||
      (!contentType && predicate(accept)) ||
      responseType);
  };

  /**
   * Check if response body can be read for a particular mime type
   *
   * @param response {Response} fetch() Response object
   * @param predicate {Function} type matching function
   * @return {null|Promise<Response>} null if it can, otherwise the response as Promise
   */
  var validateBody = function (response, predicate) {
    if (canReadBody(response, predicate)) return null;
    return Promise.resolve(response);
  };

  /**
   * Convert data object to query params
   *
   * @param data {object} key-value pairs
   * @return {string}
   */
  var toQueryParams = function(data) {
    var query = '';
    for (var key in data) {
      if (!key || data[key] === null) continue;
      query += (query ? '&' : '')
        + encodeURIComponent(key) + '='
        + encodeURIComponent(data[key]);
    }
    return query;
  };

  /**
   * Attach query param to url
   *
   * @param url {string} the URL
   * @param data {object} key-value pairs
   * @return {string}
   */
  var stringifyGETParams = function (url, data) {
    var query = toQueryParams(data);
    if (query) url += (~url.indexOf('?') ? '&' : '?') + query;
    return url;
  };

  /**
   * <type>() functions -- read response body for particular type.
   *
   * 1. Make sure body stream hasn't been consumed yet
   * 2. Check for matching mime type
   * 3. Read the steam into response.xhr.response<type>
   *     @See https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest
   *
   * @param response {Response} the fetch() Response object
   * @return {Promise<Response>} chainable -- always return the response
   */

  var json = function (response) {
    return validateBody(response, isTypeJson) || response.json()
      .then(function (resp) {
        debug('json', response.status);
        response.xhr.responseJSON = resp;
        try {
          response.xhr.responseText = JSON.stringify(resp);
        } catch (e) {}
        return response;
      });
  };

  var text = function (response) {
    return validateBody(response, isTypeText) || response.text()
      .then(function (resp) {
        debug('text', response.status);
        response.xhr.responseText = resp;
        return response;
      });
  };

  var binary = function (response) {
    return validateBody(response, isTypeBinary) || response.arrayBuffer()
      .then(function (resp) {
        debug('array buffer', response.status);
        response.xhr.response = resp;
        return response;
      });
  };

  var formdata = function (response) {
    return validateBody(response, isTypeFormData) || response.formData()
      .then(function (resp) {
        debug('form data', response.xhr);
        response.xhr.response = resp;
        return response;
      });
  };

  var blob = function (response, overrideValidation) {
    return (!overrideValidation && validateBody(response, isTypeBlob)) || response.blob()
      .then(function (resp) {
        debug('blob', response.status);
        response.xhr.response = resp;
        return response;
      });
  };

  /**
   * Parse the Response body stream
   *
   * @param response {Response} the fetch() Response object
   * @return {Promise<Response>} chainable -- always return the response
   */
  var parseBody = function (response) {
    if (response.status === HTTP_NO_CONTENT) return Promise.resolve(response);
    return Promise.resolve(response)
      .then(blob)  // blob first!
      .then(json)
      .then(text)
      .then(binary)
      .then(formdata)
      // default to blob if none other match
      .then(function(response){
        return validateBody(response) || blob(response, /* override */true);
      });
  };

  /**
   * Get the parsed response body as processed by parseBody().
   *
   * @param response {Response} the fetch() Response object
   * @return {*} parsed response
   */
  var resolveBody = function(response) {
    return response.xhr.responseJSON ||
      response.xhr.responseText ||
      response.xhr.response ||
      '';
  };

  /**
   * Determine fetch() response's success/error based on HTTP status.
   *
   * @param response {Response} the fetch() Response object
   * @return {Response} if HTTP success
   * @throws {Response} if HTTP error
   */
  var status = function (response) {
    if (response.status >= 200 && response.status < 300) {
      return response;
    }
    throw response;
    // throw new Error(response.statusText);
  };

  var appJson = 'application/json';
  var validFetchOptions = ('method headers body mode credentials' +
    ' cache redirect referrer referrerPolicy integrity keepalive signal')
    .split(' ');

  /**
   * Backbone.ajax mapping function for fetch()
   *
   * @param options {object} @see Backbone
   * @return {Promise<any>}
   */
  Backbone.ajax = function (options) {
    var withBody = _.includes(['POST', 'PUT', 'PATCH'], options.type);

    if (options.type === 'GET' && typeof options.data === 'object') {
      options.url = stringifyGETParams(options.url, options.data);
      // fetch() GET can't have a body
      delete options.data;
    }

    /**
     *               --- IMPORTANT NOTE ---
     *
     * Default to json response if content-type (in response) or accept
     * headers aren't given.  If the server doesn't honor or send the
     * correct content-type, parseBody() function may fail at json().
     *
     * @example
     FetchError: invalid json response body at http://foo.bar/ reason: Unexpected end of JSON input
     at /Users/maleki/dev/gitcorp/js-rest-api-lib/node_modules/node-fetch/lib/index.js:241:32
     at process._tickCallback (internal/process/next_tick.js:68:7)
     message: 'invalid json response body at http://foo.bar/ reason: Unexpected end of JSON input',
     type: 'invalid-json' }
     *
     */

    var isFormData = options.data instanceof FormData;
    var headers = _.defaults(options.headers || {}, {
      Accept: appJson
    }, withBody && !isFormData ? {
      'Content-Type': appJson
    } : {});

    var body = options.data;

    if (!isFormData
      && typeof options.data !== 'string'
      && isTypeFormData(headers['Content-Type'])
    ) {
      body = toQueryParams(options.data);
    }

    var abortCtrl;
    if (typeof AbortController === 'function' && typeof AbortSignal === 'function') {
      abortCtrl = new AbortController();
    }

    var sanitizedOptions = _.pick(options, validFetchOptions);
    var promise = fetch(options.url, _.defaults(sanitizedOptions, {
      method  : options.type,
      headers : headers,
      body    : body,
      signal  : abortCtrl && abortCtrl.signal
    }));

    // define (pseudo) xhr
    var xhr = new Promise(function(resolve, reject) {
      promise.then(function (response) {
        // preserve options
        xhr.options = options;

        xhr.getResponseHeader = function (key) {
          return response.headers.get(key);
        };
        xhr.status = response.status;
        xhr.statusText = response.statusText;
        xhr.headers = xhr.headers || {};

        // preserve local xhr (promise)
        response.xhr = xhr;
        return response;
      })
        // success path
        .then(parseBody)  // should come before status
        .then(status)     // will throw for non-success HTTP status
        .then(resolveBody)
        .then(function (result) {
          debug('success', result);
          if (options.success) options.success.apply(this, [result]);
          resolve(result);
        })
        // error path
        .catch(function (response) {
          var result = response.xhr || response;
          // signature of Backbone's internal sync() error handler
          if (options.error) options.error.apply(this, [result, result.statusText]);
          reject(result);
        });
    });

    // Note: Backbone sets options.xhr
    xhr.headers = options.headers;

    // define abort() on xhr
    if (abortCtrl) {
      xhr.abort = function () {
        debug('aborting!');
        abortCtrl.abort();
      };
    }

    return xhr;
  };

})();
