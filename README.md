# backbone-fetch
[Backbone](https://backbonejs.org/) Model CRUD operations using ES6 `fetch`.  Can be used without `jQuery.ajax`.

## Install

```
npm i backbone-fetch
```

TODO cdn

## Usage

```js
require('backbone-fetch'); // or <scrip> or import ...

let model = new Backbone.Model({foo: 1});
model.save()
  .then(response => {...})
  .catch(error => {...});
```
Similar for other CRUD operations: `fetch()` & `destroy()`.

Note: it returns an ES6 **Promise**.  Use polyfill for older browsers.

To pass body and headers:
```js
model.save(null, {
  data: {...}  // JSON data to pass in HTTP body
  headers: {
    'Accept': 'application/json'
  }
})
  .then(response => {...})
  .catch(error => {...});
```

## Change log

- 0.1.0 Initial version

## License

ICS