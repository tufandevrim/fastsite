
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
		method: req.query.method || 'post'
	});	
};
exports.chromeposted = function(req, res){
	res.setHeader('Cache-Control', 'max-age=0');
	res.render('chromeposted', {
		title: 'Chrome Posted Page'
	});
};