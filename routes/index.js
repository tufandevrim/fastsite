
/*
 * GET home page.
 */
exports.delay = function(req, res){
	var addlatency = req.param('addlatency') || 1000;
	//res.write('Hello\n');
	setInterval(function() {
		res.end(' Delayed ' + addlatency + ' ms');
	},addlatency);
};

exports.delay2 = function(req, res){
	var addlatency = req.param('addlatency') || 1000;
	 res.setHeader('Content-Type', 'text/html');
	//res.write('Hello\n');
	setInterval(function() {
		res.end('<html><head></head><body> Delayed ' + addlatency + ' ms' + ' <img src="http://fastsite.herokuapp.com/delayasset/6000/img6.jpeg"><img src="http://farm4.staticflickr.com/3746/11309185693_051751aa87_o.jpg"></body></html>');
	},addlatency);
};

exports.delayedAsstes = function(req, res){
	var fs = require('fs'),
		asset,
		addlatency = req.param('delay') || 1000,
		assetName = req.param('asset');// || 'header.png';

	asset = fs.readFileSync('./public/img/'+assetName);
	res.setHeader("Timing-Allow-Origin", "*");
	res.writeHead(200, {'Content-Type': 'image/png' });
	setInterval(function() {
		res.end(asset, 'binary');
		//res.end('Delayed: ' + addlatency + ' ms\nAsset: ' + assetName);
	},addlatency);
};

exports.cacheAsset = function(req, res){
	var fs = require('fs'),
		asset,
		addsecond = req.param('second') || 1000,
		assetName = req.param('asset');// || 'header.png';

	asset = fs.readFileSync('./public/img/'+assetName);
	res.setHeader('Cache-Control', 'max-age='+addsecond);
	res.writeHead(200, {'Content-Type': 'image/png' });
	res.end(asset, 'binary');
	
};


exports.hello = function(req, res){
	res.end('Hello world');
};


exports.maillogin = function(req, res){
	res.render('maillogin', {
		title: 'Mail Landing Page',
		action: req.query.action || 'maillogin2',
		method: req.query.method || 'post'
	});	
};
exports.maillogin2 = function(req, res){
	res.redirect('/mailmain');
};
exports.mailmain = function(req, res){
	res.redirect('/maillanding/neo/launch?.rand='+Math.floor((Math.random() * 100000) + 1));
};
exports.maillanding = function(req, res){
	res.setHeader('Cache-Control', 'max-age=0');
	res.render('maillanding', {
		title: 'Mail Landing Page'
	});
};


exports.chromeposter = function(req, res){
	res.render('chromeposter', {
		title: 'Chrome poster page',
		action: req.query.action || 'chromeposted',
		method: req.query.method || 'post',
		viaScript: req.query.script || false
	});	
};
exports.chromeposted = function(req, res){
	res.setHeader('Cache-Control', 'max-age=0');
	res.render('chromeposted', {
		title: 'Chrome Posted Page'
	});
};



exports.forcessl = function(req, res) {
	if(req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === "http") {
		res.redirect('https://fastsite.herokuapp.com/forcessl');
	} else {
		res.render('sslforce', {
			title: 'SSL Overhead Test'
		});
	}
};
exports.forcenossl = function(req, res) {
	res.render('sslforce', {
		title: 'SSL Overhead Test - no ssl'
	});
};
exports.forcesslhsts = function(req, res) {
	if(req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === "http") {
		//res.setHeader("Strict-Transport-Security", "max-age=60; includeSubDomains");
		res.setHeader("Strict-Transport-Security", "max-age=60");
		res.redirect(301, 'https://fastsite.herokuapp.com/forcesslhsts?showaft=1');
	} else {
		res.render('sslforce', {
			title: 'SSL Overhead Test- redirect hsts'
		});
	}
};



exports.mobilegs = function(req, res) {
	res.sendfile('./public/HLvsGSRedirect/gsmobile.html');
};
exports.mobilehl = function(req, res) {
	res.sendfile('./public/HLvsGSRedirect/hlmobile.html');
};
exports.mobilehlredirect = function(req, res) {
	res.redirect(302, 'https://fastsite.herokuapp.com/mobilehl');
};


exports.delayXHR = function(req, res){
	var addlatency = req.param('delay') || 1000;
	 res.setHeader('Content-Type', 'application/json');
	setInterval(function() {
		res.end('{delayed:' + addlatency + '}');
	},addlatency);
};

exports.delayBeacon = function(req, res){
	var addlatency = req.param('addlatency') || 1000;
	setInterval(function() {
		res.redirect(302, 'http://l.yimg.com/os/mit/media/m/base/images/transparent-649ba6f.png');
	},addlatency);
};






