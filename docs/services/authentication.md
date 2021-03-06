# The `authentication` service

The `authentication` service uses the [`feathers-authentication-signed`](https://www.npmjs.com/package/feathers-authentication-signed) plugin. The plugin sets up multiple authentication strategies: 
 - The `challenge-request` strategy
 - The `challenge` strategy

## The `challenge-request` strategy {#challenge-request}
{% method %}
The `challenge-request` strategy begins the authentication process.

{% sample lang="feathers" %}
```js
app.authenticate({
  strategy: 'challenge-request',
  email: '<email-address>',
  signature: '<signature>'
})
  .then(response => {
    // response === {
    //   challenge: '<challenge>',
    //   salt: '<salt'>
    // }
  })
```

{% sample lang="http" %}
```http
POST /authentication HTTP/1.1
Host: localhost:3030
Accept: application/json
Content-Type: application/json
Cache-Control: no-cache
Postman-Token: 2fe81cbd-2996-5aca-faa2-7c992123a928

{
	"strategy": "challenge-request",
	"email": "my@email.com",
	"signature": "1348h34908jew"
}
```
{% endmethod %}


{% method %}
## Something else {#install}

The first thing is to get the GitBook API client.


{% sample lang="feathers" %}
```js
$ npm install gitbook-api
```

{% sample lang="socket.io" %}
```js
$ go get github.com/GitbookIO/go-gitbook-api
```

{% sample lang="http" %}
```http
$ go get github.com/GitbookIO/go-gitbook-api
```
{% endmethod %}
