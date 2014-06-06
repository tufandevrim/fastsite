
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');

var app = express();

//Dust stuff
var dust_engine        = require('dustjs-linkedin');
var template_engine    = 'dust';

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');

//Set the template engine to dust
//Copied from https://github.com/chovy/express-template-demo/blob/master/demo/app.js
if ( template_engine == 'dust' ) {
    var dust = require('dustjs-linkedin'),
        cons = require('consolidate');
    app.engine('dust', cons.dust);
	app.set('template_engine', template_engine);
} 

app.set('view engine', template_engine);


app.use(express.compress());
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/delay', routes.delay);
app.get('/delay2', routes.delay2);
app.get('/delayasset/:delay/:asset', routes.delayedAsstes);
app.get('/hello', routes.hello);





app.get('/maillogin', routes.maillogin);
app.get('/maillogin2', routes.maillogin2);
app.post('/maillogin2', routes.maillogin2);
app.get('/mailmain', routes.mailmain);
app.get('/maillanding/neo/launch', routes.maillanding);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
