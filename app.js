
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
app.get('/delayassetjs/:delay/:asset', routes.delayedAssetJS);
app.get('/cacheasset/:second/:asset', routes.cacheAsset);
app.get('/hello', routes.hello);

app.get('/maillogin', routes.maillogin);
app.get('/maillogin2', routes.maillogin2);
app.post('/maillogin2', routes.maillogin2);
app.get('/mailmain', routes.mailmain);
app.get('/maillanding/neo/launch', routes.maillanding);
app.post('/maillanding', routes.maillanding);
app.get('/maillanding', routes.maillanding);



app.get('/chromeposter', routes.chromeposter);
app.post('/chromeposted', routes.chromeposted);


app.get('/forcessl', routes.forcessl);
app.get('/forcenossl', routes.forcenossl);
app.get('/forcesslhsts', routes.forcesslhsts);

app.get('/mobilegs', routes.mobilegs);
app.get('/mobilehl', routes.mobilehl);
app.get('/mobilehlredirect', routes.mobilehlredirect);


app.get('/delayxhr/:delay', routes.delayXHR);






//==============================================================================================
var mongoEnabled = false;
var mongoose = require('mongoose');
var MongoStore = require('connect-mongo')(express);
var mongoUser = process.env.MONGODB_USERNAME;
var mongoPass = process.env.MONGODB_PASSWORD;
var monDB;

if (mongoUser && mongoPass) {
    monDB = mongoose.connect('mongodb://'+mongoUser+':'+mongoPass+'@ds061601.mongolab.com:61601/perf_entries', function (error) {
        if (error) {
            console.log('MONGO CONNECTION ERROR');
            console.log(error);
            mongoEnabled = false;
        } else {
            mongoEnabled = true;
            app.use(express.session({
                store: new MongoStore({
                    mongoose_connection: monDB.connection
                })
            }));
        }
    });
} else {
    console.log('NO MONGO Credentials');
}

var Schema = mongoose.Schema;
var PerfSchema = new Schema({
    timeToFirstByte:            Number,
    timeToLastByte:             Number,
    domInteractive:             Number,
    domContentLoaded:           Number,
    domComplete:                Number,
    timeBackend:                Number,
    timeFrontend:               Number,
    requests:                   Number,
    requestsToDomContentLoaded: Number,
    requestsToDomComplete:      Number,
    bodySize:                   Number,
    bodyHTMLSize:               Number,
    htmlCount:                  Number,
    htmlSize:                   Number,
    cssCount:                   Number,
    cssSize:                    Number,
    jsCount:                    Number,
    jsSize:                     Number,
    imageCount:                 Number,
    imageSize:                  Number,
    DOMelementsCount:           Number,
    DOMelementMaxDepth:         Number,
    cacheHits:                  Number,
    cacheMisses:                Number,
    notFound:                   Number,
    jsErrors:                   Number,
    redirects:                  Number,
    testId:                     String,
    url:                        String,
    scheduleId:                 Number,
    location:                   String,
    device:                     String,
    runs:                       Number,
    created:                    Date
});
var PerfModel = monDB.model('perf_entries', PerfSchema);

//Hard Coded Scheduled Tasks
var scheduledTasks = [
    {scheduleId:1, url:'https://www.google.com', runs: 1, device: 'desktop', schedule: {period:"minute", every: "2"}, location:'US'},
    {scheduleId:2, url:'https://www.yahoo.com', runs: 1, device: 'desktop', schedule: {period:"minute", every: "2"}, location:'US'}
];

//PMas Agents
var pmasAgents = {};

//Get scheduled tasks
app.get('/phantomas/getscheduledtask', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scheduledTasks));
});

//Set client status
app.post('/phantomas/setclientstatus', function(req, res) {
    var resResult = {
        status: 200
    };
    pmasAgents[req.body.clientUrl] = new Date();
    
    res.setHeader('Content-Type', 'application/json');
    if (req.body.canRunScheduleTasks && req.body.canRunScheduleTasks !== 'false') {
        resResult.scheduledTasks = scheduledTasks;
        res.end(JSON.stringify(resResult));
    } else {
        res.end(JSON.stringify(resResult));
    }
});

//Report a task
app.post('/phantomas/reporttaskresult', function(req, res) {
    var key;
    var metrics = req.body.taskResult.data.metrics;
    var recEntry;
    var resMetrics = {
        timeToFirstByte:            -1,
        timeToLastByte:             -1,
        domInteractive:             -1,
        domContentLoaded:           -1,
        domComplete:                -1,
        timeBackend:                -1,
        timeFrontend:               -1,
        requests:                   -1,
        requestsToDomContentLoaded: -1,
        requestsToDomComplete:      -1,
        bodySize:                   -1,
        bodyHTMLSize:               -1,
        htmlCount:                  -1,
        htmlSize:                   -1,
        cssCount:                   -1,
        cssSize:                    -1,
        jsCount:                    -1,
        jsSize:                     -1,
        imageCount:                 -1,
        imageSize:                  -1,
        DOMelementsCount:           -1,
        DOMelementMaxDepth:         -1,
        cacheHits:                  -1,
        cacheMisses:                -1,
        notFound:                   -1,
        jsErrors:                   -1,
        redirects:                  -1,
        testId:                     "",
        url:                        "",
        scheduleId:                 0,
        location:                   "US",
        device:                     "desktop",
        runs:                       1,
        created:                    new Date().getTime()
    };

    for(key in resMetrics) {
        if (resMetrics.hasOwnProperty(key) && metrics.hasOwnProperty(key)) {
            if(metrics[key] !== 'undefined') {
                resMetrics[key] = metrics[key];
            }
        }
    }

    resMetrics.testId = req.body.taskResult.testId;
    resMetrics.runs = req.body.taskResult.runs;
    resMetrics.device = req.body.taskResult.device;
    resMetrics.created = req.body.taskResult.created;
    resMetrics.url = req.body.taskResult.url;
    resMetrics.scheduleId = req.body.taskResult.scheduleId;

    res.setHeader('Content-Type', 'application/json');

    if (mongoEnabled) {
        recEntry = new PerfModel(resMetrics);
        res.json({status: 'success'});
        recEntry.save(function(err){
            if (err) {
                console.log(err);
                res.status(500).json({status:'failure'});
            } else {
                console.log("SUCCESS!!!!!!!!!!!!!!");
                res.json({status: 'success'});
            }
        });
    } else {
        res.status(500).json({status:'MONGO DB is not reachable'});
    }

});
//==============================================================================================



http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

